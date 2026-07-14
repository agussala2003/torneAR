-- ============================================================
-- G4 — get_player_leaderboard: clean_sheets + win_rate
-- (refactor 2026-07-14: formato auto-verificante)
-- ============================================================
-- Prueba las ramas clean_sheets y win_rate de la RPC
-- (20260713231611_g4_leaderboard_clean_sheets_win_rate.sql, hoy vigente vía
-- 20260714125138_leaderboard_wo_support.sql).
--
-- Todo corre en un BEGIN...ROLLBACK con escenario propio aislado por la zona
-- única 'ZG4_TEST'. Sólo referencia los perfiles del seed del repo
-- (supabase/seed.sql):
--   P1 : 33333333-3333-3333-3333-000000000001
--   Q  : 33333333-3333-3333-3333-000000000004
--
-- Escenario: TA le gana 3 partidos a TB.
--   m1: TA 2-0 (valla) · participan P1 y Q
--   m2: TA 3-1         · participa P1
--   m3: TA 1-0 (valla) · participa P1
-- Esperado: clean_sheets P1=2, Q=1 · win_rate P1=100, Q excluido (1 PJ < 3).
--
-- Auto-verificante: EXCEPTION "G4-n FALLÓ:" ante regresión.
-- Última corrida: 14 jul 2026 — los 4 casos OK (local y proyecto real).
-- ============================================================

BEGIN;
DO $$
DECLARE
  c_p1 CONSTANT uuid := '33333333-3333-3333-3333-000000000001';
  c_q  CONSTANT uuid := '33333333-3333-3333-3333-000000000004';
  v_ta uuid; v_tb uuid;
  v_m1 uuid; v_m2 uuid; v_m3 uuid;
  v_val bigint;
  v_n   integer;
BEGIN
  INSERT INTO teams (name, category, zone, preferred_format)
  VALUES ('TA_G4', 'HOMBRES', 'ZG4_TEST', 'FUTBOL_5') RETURNING id INTO v_ta;
  INSERT INTO teams (name, category, zone, preferred_format)
  VALUES ('TB_G4', 'HOMBRES', 'ZG4_TEST', 'FUTBOL_5') RETURNING id INTO v_tb;

  -- m1: TA 2-0 (valla TA); participan P1 y Q en TA.
  INSERT INTO matches (team_a_id, team_b_id, status) VALUES (v_ta, v_tb, 'FINALIZADO') RETURNING id INTO v_m1;
  INSERT INTO match_results (match_id, team_id, submitted_by, goals_scored, goals_against) VALUES
    (v_m1, v_ta, c_p1, 2, 0), (v_m1, v_tb, c_p1, 0, 2);
  INSERT INTO match_participants (match_id, profile_id, team_id) VALUES
    (v_m1, c_p1, v_ta), (v_m1, c_q, v_ta);

  -- m2: TA 3-1 (sin valla); participa P1.
  INSERT INTO matches (team_a_id, team_b_id, status) VALUES (v_ta, v_tb, 'FINALIZADO') RETURNING id INTO v_m2;
  INSERT INTO match_results (match_id, team_id, submitted_by, goals_scored, goals_against) VALUES
    (v_m2, v_ta, c_p1, 3, 1), (v_m2, v_tb, c_p1, 1, 3);
  INSERT INTO match_participants (match_id, profile_id, team_id) VALUES (v_m2, c_p1, v_ta);

  -- m3: TA 1-0 (valla TA); participa P1.
  INSERT INTO matches (team_a_id, team_b_id, status) VALUES (v_ta, v_tb, 'FINALIZADO') RETURNING id INTO v_m3;
  INSERT INTO match_results (match_id, team_id, submitted_by, goals_scored, goals_against) VALUES
    (v_m3, v_ta, c_p1, 1, 0), (v_m3, v_tb, c_p1, 0, 1);
  INSERT INTO match_participants (match_id, profile_id, team_id) VALUES (v_m3, c_p1, v_ta);

  -- ── 1/2. Clean sheets: P1 = 2 (m1, m3) · Q = 1 (m1, valla colectiva) ──────
  SELECT lb.value INTO v_val FROM get_player_leaderboard('clean_sheets', 'ZG4_TEST', NULL) lb WHERE lb.profile_id = c_p1;
  IF coalesce(v_val, 0) <> 2 THEN
    RAISE EXCEPTION 'G4-1 FALLÓ: clean_sheets de P1 = % (esperado 2)', v_val;
  END IF;
  SELECT lb.value INTO v_val FROM get_player_leaderboard('clean_sheets', 'ZG4_TEST', NULL) lb WHERE lb.profile_id = c_q;
  IF coalesce(v_val, 0) <> 1 THEN
    RAISE EXCEPTION 'G4-2 FALLÓ: clean_sheets de Q = % (esperado 1)', v_val;
  END IF;

  -- ── 3/4. Win rate: P1 = 100 (3/3 ≥ umbral) · Q excluido (1 PJ < 3) ────────
  SELECT lb.value INTO v_val FROM get_player_leaderboard('win_rate', 'ZG4_TEST', NULL) lb WHERE lb.profile_id = c_p1;
  IF coalesce(v_val, -1) <> 100 THEN
    RAISE EXCEPTION 'G4-3 FALLÓ: win_rate de P1 = % (esperado 100)', v_val;
  END IF;
  SELECT count(*) INTO v_n FROM get_player_leaderboard('win_rate', 'ZG4_TEST', NULL) lb WHERE lb.profile_id = c_q;
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'G4-4 FALLÓ: Q aparece en win_rate con % filas (umbral de 3 PJ roto)', v_n;
  END IF;

  RAISE NOTICE 'G4 OK: clean_sheets y win_rate correctos.';
END $$;
ROLLBACK;
