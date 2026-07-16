-- ============================================================
-- MOTOR DE ELO UNIFICADO — REGRESIÓN del audit 360° 2026-07-13
-- ============================================================
-- Qué es esto: pruebas de regresión del fix ROJO #1 (doble motor de ELO).
-- Requiere aplicada la migración 20260713_elo_engine_unification.sql.
--
-- Demuestra matemáticamente que un partido incrementa ELO, matches_played
-- y goles exactamente UNA vez:
--   E1 — Partido RANKING completo (carga de ambos resultados via el trigger
--        de match_results): stats 1x, ELO ±20 exacto (K=40, ratings iguales),
--        exactamente 2 filas en elo_history.
--   E2 — Idempotencia: re-ejecutar resolve_match y re-updatear el status del
--        partido ya FINALIZADO no vuelve a acumular nada.
--   E3 — WO_A: 3-0, stats 1x, ELO ±20, 2 filas de historial.
--   E4 — AMISTOSO: cuenta stats (empate) pero NO mueve ELO ni escribe
--        elo_history.
--
-- Cada bloque corre en BEGIN...ROLLBACK: no persiste nada. Todos los datos
-- (equipos y partidos) se crean dentro de la transacción — no depende del
-- seed, salvo el perfil usado como submitted_by:
--   perfil seed: 33333333-3333-3333-3333-000000000004
--
-- Cómo leer el resultado: bloques auto-verificantes; EXCEPTION "Ex FALLÓ:" si
-- el doble conteo reapareció, NOTICE "Ex OK:" si el motor está sano.
--
-- Última corrida: 13 jul 2026 — E1-E4 OK (corridos junto a la migración en
-- dry-run transaccional sobre la instancia real).
-- ============================================================


-- ─── E1 + E2. Partido RANKING: aplica UNA vez + idempotencia ─────────────────
BEGIN;
DO $$
DECLARE
  v_team_a uuid;
  v_team_b uuid;
  v_match  uuid;
  v_season uuid;
  t        teams%rowtype;
  v_hist   integer;
  v_status match_status;
BEGIN
  SELECT id INTO v_season FROM seasons WHERE is_active = true LIMIT 1;

  INSERT INTO teams (name, category, zone, preferred_format)
  VALUES ('__TEST ELO A', 'MIXTO', 'Palermo', 'FUTBOL_5') RETURNING id INTO v_team_a;
  INSERT INTO teams (name, category, zone, preferred_format)
  VALUES ('__TEST ELO B', 'MIXTO', 'Palermo', 'FUTBOL_5') RETURNING id INTO v_team_b;

  INSERT INTO matches (team_a_id, team_b_id, match_type, status, format, scheduled_at, season_id)
  VALUES (v_team_a, v_team_b, 'RANKING', 'EN_VIVO', 'FUTBOL_5', now(), v_season)
  RETURNING id INTO v_match;

  -- Carga de resultados cruzados 2-1 (dispara trg_on_result_submitted).
  INSERT INTO match_results (match_id, team_id, submitted_by, goals_scored, goals_against)
  VALUES (v_match, v_team_a, '33333333-3333-3333-3333-000000000004', 2, 1);
  INSERT INTO match_results (match_id, team_id, submitted_by, goals_scored, goals_against)
  VALUES (v_match, v_team_b, '33333333-3333-3333-3333-000000000004', 1, 2);

  -- ── E1: el partido quedó FINALIZADO y todo se aplicó UNA sola vez ──────────
  SELECT status INTO v_status FROM matches WHERE id = v_match;
  IF v_status <> 'FINALIZADO' THEN
    RAISE EXCEPTION 'E1 FALLÓ: el partido no se finalizó (status=%)', v_status;
  END IF;

  SELECT * INTO t FROM teams WHERE id = v_team_a;
  IF t.matches_played <> 1 OR t.season_wins <> 1 OR t.season_draws <> 0 OR t.season_losses <> 0
     OR t.season_goals_for <> 2 OR t.season_goals_against <> 1 OR t.elo_rating <> 1020 THEN
    RAISE EXCEPTION 'E1 FALLÓ (ganador): pj=% w=% d=% l=% gf=% gc=% elo=% (esperado 1/1/0/0/2/1/1020)',
      t.matches_played, t.season_wins, t.season_draws, t.season_losses,
      t.season_goals_for, t.season_goals_against, t.elo_rating;
  END IF;

  SELECT * INTO t FROM teams WHERE id = v_team_b;
  IF t.matches_played <> 1 OR t.season_losses <> 1 OR t.elo_rating <> 980 THEN
    RAISE EXCEPTION 'E1 FALLÓ (perdedor): pj=% l=% elo=% (esperado 1/1/980)',
      t.matches_played, t.season_losses, t.elo_rating;
  END IF;

  SELECT count(*) INTO v_hist FROM elo_history WHERE match_id = v_match;
  IF v_hist <> 2 THEN
    RAISE EXCEPTION 'E1 FALLÓ: elo_history tiene % filas para el partido (esperado 2)', v_hist;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM elo_history
    WHERE match_id = v_match AND team_id = v_team_a
      AND elo_before = 1000 AND elo_after = 1020 AND delta = 20
  ) THEN
    RAISE EXCEPTION 'E1 FALLÓ: fila de elo_history del ganador incorrecta';
  END IF;
  RAISE NOTICE 'E1 OK: partido RANKING computó stats/ELO/history exactamente 1 vez (±20).';

  -- ── E2: idempotencia — nada se re-acumula ──────────────────────────────────
  PERFORM public.resolve_match(v_match);
  UPDATE matches SET status = 'FINALIZADO' WHERE id = v_match;

  SELECT * INTO t FROM teams WHERE id = v_team_a;
  SELECT count(*) INTO v_hist FROM elo_history WHERE match_id = v_match;
  IF t.matches_played <> 1 OR t.elo_rating <> 1020 OR v_hist <> 2 THEN
    RAISE EXCEPTION 'E2 FALLÓ: re-proceso acumuló de nuevo (pj=% elo=% hist=%)',
      t.matches_played, t.elo_rating, v_hist;
  END IF;
  RAISE NOTICE 'E2 OK: re-ejecutar resolve_match / re-updatear status no re-acumula.';
