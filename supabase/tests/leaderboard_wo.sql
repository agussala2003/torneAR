-- ============================================================
-- LEADERBOARD + WO — REGRESIÓN del audit 360° 2026-07-13 (Rojo #4 funcional)
-- ============================================================
-- Qué es esto: valida que los goleadores y el MVP cargados en un reclamo de
-- WO (G6) y aprobados por el admin (resolve_wo_claim) ahora SÍ computan en
-- get_player_leaderboard, y que SOLO computa el equipo ganador.
-- Requiere aplicadas 20260714_leaderboard_wo_support.sql (y el hotfix +
-- unificación de ELO previos).
--
-- Flujo simulado (fiel al de producción, todo dentro de BEGIN...ROLLBACK):
--   1. Dos equipos nuevos en una zona única '__TEST_WO_LB' (aísla las
--      aserciones de los datos reales vía el filtro p_zone).
--   2. Partido RANKING CONFIRMADO + participantes con check-in del ganador
--      y un participante del equipo ausente.
--   3. Reclamo de WO con scorers (capitán 2 goles + jugador2 1 gol) y MVP.
--   4. Aprobación vía resolve_wo_claim (como admin real por auth.uid()).
--   5. Aserciones sobre las ramas goals / mvps / clean_sheets / matches.
--
-- IDs de seed usados (si el seed cambia, actualizar acá):
--   capitán / scorer 1 / MVP : 33333333-3333-3333-3333-000000000004
--     auth uid               : aaaaaaaa-0000-0000-0000-000000000004
--   scorer 2                 : 33333333-3333-3333-3333-000000000001
--   participante del ausente : 33333333-3333-3333-3333-000000000007
--
-- Cómo leer el resultado: auto-verificante; EXCEPTION "Lx FALLÓ:" si la
-- regresión reapareció, NOTICE "Lx OK:" si el fix sigue vigente.
--
-- Última corrida: 14 jul 2026 — L1-L5 OK contra el proyecto real.
-- ============================================================

BEGIN;
SELECT set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-000000000004"}', true);
DO $$
DECLARE
  c_cap    CONSTANT uuid := '33333333-3333-3333-3333-000000000004';
  c_p2     CONSTANT uuid := '33333333-3333-3333-3333-000000000001';
  c_absent CONSTANT uuid := '33333333-3333-3333-3333-000000000007';
  v_winner uuid;
  v_loser  uuid;
  v_match  uuid;
  v_season uuid;
  v_claim  uuid;
  v_val    bigint;
BEGIN
  -- Setup: admin transaccional + escenario en zona aislada.
  UPDATE public.profiles SET is_admin = true WHERE id = c_cap;
  SELECT id INTO v_season FROM seasons WHERE is_active = true LIMIT 1;

  INSERT INTO teams (name, category, zone, preferred_format)
  VALUES ('__TEST WO LB GANADOR', 'MIXTO', '__TEST_WO_LB', 'FUTBOL_5') RETURNING id INTO v_winner;
  INSERT INTO teams (name, category, zone, preferred_format)
  VALUES ('__TEST WO LB AUSENTE', 'MIXTO', '__TEST_WO_LB', 'FUTBOL_5') RETURNING id INTO v_loser;

  INSERT INTO matches (team_a_id, team_b_id, match_type, status, scheduled_at, season_id)
  VALUES (v_winner, v_loser, 'RANKING', 'CONFIRMADO', now(), v_season)
  RETURNING id INTO v_match;

  -- Participantes: 2 del ganador (con check-in) + 1 del ausente.
  INSERT INTO match_participants (match_id, team_id, profile_id, did_checkin) VALUES
    (v_match, v_winner, c_cap,    true),
    (v_match, v_winner, c_p2,     true),
    (v_match, v_loser,  c_absent, false);

  -- Reclamo de WO con goleadores + MVP y aprobación por el admin.
  INSERT INTO wo_claims (match_id, claimed_by, claiming_team_id, photo_url, reason, status, scorers, mvp_id)
  VALUES (
    v_match, c_cap, v_winner, 'evidencia.jpg', 'rival ausente', 'PENDIENTE_REVISION',
    jsonb_build_array(
      jsonb_build_object('profile_id', c_cap, 'goals', 2),
      jsonb_build_object('profile_id', c_p2,  'goals', 1)
    ),
    c_cap
  )
  RETURNING id INTO v_claim;

  PERFORM public.resolve_wo_claim(v_claim, true, 'aprobado en test');

  -- ── L1. goals: los goleadores del WO suman ──────────────────────────────────
  SELECT lb.value INTO v_val
    FROM public.get_player_leaderboard('goals', '__TEST_WO_LB') lb
   WHERE lb.profile_id = c_cap;
  IF v_val IS DISTINCT FROM 2 THEN
    RAISE EXCEPTION 'L1 FALLÓ: capitán con % goles en el ranking (esperado 2)', v_val;
  END IF;
  SELECT lb.value INTO v_val
    FROM public.get_player_leaderboard('goals', '__TEST_WO_LB') lb
   WHERE lb.profile_id = c_p2;
  IF v_val IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION 'L1 FALLÓ: jugador2 con % goles en el ranking (esperado 1)', v_val;
  END IF;
  RAISE NOTICE 'L1 OK: goleadores del WO aprobado suman en el ranking.';

  -- ── L2. mvps: el MVP del WO suma ────────────────────────────────────────────
  SELECT lb.value INTO v_val
    FROM public.get_player_leaderboard('mvps', '__TEST_WO_LB') lb
   WHERE lb.profile_id = c_cap;
  IF v_val IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION 'L2 FALLÓ: MVP del WO con valor % (esperado 1)', v_val;
  END IF;
  RAISE NOTICE 'L2 OK: MVP del WO aprobado suma en el ranking.';

  -- ── L3. clean_sheets: la valla invicta del 3-0 computa para el ganador ─────
  SELECT lb.value INTO v_val
    FROM public.get_player_leaderboard('clean_sheets', '__TEST_WO_LB') lb
   WHERE lb.profile_id = c_cap;
  IF v_val IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION 'L3 FALLÓ: valla invicta del WO con valor % (esperado 1)', v_val;
  END IF;
  RAISE NOTICE 'L3 OK: valla invicta del WO computa para el ganador.';

  -- ── L4. matches: el ganador suma PJ ─────────────────────────────────────────
  SELECT lb.value INTO v_val
    FROM public.get_player_leaderboard('matches', '__TEST_WO_LB') lb
   WHERE lb.profile_id = c_p2;
  IF v_val IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION 'L4 FALLÓ: participante del ganador con % PJ (esperado 1)', v_val;
  END IF;
  RAISE NOTICE 'L4 OK: participantes del ganador suman partidos jugados.';

  -- ── L5. El equipo AUSENTE no computa en ninguna rama ────────────────────────
  IF EXISTS (
    SELECT 1 FROM public.get_player_leaderboard('matches', '__TEST_WO_LB') lb
     WHERE lb.profile_id = c_absent
  ) OR EXISTS (
    SELECT 1 FROM public.get_player_leaderboard('clean_sheets', '__TEST_WO_LB') lb
     WHERE lb.profile_id = c_absent
  ) THEN
    RAISE EXCEPTION 'L5 FALLÓ: el participante del equipo ausente computó en el leaderboard';
  END IF;
  RAISE NOTICE 'L5 OK: el equipo ausente no suma nada.';
END $$;
ROLLBACK;
