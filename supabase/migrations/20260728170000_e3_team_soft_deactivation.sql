-- ============================================================
-- E3/E2 — BAJA LÓGICA DE EQUIPOS (`teams.is_active`) — 2026-07-28
-- ------------------------------------------------------------
-- Hallazgo (auditoria_dominio.md, E3 🟠 con arrastre de E2 🟠):
--   El capitán único de un equipo con historial deportivo quedaba atrapado:
--     1. leave_team_as_member lo rechaza          → CAPTAIN_MUST_TRANSFER
--     2. transfer_captaincy_and_leave necesita otro miembro → no hay
--     3. deleteTeam falla con 23503 si hay partidos/resultados/reclamos
--        (esos FK son NO ACTION a propósito: cascadearlos borraría partidos
--        que también le pertenecen al rival)
--   El mensaje de error que veía era correcto —"Podés dejarlo inactivo sin
--   borrarlo"— salvo que DEJARLO INACTIVO NO EXISTÍA COMO FUNCIONALIDAD.
--
--   Y sin ese estado, un equipo disuelto (E2) seguía apareciendo en el
--   Ranking, en el Mercado y como rival desafiable, conservando su ELO.
--
-- ── Diseño ──────────────────────────────────────────────────────────────────
-- Baja LÓGICA, no borrado: el historial deportivo es compartido con los
-- rivales y tiene que sobrevivir. `is_active = false` significa "este equipo
-- ya no compite": desaparece de las superficies de emparejamiento (ranking,
-- búsqueda, mercado, desafíos) pero conserva su ELO, sus partidos y su
-- ledger de traspasos. Es reversible.
--
--   1. Columna `teams.is_active` (default true → ningún equipo cambia de
--      estado al aplicar esta migración).
--   2. GRANT UPDATE por columna. ⚠️ Sin esto el fix del cliente falla con
--      42501: 20260719130000 revocó el UPDATE a nivel tabla sobre `teams` y
--      lo repuso columna por columna (defensa de elo_rating/fair_play_score,
--      que NO es RLS sino privilegio de columna). Una columna nueva no hereda
--      nada.
--   3. get_team_ranking / search_teams / v_team_ranking → excluyen inactivos.
--   4. send_challenge → no se puede desafiar a un equipo inactivo, ni
--      desafiar desde uno. Sin esto, un equipo oculto del ranking seguía
--      siendo alcanzable desde una pantalla vieja o desde el H2H.
--
-- El Mercado se filtra del lado del cliente (lib/market-api.ts, embed
-- `teams!inner` + eq is_active): esas consultas no pasan por ninguna RPC.
-- ============================================================


-- ═══════════════════════════════════════════════════════════════
-- 1. Columna
-- ═══════════════════════════════════════════════════════════════
ALTER TABLE public.teams
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.teams.is_active IS
  'false = equipo dado de baja (disuelto/inactivo). Conserva historial, ELO y ledger, pero queda fuera del ranking, la búsqueda, el mercado y los desafíos. Reversible por el capitán desde la gestión del equipo.';

-- Sin índice a propósito: la enorme mayoría de las filas queda en `true`, así
-- que un índice sobre esta columna no descarta trabajo en las queries de
-- ranking/búsqueda y sólo agrega costo de escritura.


-- ═══════════════════════════════════════════════════════════════
-- 2. Privilegio de columna (ver nota 2 del encabezado)
-- ═══════════════════════════════════════════════════════════════
-- Aditivo: no toca las columnas ya otorgadas por 20260719130000. La RLS que
-- decide QUIÉN puede escribir sigue siendo `teams_update_by_captain`
-- (CAPITAN/SUBCAPITAN del equipo).
GRANT UPDATE (is_active) ON public.teams TO authenticated;


-- ═══════════════════════════════════════════════════════════════
-- 3. Superficies de emparejamiento: ranking y búsqueda
-- ═══════════════════════════════════════════════════════════════
-- Cuerpos idénticos a 20260714202000_prod_parity_gap_rpcs.sql + el filtro.
CREATE OR REPLACE FUNCTION public.get_team_ranking(
  p_zone     text          DEFAULT NULL::text,
  p_category team_category DEFAULT NULL::team_category,
  p_format   team_format   DEFAULT NULL::team_format
)
 RETURNS TABLE(rank_position bigint, team_id uuid, team_name text, shield_url text, zone text, category team_category, preferred_format team_format, elo_rating integer, fair_play_score numeric, season_wins integer, season_losses integer, season_draws integer, matches_played integer)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    row_number() over (order by t.elo_rating desc)::bigint,
    t.id, t.name, t.shield_url, t.zone, t.category, t.preferred_format, t.elo_rating,
    t.fair_play_score, t.season_wins, t.season_losses, t.season_draws, t.matches_played
  FROM teams t
  WHERE t.is_active
    AND (p_zone IS NULL OR t.zone = p_zone)
    AND (p_category IS NULL OR t.category = p_category)
    AND (p_format IS NULL OR t.preferred_format = p_format)
  ORDER BY t.elo_rating DESC;
