-- ============================================================
-- HISTORIAL DE TRANSFERENCIAS (2/4) — Motor — 2026-07-15
-- ------------------------------------------------------------
--   1. compute_stint_stats — derivación CANÓNICA de las stats de un ciclo
--      leyendo match_participants/match_results dentro de la ventana
--      [p_from, p_to]. Idempotente: sirve para el snapshot de cierre, para
--      las stats en vivo del ciclo vigente (get_player_career, 3/4) y para
--      recomputar si una disputa corrige un resultado post-cierre.
--   2. Triggers sobre team_members: AFTER INSERT abre ciclo, AFTER DELETE
--      lo cierra congelando el snapshot. Por trigger y no en RPCs: el
--      cliente hoy borra team_members directo (leaveTeam/kick/transferencia
--      de capitanía en lib/team-manage-data.ts) y así queda todo cubierto,
--      incluido un futuro mercado de pases.
--
-- Reglas de negocio (decisiones 2026-07-15):
--   · PJ = participante (is_guest = false) en partido FINALIZADO. Los WO
--     (WO_A/WO_B) NO cuentan como PJ individual.
--   · RANKING y AMISTOSO cuentan ambos, siempre desglosados.
--   · V/E/D sólo con ambos match_results cargados (paridad con la rama
--     win_rate de get_player_leaderboard).
--   · clean_sheets = valla invicta COLECTIVA (goals_against = 0 con el
--     jugador en cancha) — no hay posición por partido; paridad con la rama
--     clean_sheets del leaderboard.
--   · Motivo de salida: una RPC futura puede fijarlo con
--     set_config('tornear.leave_reason', '<valor>', true) en la MISMA
--     transacción del DELETE. Sin eso, default ABANDONO. Si el equipo ya no
--     existe al cerrar (cascade de teams), fuerza EQUIPO_DISUELTO.
-- ============================================================


-- ─── 1. Derivación canónica de stats de un ciclo ─────────────────────────────
-- p_to NULL = ciclo vigente (sin cota superior). La fecha de juego es
-- coalesce(finished_at, scheduled_at, created_at): los partidos históricos
-- insertados directamente en estado terminal no siempre tienen finished_at.
CREATE OR REPLACE FUNCTION public.compute_stint_stats(
  p_profile_id uuid,
  p_team_id    uuid,
  p_from       timestamptz,
  p_to         timestamptz
)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $$
  WITH played AS (
    SELECT
      m.match_type,
      m.season_id,
      mr_own.goals_against,
      mr_own.mvp_id,
      (SELECT coalesce(sum((s->>'goals')::integer), 0)
         FROM jsonb_array_elements(coalesce(mr_own.scorers, '[]'::jsonb)) s
        WHERE (s->>'profile_id')::uuid = p_profile_id) AS own_goals,
      CASE
        WHEN mr_own.id IS NULL OR mr_riv.id IS NULL         THEN NULL
        WHEN mr_own.goals_scored > mr_riv.goals_scored      THEN 'W'
        WHEN mr_own.goals_scored < mr_riv.goals_scored      THEN 'L'
        ELSE 'D'
      END AS outcome
    FROM match_participants mp
    JOIN matches m ON m.id = mp.match_id
    LEFT JOIN match_results mr_own
      ON mr_own.match_id = m.id AND mr_own.team_id = p_team_id
    LEFT JOIN match_results mr_riv
      ON mr_riv.match_id = m.id AND mr_riv.team_id <> p_team_id
    WHERE mp.profile_id = p_profile_id
      AND mp.team_id    = p_team_id
      AND mp.is_guest   = false
      AND m.status      = 'FINALIZADO'   -- WO_A/WO_B excluidos: no son PJ individual
      AND coalesce(m.finished_at, m.scheduled_at, m.created_at) >= p_from
      AND (p_to IS NULL OR coalesce(m.finished_at, m.scheduled_at, m.created_at) <= p_to)
  ),
  season_rows AS (
    SELECT
      p.season_id,
      s.name AS season_name,
      s.starts_at,
      count(*) FILTER (WHERE p.match_type = 'RANKING')      AS pj_ranking,
      count(*) FILTER (WHERE p.match_type = 'AMISTOSO')     AS pj_amistoso,
      coalesce(sum(p.own_goals), 0)                         AS goals,
      count(*) FILTER (WHERE p.mvp_id = p_profile_id)       AS mvps,
      count(*) FILTER (WHERE p.goals_against = 0)           AS clean_sheets,
      count(*) FILTER (WHERE p.outcome = 'W')               AS wins,
      count(*) FILTER (WHERE p.outcome = 'D')               AS draws,
      count(*) FILTER (WHERE p.outcome = 'L')               AS losses
    FROM played p
    LEFT JOIN seasons s ON s.id = p.season_id
    GROUP BY p.season_id, s.name, s.starts_at
  )
  SELECT jsonb_build_object(
    'total', (
      SELECT jsonb_build_object(
        'pj_ranking',   coalesce(sum(pj_ranking), 0),
        'pj_amistoso',  coalesce(sum(pj_amistoso), 0),
        'goals',        coalesce(sum(goals), 0),
        'mvps',         coalesce(sum(mvps), 0),
        'clean_sheets', coalesce(sum(clean_sheets), 0),
        'wins',         coalesce(sum(wins), 0),
        'draws',        coalesce(sum(draws), 0),
        'losses',       coalesce(sum(losses), 0)
      ) FROM season_rows
    ),
    'by_season', (
      SELECT coalesce(jsonb_agg(jsonb_build_object(
        'season_id',    season_id,
        'season_name',  season_name,   -- NULL = partidos sin temporada etiquetada
        'pj_ranking',   pj_ranking,
        'pj_amistoso',  pj_amistoso,
        'goals',        goals,
        'mvps',         mvps,
        'clean_sheets', clean_sheets,
        'wins',         wins,
        'draws',        draws,
        'losses',       losses
      ) ORDER BY starts_at DESC NULLS LAST), '[]'::jsonb)
      FROM season_rows
    ),
    'computed_at', now()
  );
