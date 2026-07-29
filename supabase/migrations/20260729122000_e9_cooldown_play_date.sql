-- ============================================================
-- E9 — EL COOLDOWN DE 30 DÍAS SE MIDE SOBRE LA FECHA DE JUEGO — 2026-07-29
-- ------------------------------------------------------------
-- Hallazgo (auditoria_dominio.md · E9 🔵):
--   El bloque 4b de `send_challenge` filtraba `created_at >= now() - 30 days`
--   sobre `matches`. `created_at` es cuándo se CREÓ la fila —normalmente al
--   aceptar el desafío—, no cuándo se jugó el partido. Un partido creado hace
--   31 días pero jugado ayer NO disparaba el cooldown: exactamente el
--   escenario que el anti-farming quiere impedir, y encima el más fácil de
--   producir (basta con demorar la coordinación un mes).
--
-- ── Qué cambia ──────────────────────────────────────────────────────────────
--   antes:  created_at                       >= now() - interval '30 days'
--   ahora:  coalesce(finished_at,
--                    scheduled_at,
--                    created_at)             >= now() - interval '30 days'
--
-- El orden del `coalesce` es el de la precisión decreciente:
--   · `finished_at` — cuándo terminó de verdad. Es el dato correcto y existe en
--     todo partido FINALIZADO (lo sella apply_match_outcome).
--   · `scheduled_at` — la hora pactada. Es lo que hay en los WO_A/WO_B, que
--     entran en el filtro y no siempre pasan por `finished_at`.
--   · `created_at` — último recurso. Se conserva a propósito: sin él, una fila
--     con las otras dos en NULL saldría del filtro y el cooldown quedaría
--     silenciosamente desactivado para ese par de equipos. Ante la duda, la
--     regla se aplica.
--
-- Efecto práctico: el cooldown se vuelve **más estricto**, que es la dirección
-- correcta para una regla anti-farming. Un partido creado hace 40 días y jugado
-- la semana pasada ahora bloquea el desafío; antes lo dejaba pasar.
--
-- ── Se restaura el advisory lock (regresión de la migración de E3) ──────────
-- `20260328165650` (CRÍTICO-3c) había agregado `pg_advisory_xact_lock` sobre el
-- par de equipos para serializar el chequeo de "no hay desafío activo", que es
-- un chequeo de NO-existencia y por eso no se puede proteger con FOR UPDATE.
-- La migración `20260728170000` (E3) reescribió la función tomando como base el
-- cuerpo de `20260328151309` —anterior al parche— y el lock quedó afuera. El
-- índice único parcial `uq_challenges_active_pair` seguía sosteniendo la
-- invariante, así que no se perdió integridad, pero el error que veía el
-- usuario dejaba de ser el mensaje explicativo y pasaba a ser un 23505 crudo.
-- Como esta migración vuelve a reescribir la función entera, se aprovecha para
-- reponerlo.
-- ============================================================

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
  -- ⚠️ El literal 'No autorizado' lo verifica supabase/tests/100-rls-security.spec.sql
  -- (P1-1): no cambiar ese texto.
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

  -- ── 2c. Advisory lock transaccional sobre el par de equipos ───────────────
  -- Serializa llamadas concurrentes con el mismo par: el chequeo del bloque 3
  -- es de NO-existencia, así que dos transacciones simultáneas podían pasarlo
  -- las dos. El lock se libera solo al terminar la transacción. Segunda capa:
  -- el índice único parcial `uq_challenges_active_pair`.
  PERFORM pg_advisory_xact_lock(
    42,
    hashtext(
      LEAST(p_from_team_id::text, p_to_team_id::text) ||
      '|' ||
      GREATEST(p_from_team_id::text, p_to_team_id::text)
    )
  );

  -- ── 3. No enviar si ya hay un desafío activo entre estos equipos ──
  -- E8: un ENVIADA sin responder ya no bloquea para siempre — el barrido
  -- horario lo pasa a RECHAZADA a los `sweep_challenge_expiry_days` días.
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

    -- 4b. Cooldown: partido de ranking JUGADO en los últimos 30 días (E9).
    -- La fecha relevante para el anti-farming es cuándo se jugó, no cuándo se
    -- creó la fila: ver el encabezado de esta migración.
    SELECT COUNT(*) INTO v_recent_count
    FROM matches
    WHERE match_type = 'RANKING'
      AND status IN ('FINALIZADO', 'WO_A', 'WO_B')
      AND coalesce(finished_at, scheduled_at, created_at) >= now() - INTERVAL '30 days'
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

COMMENT ON FUNCTION public.send_challenge(uuid, uuid, text) IS
  'Envía un desafío con todas las validaciones server-side. E3: rechaza equipos dados de baja. E9: el cooldown de 30 días se mide sobre coalesce(finished_at, scheduled_at, created_at), no sobre la creación de la fila.';

-- Índice de apoyo del cooldown: el filtro dejó de ser sargable sobre una sola
-- columna, así que se indexa la expresión exacta que usa el WHERE.
CREATE INDEX IF NOT EXISTS idx_matches_ranking_played_at
  ON public.matches ((coalesce(finished_at, scheduled_at, created_at)))
  WHERE match_type = 'RANKING' AND status IN ('FINALIZADO', 'WO_A', 'WO_B');

REVOKE EXECUTE ON FUNCTION public.send_challenge(uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.send_challenge(uuid, uuid, text) TO authenticated;