$function$;

CREATE OR REPLACE FUNCTION public.search_teams(
  p_search   text          DEFAULT NULL::text,
  p_zone     text          DEFAULT NULL::text,
  p_category team_category DEFAULT NULL::team_category,
  p_format   team_format   DEFAULT NULL::team_format,
  p_min_elo  integer       DEFAULT 0,
  p_max_elo  integer       DEFAULT 9999
)
 RETURNS TABLE(team_id uuid, team_name text, shield_url text, zone text, category team_category, preferred_format team_format, elo_rating integer, fair_play_score numeric, season_wins integer, season_losses integer, season_draws integer, matches_played integer, in_ranking boolean)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select
    t.id, t.name, t.shield_url, t.zone, t.category, t.preferred_format, t.elo_rating,
    t.fair_play_score, t.season_wins, t.season_losses, t.season_draws, t.matches_played, t.in_ranking
  from teams t
  where t.is_active
    and (p_search is null or p_search = '' or t.name ilike '%' || p_search || '%')
    and (p_zone is null or t.zone = p_zone)
    and (p_category is null or t.category = p_category)
    and (p_format is null or t.preferred_format = p_format)
    and t.elo_rating between p_min_elo and p_max_elo
  order by t.elo_rating desc limit 50;
$function$;

-- Vista legacy del schema inicial. Hoy no la consume el cliente (el Ranking va
-- por las dos RPCs de arriba), pero se mantiene coherente para que cualquier
-- consumidor futuro —o una consulta de soporte— no reviva equipos dados de baja.
CREATE OR REPLACE VIEW public.v_team_ranking AS
SELECT
  t.id,
  t.name,
  t.zone,
  t.category,
  t.preferred_format,
  t.shield_url,
  t.elo_rating,
  t.fair_play_score,
  t.in_ranking,
  t.season_wins    AS wins,
  t.season_losses  AS losses,
  t.season_draws   AS draws,
  t.season_goals_for     AS goals_for,
  t.season_goals_against AS goals_against,
  t.season_goals_for - t.season_goals_against AS goal_diff,
  (t.season_wins * 3 + t.season_draws) AS points,
  row_number() over (
    partition by t.zone, t.category
    order by t.elo_rating desc
  ) AS zone_rank
FROM teams t
WHERE t.in_ranking = true
  AND t.is_active;