END $$;
ROLLBACK;


-- ─── E3. WO_A: 3-0 + ELO, exactamente UNA vez ────────────────────────────────
BEGIN;
DO $$
DECLARE
  v_team_a uuid;
  v_team_b uuid;
  v_match  uuid;
  v_season uuid;
  t        teams%rowtype;
  v_hist   integer;
BEGIN
  SELECT id INTO v_season FROM seasons WHERE is_active = true LIMIT 1;

  INSERT INTO teams (name, category, zone, preferred_format)
  VALUES ('__TEST WO A', 'MIXTO', 'Palermo', 'FUTBOL_5') RETURNING id INTO v_team_a;
  INSERT INTO teams (name, category, zone, preferred_format)
  VALUES ('__TEST WO B', 'MIXTO', 'Palermo', 'FUTBOL_5') RETURNING id INTO v_team_b;

  INSERT INTO matches (team_a_id, team_b_id, match_type, status, format, scheduled_at, season_id)
  VALUES (v_team_a, v_team_b, 'RANKING', 'CONFIRMADO', 'FUTBOL_5', now(), v_season)
  RETURNING id INTO v_match;

  -- Simula la aprobación del WO (resolve_wo_claim setea el status igual).
  UPDATE matches SET status = 'WO_A' WHERE id = v_match;

  SELECT * INTO t FROM teams WHERE id = v_team_a;
  IF t.matches_played <> 1 OR t.season_wins <> 1 OR t.season_goals_for <> 3
     OR t.season_goals_against <> 0 OR t.elo_rating <> 1020 THEN
    RAISE EXCEPTION 'E3 FALLÓ (ganador WO): pj=% w=% gf=% gc=% elo=% (esperado 1/1/3/0/1020)',
      t.matches_played, t.season_wins, t.season_goals_for, t.season_goals_against, t.elo_rating;
  END IF;

  SELECT * INTO t FROM teams WHERE id = v_team_b;
  IF t.matches_played <> 1 OR t.season_losses <> 1 OR t.season_goals_against <> 3 OR t.elo_rating <> 980 THEN
    RAISE EXCEPTION 'E3 FALLÓ (ausente WO): pj=% l=% gc=% elo=% (esperado 1/1/3/980)',
      t.matches_played, t.season_losses, t.season_goals_against, t.elo_rating;
  END IF;

  SELECT count(*) INTO v_hist FROM elo_history WHERE match_id = v_match;
  IF v_hist <> 2 THEN
    RAISE EXCEPTION 'E3 FALLÓ: elo_history tiene % filas para el WO (esperado 2)', v_hist;
  END IF;
  RAISE NOTICE 'E3 OK: WO computó 3-0 + ELO + historial exactamente 1 vez.';
END $$;
ROLLBACK;


-- ─── E4. AMISTOSO: stats sí, ELO/history no ──────────────────────────────────
BEGIN;
DO $$
DECLARE
  v_team_a uuid;
  v_team_b uuid;
  v_match  uuid;
  t        teams%rowtype;
  v_hist   integer;
BEGIN
  INSERT INTO teams (name, category, zone, preferred_format)
  VALUES ('__TEST AMISTOSO A', 'MIXTO', 'Palermo', 'FUTBOL_5') RETURNING id INTO v_team_a;
  INSERT INTO teams (name, category, zone, preferred_format)
  VALUES ('__TEST AMISTOSO B', 'MIXTO', 'Palermo', 'FUTBOL_5') RETURNING id INTO v_team_b;

  INSERT INTO matches (team_a_id, team_b_id, match_type, status, format, scheduled_at)
  VALUES (v_team_a, v_team_b, 'AMISTOSO', 'EN_VIVO', 'FUTBOL_5', now())
  RETURNING id INTO v_match;

  INSERT INTO match_results (match_id, team_id, submitted_by, goals_scored, goals_against)
  VALUES (v_match, v_team_a, '33333333-3333-3333-3333-000000000004', 1, 1);
  INSERT INTO match_results (match_id, team_id, submitted_by, goals_scored, goals_against)
  VALUES (v_match, v_team_b, '33333333-3333-3333-3333-000000000004', 1, 1);

  SELECT * INTO t FROM teams WHERE id = v_team_a;
  IF t.matches_played <> 1 OR t.season_draws <> 1 OR t.season_goals_for <> 1 THEN
    RAISE EXCEPTION 'E4 FALLÓ (stats): pj=% d=% gf=% (esperado 1/1/1)',
      t.matches_played, t.season_draws, t.season_goals_for;
  END IF;
  IF t.elo_rating <> 1000 THEN
    RAISE EXCEPTION 'E4 FALLÓ: el amistoso movió el ELO (elo=%)', t.elo_rating;
  END IF;

  SELECT count(*) INTO v_hist FROM elo_history WHERE match_id = v_match;
  IF v_hist <> 0 THEN
    RAISE EXCEPTION 'E4 FALLÓ: el amistoso escribió % filas en elo_history', v_hist;
  END IF;
  RAISE NOTICE 'E4 OK: amistoso cuenta stats 1 vez y no toca ELO/historial.';
END $$;
ROLLBACK;
