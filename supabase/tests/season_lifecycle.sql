-- ============================================================
-- CICLO DE VIDA DE TEMPORADAS — REGRESIÓN — 2026-07-14
-- ============================================================
-- Valida transition_season y sus refuerzos estructurales
-- (migration 20260714_season_lifecycle.sql):
--   T1 — Transición feliz: cierra la activa, crea la nueva (única activa),
--        contadores season_* de teams en 0, elo_rating y matches_played
--        INTACTOS, y notificación de auditoría a los admins.
--   T2 — Un usuario no-admin no puede ejecutar la transición.
--   T3 — El índice único parcial impide dos temporadas activas.
--   T4 — Partidos abiertos re-etiquetados a la temporada nueva; los
--        terminales conservan su temporada original. (dentro de T1)
--   T5 — Sin temporada activa, la transición falla con error claro.
--
-- Cada bloque corre en BEGIN...ROLLBACK: no persiste nada. Bloques
-- auto-verificantes: EXCEPTION "Tx FALLÓ:" si hay regresión, NOTICE "Tx OK:"
-- si el comportamiento es el esperado.
--
-- IDs de seed usados (si el seed cambia, actualizar acá):
--   admin de prueba : 33333333-3333-3333-3333-000000000004
--     auth uid      : aaaaaaaa-0000-0000-0000-000000000004
--   partido terminal: 44444444-4444-4444-4444-000000000003
--
-- Última corrida: 14 jul 2026 — T1-T5 OK contra el proyecto real.
-- ============================================================


-- ─── T1 + T4. Transición feliz ───────────────────────────────────────────────
BEGIN;
SELECT set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-000000000004"}', true);
DO $$
DECLARE
  c_admin  CONSTANT uuid := '33333333-3333-3333-3333-000000000004';
  c_final  CONSTANT uuid := '44444444-4444-4444-4444-000000000003';
  v_old_id     uuid;
  v_new_id     uuid;
  v_team       uuid;
  v_rival      uuid;
  v_open_match uuid;
  v_final_season_before uuid;
  t            teams%rowtype;
  v_n          integer;
BEGIN
  UPDATE public.profiles SET is_admin = true WHERE id = c_admin;
  SELECT id INTO v_old_id FROM seasons WHERE is_active = true;
  SELECT season_id INTO v_final_season_before FROM matches WHERE id = c_final;

  -- Equipo con contadores/ELO adulterados para verificar qué se resetea.
  INSERT INTO teams (name, category, zone, preferred_format)
  VALUES ('__TEST SEASON', 'MIXTO', 'Palermo', 'FUTBOL_5') RETURNING id INTO v_team;
  INSERT INTO teams (name, category, zone, preferred_format)
  VALUES ('__TEST SEASON RIVAL', 'MIXTO', 'Palermo', 'FUTBOL_5') RETURNING id INTO v_rival;
  UPDATE teams SET
    elo_rating = 1234, matches_played = 9,
    season_wins = 7, season_draws = 1, season_losses = 1,
    season_goals_for = 20, season_goals_against = 5
  WHERE id = v_team;

  -- Partido abierto (debe re-etiquetarse) en la temporada vieja.
  INSERT INTO matches (team_a_id, team_b_id, match_type, status, scheduled_at, season_id)
  VALUES (v_team, v_rival, 'AMISTOSO', 'CONFIRMADO', now() + interval '3 days', v_old_id)
  RETURNING id INTO v_open_match;

  -- ── Transición ──────────────────────────────────────────────────────────────
  SELECT public.transition_season('__TEST Temporada Nueva', '2026-07-01', '2026-12-31')
    INTO v_new_id;

  -- T1a: la vieja quedó inactiva y la nueva es LA única activa.
  SELECT count(*) INTO v_n FROM seasons WHERE is_active = true;
  IF v_n <> 1 OR EXISTS (SELECT 1 FROM seasons WHERE id = v_old_id AND is_active)
     OR NOT EXISTS (SELECT 1 FROM seasons WHERE id = v_new_id AND is_active) THEN
    RAISE EXCEPTION 'T1 FALLÓ: estado de temporadas inconsistente (% activas)', v_n;
  END IF;

  -- T1b: contadores en 0; elo_rating y matches_played intactos.
  SELECT * INTO t FROM teams WHERE id = v_team;
  IF t.season_wins <> 0 OR t.season_draws <> 0 OR t.season_losses <> 0
     OR t.season_goals_for <> 0 OR t.season_goals_against <> 0 THEN
    RAISE EXCEPTION 'T1 FALLÓ: contadores no reseteados (w=% d=% l=% gf=% gc=%)',
      t.season_wins, t.season_draws, t.season_losses, t.season_goals_for, t.season_goals_against;
  END IF;
  IF t.elo_rating <> 1234 OR t.matches_played <> 9 THEN
    RAISE EXCEPTION 'T1 FALLÓ: elo/matches_played alterados (elo=% mp=%) — debían quedar intactos',
      t.elo_rating, t.matches_played;
  END IF;

  -- T1c: notificación de auditoría al admin.
  IF NOT EXISTS (
    SELECT 1 FROM notifications
    WHERE profile_id = c_admin AND type = 'TEMPORADA_INICIADA'
      AND data->>'season_id' = v_new_id::text
  ) THEN
    RAISE EXCEPTION 'T1 FALLÓ: falta la notificación de auditoría al admin';
  END IF;
  RAISE NOTICE 'T1 OK: transición cierra/crea/resetea manteniendo ELO y PJ intactos.';

  -- T4: el partido abierto migró; el terminal conservó su temporada.
  IF (SELECT season_id FROM matches WHERE id = v_open_match) IS DISTINCT FROM v_new_id THEN
    RAISE EXCEPTION 'T4 FALLÓ: el partido abierto no se re-etiquetó a la temporada nueva';
  END IF;
  IF (SELECT season_id FROM matches WHERE id = c_final) IS DISTINCT FROM v_final_season_before THEN
    RAISE EXCEPTION 'T4 FALLÓ: un partido terminal cambió de temporada';
  END IF;
  RAISE NOTICE 'T4 OK: abiertos re-etiquetados, terminales intactos.';