-- ═══════════════════════════════════════════════════════════════
-- 4. send_challenge — un equipo dado de baja no juega
-- ═══════════════════════════════════════════════════════════════
-- Cuerpo idéntico a 20260328151309_send_challenge_rpc.sql + el bloque 2b.
-- ⚠️ El literal 'No autorizado' del bloque 2 lo verifica
-- supabase/tests/100-rls-security.spec.sql (P1-1): no cambiar ese texto.
CREATE OR REPLACE FUNCTION public.send_challenge(
  p_from_team_id uuid,
  p_to_team_id   uuid,
  p_match_type   text
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_profile_id    uuid;
  v_season_id     uuid;
  v_challenge_id  uuid;
  v_from_elo      integer;
  v_to_elo        integer;
  v_elo_diff_warn boolean := false;
  v_shared_count  integer;
  v_recent_count  integer;
  v_season_count  integer;
  v_from_active   boolean;
  v_to_active     boolean;
BEGIN
  -- ── 1. Resolver perfil del usuario ────────────────────────
  SELECT id INTO v_profile_id FROM profiles WHERE auth_user_id = auth.uid();
  IF v_profile_id IS NULL THEN
    RAISE EXCEPTION 'Perfil no encontrado para el usuario actual';
  END IF;

  -- ── 2. Autorización: solo CAPITAN/SUBCAPITAN del equipo atacante ──
  IF NOT EXISTS (
    SELECT 1 FROM team_members
    WHERE team_id   = p_from_team_id
      AND profile_id = v_profile_id
      AND role IN ('CAPITAN', 'SUBCAPITAN')
  ) THEN
    RAISE EXCEPTION 'No autorizado: solo el capitán o subcapitán puede enviar un desafío';
  END IF;

  -- ── 2b. Equipos dados de baja (E3) ─────────────────────────
  -- Ocultarlos del ranking no alcanza: el desafío también se puede disparar
  -- desde la ficha del equipo (team-stats) o desde una pantalla ya cargada.
  SELECT is_active INTO v_from_active FROM teams WHERE id = p_from_team_id;
  SELECT is_active INTO v_to_active   FROM teams WHERE id = p_to_team_id;

  IF v_from_active IS NULL OR v_to_active IS NULL THEN
    RAISE EXCEPTION 'TEAM_NOT_FOUND: alguno de los equipos no existe';
  END IF;
  IF NOT v_from_active THEN
    RAISE EXCEPTION 'TEAM_INACTIVE: tu equipo está dado de baja. Reactivalo desde la gestión del equipo para volver a competir.';
  END IF;
  IF NOT v_to_active THEN
    RAISE EXCEPTION 'TEAM_INACTIVE: ese equipo está dado de baja y no puede recibir desafíos.';
  END IF;

  -- ── 3. No enviar si ya hay un desafío activo entre estos equipos ──
  IF EXISTS (
    SELECT 1 FROM challenges
    WHERE status = 'ENVIADA'
      AND (
        (from_team_id = p_from_team_id AND to_team_id = p_to_team_id)
        OR
        (from_team_id = p_to_team_id   AND to_team_id = p_from_team_id)
      )
  ) THEN
    RAISE EXCEPTION 'Ya hay un desafío activo con este equipo. Esperá que sea respondido o cancelado primero.';
  END IF;

  -- ── 4. Validaciones específicas de RANKING ─────────────────
  IF p_match_type = 'RANKING' THEN

    -- 4a. Anti-farming: ≥2 jugadores en común
    SELECT COUNT(*) INTO v_shared_count
    FROM team_members tm1
    JOIN team_members tm2 ON tm2.profile_id = tm1.profile_id
    WHERE tm1.team_id = p_from_team_id
      AND tm2.team_id = p_to_team_id;

    IF v_shared_count >= 2 THEN
      RAISE EXCEPTION 'Los equipos comparten % jugadores. No se permiten partidos de ranking entre ellos.', v_shared_count;
    END IF;

    -- 4b. Cooldown: partido de ranking finalizado en los últimos 30 días
    SELECT COUNT(*) INTO v_recent_count
    FROM matches
    WHERE match_type = 'RANKING'
      AND status IN ('FINALIZADO', 'WO_A', 'WO_B')
      AND created_at >= now() - INTERVAL '30 days'
      AND (
        (team_a_id = p_from_team_id AND team_b_id = p_to_team_id)
        OR
        (team_a_id = p_to_team_id   AND team_b_id = p_from_team_id)
      );

    IF v_recent_count > 0 THEN
      RAISE EXCEPTION 'Deben pasar 30 días desde el último partido de ranking entre estos equipos.';
    END IF;

    -- 4c. Límite de temporada: máximo 3 partidos de ranking por temporada
    SELECT id INTO v_season_id FROM seasons WHERE is_active = true LIMIT 1;

    IF v_season_id IS NOT NULL THEN
      SELECT COUNT(*) INTO v_season_count
      FROM matches
      WHERE match_type = 'RANKING'
        AND season_id   = v_season_id
        AND status IN ('PENDIENTE', 'CONFIRMADO', 'EN_VIVO', 'FINALIZADO', 'EN_DISPUTA', 'WO_A', 'WO_B')
        AND (
          (team_a_id = p_from_team_id AND team_b_id = p_to_team_id)
          OR
          (team_a_id = p_to_team_id   AND team_b_id = p_from_team_id)
        );

      IF v_season_count >= 3 THEN
        RAISE EXCEPTION 'Máximo 3 partidos de ranking por temporada entre los mismos equipos.';
      END IF;
    END IF;

    -- 4d. ELO diff (informativo, no bloqueante)
    SELECT elo_rating INTO v_from_elo FROM teams WHERE id = p_from_team_id;
    SELECT elo_rating INTO v_to_elo   FROM teams WHERE id = p_to_team_id;
    v_elo_diff_warn := abs(coalesce(v_from_elo, 1000) - coalesce(v_to_elo, 1000)) > 400;

  END IF;

  -- ── 5. INSERT del desafío ──────────────────────────────────
  INSERT INTO challenges (from_team_id, to_team_id, created_by, match_type, status)
  VALUES (
    p_from_team_id,
    p_to_team_id,
    v_profile_id,
    p_match_type::match_type,
    'ENVIADA'
  )
  RETURNING id INTO v_challenge_id;

  RETURN json_build_object(
    'challengeId',    v_challenge_id,
    'eloDiffWarning', v_elo_diff_warn
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.send_challenge(uuid, uuid, text) TO authenticated;
