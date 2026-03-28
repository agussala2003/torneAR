-- ============================================================
-- FASE 1.5: RPC send_challenge — validaciones de ranking en backend
-- Fecha: 2026-03-28
-- Reporte: docs/auditoria.md — Ítem 1
-- ============================================================
--
-- Mueve al backend las siguientes validaciones que antes corrían
-- solo en el cliente (bypasseables con llamadas directas a la API):
--   • Autenticación: solo CAPITAN/SUBCAPITAN del equipo atacante
--   • Desafío activo: no enviar si ya hay uno ENVIADA entre los mismos equipos
--   • Anti-farming (solo RANKING): bloquear si ≥2 jugadores en común
--   • Cooldown 30 días (solo RANKING): último partido de ranking entre estos dos equipos
--   • Límite de temporada (solo RANKING): máximo 3 por temporada entre los mismos equipos
--
-- Retorna: { challengeId uuid, eloDiffWarning boolean }
-- El campo eloDiffWarning es informativo (no bloqueante): diferencia de ELO > 400.
-- ============================================================

CREATE OR REPLACE FUNCTION public.send_challenge(
  p_from_team_id uuid,
  p_to_team_id   uuid,
  p_match_type   text   -- 'RANKING' | 'AMISTOSO'
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