END $$;
ROLLBACK;


-- ─── T2. No-admin: rechazado ─────────────────────────────────────────────────
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-000000000004"}', true);
DO $$
BEGIN
  PERFORM public.transition_season('__TEST Ilegítima', '2026-07-01', '2026-12-31');
  RAISE EXCEPTION 'T2 FALLÓ: un usuario sin is_admin ejecutó la transición';
EXCEPTION
  WHEN raise_exception THEN
    IF SQLERRM NOT LIKE '%No autorizado%' THEN RAISE; END IF;
    RAISE NOTICE 'T2 OK: transición rechazada sin rol admin (%).', SQLERRM;
END $$;
ROLLBACK;


-- ─── T3. Una sola temporada activa (garantía estructural) ────────────────────
BEGIN;
DO $$
BEGIN
  INSERT INTO seasons (name, slug, starts_at, ends_at, is_active)
  VALUES ('__TEST Doble Activa', '--test-doble-activa', '2027-01-01', '2027-06-30', true);
  RAISE EXCEPTION 'T3 FALLÓ: la base aceptó una segunda temporada activa';
EXCEPTION
  WHEN unique_violation THEN
    RAISE NOTICE 'T3 OK: el índice único parcial impide dos temporadas activas.';
END $$;
ROLLBACK;


-- ─── T5. Sin temporada activa: error claro ───────────────────────────────────
BEGIN;
SELECT set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-000000000004"}', true);
DO $$
BEGIN
  UPDATE public.profiles SET is_admin = true
   WHERE id = '33333333-3333-3333-3333-000000000004';
  UPDATE seasons SET is_active = false WHERE is_active = true;

  BEGIN
    PERFORM public.transition_season('__TEST Sin Activa', '2026-07-01', '2026-12-31');
    RAISE EXCEPTION 'T5 FALLÓ: la transición corrió sin temporada activa que cerrar';
  EXCEPTION
    WHEN raise_exception THEN
      IF SQLERRM NOT LIKE '%No hay temporada activa%' THEN RAISE; END IF;
      RAISE NOTICE 'T5 OK: sin temporada activa la transición falla con error claro (%).', SQLERRM;
  END;
END $$;
ROLLBACK;