$$;

COMMENT ON FUNCTION public.compute_stint_stats(uuid, uuid, timestamptz, timestamptz) IS
  'Verdad canónica de las stats de un ciclo jugador–equipo. El snapshot team_stints.stats es sólo caché de esta derivación.';

-- La invoca get_player_career (SECURITY INVOKER, 3/4) → authenticated necesita
-- EXECUTE. Es de sólo lectura y respeta RLS del invocador.
REVOKE EXECUTE ON FUNCTION public.compute_stint_stats(uuid, uuid, timestamptz, timestamptz) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.compute_stint_stats(uuid, uuid, timestamptz, timestamptz) TO authenticated;


-- ─── 2a. Apertura de ciclo ───────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.open_team_stint()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_team_name   text;
  v_shield_url  text;
BEGIN
  SELECT t.name, t.shield_url INTO v_team_name, v_shield_url
  FROM teams t WHERE t.id = NEW.team_id;
  IF NOT FOUND THEN
    RETURN NEW;  -- guarda defensiva; la FK de team_members lo hace imposible
  END IF;

  -- Se desnormaliza nombre/escudo YA al abrir: si el club se disuelve, el
  -- cierre ocurre durante el cascade y la fila de teams ya no existe.
  INSERT INTO team_stints (profile_id, team_id, team_name, shield_url, started_at)
  VALUES (NEW.profile_id, NEW.team_id, v_team_name, v_shield_url, NEW.joined_at)
  ON CONFLICT (profile_id, team_id) WHERE ended_at IS NULL DO NOTHING;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.open_team_stint() FROM PUBLIC;

DROP TRIGGER IF EXISTS trg_team_members_open_stint ON public.team_members;
CREATE TRIGGER trg_team_members_open_stint
  AFTER INSERT ON public.team_members
  FOR EACH ROW EXECUTE FUNCTION public.open_team_stint();


-- ─── 2b. Cierre de ciclo + snapshot ──────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.close_team_stint()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_stint       team_stints%rowtype;
  v_team_name   text;
  v_shield_url  text;
  v_team_exists boolean;
  v_reason      stint_leave_reason;
  v_now         timestamptz := now();
BEGIN
  SELECT * INTO v_stint
  FROM team_stints
  WHERE profile_id = OLD.profile_id
    AND team_id    = OLD.team_id
    AND ended_at IS NULL
  ORDER BY started_at DESC
  LIMIT 1
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN OLD;  -- membresía sin ciclo abierto (estado legado): no bloquear el DELETE
  END IF;

  -- Motivo de salida: variable de transacción fijada por una RPC en la misma
  -- transacción del DELETE; valores fuera del enum se ignoran.
  BEGIN
    v_reason := nullif(current_setting('tornear.leave_reason', true), '')::stint_leave_reason;
  EXCEPTION WHEN invalid_text_representation THEN
    v_reason := NULL;
  END;

  -- Si el equipo ya no existe (DELETE de teams cascadeando a team_members),
  -- el motivo real es la disolución, gane quien gane la variable de sesión.
  SELECT t.name, t.shield_url, true INTO v_team_name, v_shield_url, v_team_exists
  FROM teams t WHERE t.id = OLD.team_id;
  IF NOT FOUND THEN
    v_team_exists := false;
    v_reason := 'EQUIPO_DISUELTO';
  END IF;

  UPDATE team_stints SET
    ended_at          = v_now,
    leave_reason      = coalesce(v_reason, 'ABANDONO'),
    last_role         = OLD.role,
    -- refresco del nombre/escudo si el club sigue existiendo (pudo renombrarse
    -- durante el ciclo); si no, queda el valor capturado a la apertura
    team_name         = CASE WHEN v_team_exists THEN v_team_name  ELSE team_name  END,
    shield_url        = CASE WHEN v_team_exists THEN v_shield_url ELSE shield_url END,
    stats             = compute_stint_stats(OLD.profile_id, OLD.team_id, v_stint.started_at, v_now),
    stats_computed_at = v_now
  WHERE id = v_stint.id;

  RETURN OLD;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.close_team_stint() FROM PUBLIC;

DROP TRIGGER IF EXISTS trg_team_members_close_stint ON public.team_members;
CREATE TRIGGER trg_team_members_close_stint
  AFTER DELETE ON public.team_members
  FOR EACH ROW EXECUTE FUNCTION public.close_team_stint();
