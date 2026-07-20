-- ============================================================
-- HISTORIAL DE TRANSFERENCIAS — REGRESIÓN — 2026-07-15
-- ============================================================
-- Valida el ledger team_stints y su motor (migraciones
-- 20260715_transfer_history_{structure,engine,rpc,backfill}.sql):
--   T1 — Apertura: el INSERT en team_members abre un ciclo con
--        started_at = joined_at y nombre/escudo desnormalizados.
--   T2 — Cierre: el DELETE congela snapshot exacto (PJ, goles, MVPs,
--        vallas colectivas, V/E/D), leave_reason ABANDONO por default
--        y last_role del momento de la baja.
--   T3 — Los WO (WO_A/WO_B) NO cuentan como PJ individual. (en T2)
--   T4 — Los AMISTOSOS cuentan desglosados de RANKING. (en T2)
--   T5 — Invitados: aparecen en guest_appearances de get_player_career,
--        nunca dentro del stint. (en T2)
--   T8 — RPC vivo vs. cerrado: el ciclo vigente se computa EN VIVO y va
--        primero; el cerrado se lee del snapshot congelado (se adultera el
--        snapshot y la RPC debe devolver el valor adulterado). (en T2)
--   T6 — Inmutabilidad: authenticated puede leer team_stints y ejecutar
--        get_player_career, pero no puede escribir el ledger.
--   T7 — Re-ingreso: segundo ciclo en nueva fila; el índice único parcial
--        impide dos ciclos abiertos del mismo (jugador, equipo).
--   T9 — Paridad seed/backfill: los capitanes del seed tienen ciclo abierto
--        (local: lo abre el trigger al correr seed.sql; proyecto real: lo
--        creó el backfill 4/4).
--
-- Cada bloque corre en BEGIN...ROLLBACK: no persiste nada. Bloques
-- auto-verificantes: EXCEPTION "Tx FALLÓ:" si hay regresión, NOTICE "Tx OK:"
-- si el comportamiento es el esperado.
--
-- IDs de seed usados (si el seed cambia, actualizar acá):
--   jugador de prueba : ef88b757-4d4e-48b1-b300-51da1cb2e678 (player_market)
--     auth uid        : 8e7bd5df-5201-4622-8f6b-b94725c18da8
--   goleador 2º       : 33333333-3333-3333-3333-000000000001 (cap_leones)
--   equipo Leones     : 22222222-2222-2222-2222-222222222221
--
-- Última corrida: 19 jul 2026 — T1-T9 OK contra el stack local (db reset
-- + psql ON_ERROR_STOP), junto con las otras 11 suites del manifest.
-- ============================================================


-- ─── T1. Apertura de ciclo ───────────────────────────────────────────────────
BEGIN;
DO $$
DECLARE
  c_player CONSTANT uuid := 'ef88b757-4d4e-48b1-b300-51da1cb2e678';
  v_team   uuid;
  v_joined timestamptz := now() - interval '30 days';
  st       team_stints%rowtype;
BEGIN
  INSERT INTO teams (name, category, zone, preferred_format, shield_url)
  VALUES ('__TH Apertura FC', 'MIXTO', 'ZTH_TEST', 'FUTBOL_5', 'https://x/shield.png')
  RETURNING id INTO v_team;

  INSERT INTO team_members (team_id, profile_id, role, joined_at)
  VALUES (v_team, c_player, 'JUGADOR', v_joined);

  SELECT * INTO st FROM team_stints
   WHERE profile_id = c_player AND team_id = v_team;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'T1 FALLÓ: el INSERT en team_members no abrió ciclo en team_stints';
  END IF;
  IF st.ended_at IS NOT NULL OR st.started_at IS DISTINCT FROM v_joined THEN
    RAISE EXCEPTION 'T1 FALLÓ: ciclo mal abierto (ended_at=%, started_at=%, esperado started=%)',
      st.ended_at, st.started_at, v_joined;
  END IF;
  IF st.team_name IS DISTINCT FROM '__TH Apertura FC'
     OR st.shield_url IS DISTINCT FROM 'https://x/shield.png' THEN
    RAISE EXCEPTION 'T1 FALLÓ: nombre/escudo no desnormalizados (name=%, shield=%)',
      st.team_name, st.shield_url;
  END IF;
  RAISE NOTICE 'T1 OK: apertura de ciclo con datos desnormalizados y started_at = joined_at.';
END $$;
ROLLBACK;


-- ─── T2+T3+T4+T5+T8. Cierre con snapshot exacto y RPC ────────────────────────
-- Escenario (todo en equipos frescos, aislado del entorno):
--   Membresía en __TH Origen (SUBCAPITAN, alta hace 30 días). Partidos:
--     R1 RANKING  FINALIZADO  Origen 3-0  (valla) · player 2 goles · MVP player
--     R2 RANKING  FINALIZADO  Origen 1-2          · player 1 gol
--     A1 AMISTOSO FINALIZADO  Origen 0-0  (valla)
--     W1 RANKING  WO_A        (participa, NO debe contar como PJ)
--     G1 RANKING  FINALIZADO  player INVITADO en __TH Rival, 1-0 · 1 gol · MVP
--   Esperado al cerrar (DELETE de la membresía):
--     total = { pj_ranking 2, pj_amistoso 1, goals 3, mvps 1,
--               clean_sheets 2, wins 1, draws 1, losses 1 }
--   Luego, ciclo vigente en __TH Origen 2 (1 partido ganado 2-1, 2 goles):
--     get_player_career → vigente primero (stats en vivo), cerrado desde
--     snapshot (adulterado a goals=99 para probar que NO recomputa), y
--     G1 en guest_appearances.
BEGIN;
DO $$
DECLARE
  c_player  CONSTANT uuid := 'ef88b757-4d4e-48b1-b300-51da1cb2e678';
  c_scorer2 CONSTANT uuid := '33333333-3333-3333-3333-000000000001';
  v_origen  uuid; v_rival uuid; v_origen2 uuid;
  v_season  uuid;
  v_m       uuid;
  st        team_stints%rowtype;
  v_career  jsonb;
  v_elem    jsonb;
BEGIN
  SELECT id INTO v_season FROM seasons WHERE is_active = true;
  IF v_season IS NULL THEN
    RAISE EXCEPTION 'T2 FALLÓ (precondición): no hay temporada activa en el entorno';
  END IF;

  INSERT INTO teams (name, category, zone, preferred_format)
  VALUES ('__TH Origen', 'MIXTO', 'ZTH_TEST', 'FUTBOL_5') RETURNING id INTO v_origen;
  INSERT INTO teams (name, category, zone, preferred_format)
  VALUES ('__TH Rival', 'MIXTO', 'ZTH_TEST', 'FUTBOL_5') RETURNING id INTO v_rival;
  INSERT INTO teams (name, category, zone, preferred_format)
  VALUES ('__TH Origen 2', 'MIXTO', 'ZTH_TEST', 'FUTBOL_5') RETURNING id INTO v_origen2;

  INSERT INTO team_members (team_id, profile_id, role, joined_at)
  VALUES (v_origen, c_player, 'SUBCAPITAN', now() - interval '30 days');

  -- R1: Origen 3-0 (valla) · player 2 goles · MVP player.
  INSERT INTO matches (team_a_id, team_b_id, match_type, status, scheduled_at, season_id)
  VALUES (v_origen, v_rival, 'RANKING', 'FINALIZADO', now() - interval '10 days', v_season)
  RETURNING id INTO v_m;
  INSERT INTO match_results (match_id, team_id, submitted_by, goals_scored, goals_against, scorers, mvp_id) VALUES
    (v_m, v_origen, c_player, 3, 0,
     jsonb_build_array(
       jsonb_build_object('profile_id', c_player,  'goals', 2),
       jsonb_build_object('profile_id', c_scorer2, 'goals', 1)),
     c_player),
    (v_m, v_rival, c_player, 0, 3, '[]'::jsonb, NULL);
  INSERT INTO match_participants (match_id, profile_id, team_id) VALUES (v_m, c_player, v_origen);

  -- R2: Origen 1-2 · player 1 gol.
  INSERT INTO matches (team_a_id, team_b_id, match_type, status, scheduled_at, season_id)
  VALUES (v_origen, v_rival, 'RANKING', 'FINALIZADO', now() - interval '8 days', v_season)
  RETURNING id INTO v_m;
  INSERT INTO match_results (match_id, team_id, submitted_by, goals_scored, goals_against, scorers) VALUES
    (v_m, v_origen, c_player, 1, 2,
     jsonb_build_array(jsonb_build_object('profile_id', c_player, 'goals', 1))),
    (v_m, v_rival, c_player, 2, 1, '[]'::jsonb);
  INSERT INTO match_participants (match_id, profile_id, team_id) VALUES (v_m, c_player, v_origen);

  -- A1: AMISTOSO 0-0 (valla, empate).
  INSERT INTO matches (team_a_id, team_b_id, match_type, status, scheduled_at, season_id)
  VALUES (v_origen, v_rival, 'AMISTOSO', 'FINALIZADO', now() - interval '6 days', v_season)
  RETURNING id INTO v_m;
  INSERT INTO match_results (match_id, team_id, submitted_by, goals_scored, goals_against) VALUES
    (v_m, v_origen, c_player, 0, 0), (v_m, v_rival, c_player, 0, 0);
  INSERT INTO match_participants (match_id, profile_id, team_id) VALUES (v_m, c_player, v_origen);

  -- W1: WO_A con participación — NO debe sumar PJ.
  INSERT INTO matches (team_a_id, team_b_id, match_type, status, scheduled_at, season_id)
  VALUES (v_origen, v_rival, 'RANKING', 'WO_A', now() - interval '4 days', v_season)
  RETURNING id INTO v_m;
  INSERT INTO match_participants (match_id, profile_id, team_id) VALUES (v_m, c_player, v_origen);

  -- G1: player INVITADO en __TH Rival: 1-0, 1 gol, MVP.
  INSERT INTO matches (team_a_id, team_b_id, match_type, status, scheduled_at, season_id)
  VALUES (v_origen, v_rival, 'RANKING', 'FINALIZADO', now() - interval '2 days', v_season)
  RETURNING id INTO v_m;
  INSERT INTO match_results (match_id, team_id, submitted_by, goals_scored, goals_against, scorers, mvp_id) VALUES
    (v_m, v_rival, c_player, 1, 0,
     jsonb_build_array(jsonb_build_object('profile_id', c_player, 'goals', 1)), c_player),
    (v_m, v_origen, c_player, 0, 1, '[]'::jsonb, NULL);
  INSERT INTO match_participants (match_id, profile_id, team_id, is_guest)
  VALUES (v_m, c_player, v_rival, true);

  -- ── Cierre del ciclo ────────────────────────────────────────────────────────
  DELETE FROM team_members WHERE team_id = v_origen AND profile_id = c_player;

  SELECT * INTO st FROM team_stints
   WHERE profile_id = c_player AND team_id = v_origen;
  IF NOT FOUND OR st.ended_at IS NULL THEN
    RAISE EXCEPTION 'T2 FALLÓ: el DELETE no cerró el ciclo';
  END IF;
  IF st.leave_reason IS DISTINCT FROM 'ABANDONO' OR st.last_role IS DISTINCT FROM 'SUBCAPITAN' THEN
    RAISE EXCEPTION 'T2 FALLÓ: leave_reason=% (esperado ABANDONO), last_role=% (esperado SUBCAPITAN)',
      st.leave_reason, st.last_role;
  END IF;
  IF st.stats IS NULL OR st.stats_computed_at IS NULL THEN
    RAISE EXCEPTION 'T2 FALLÓ: el cierre no congeló snapshot de stats';
  END IF;

  IF (st.stats->'total'->>'goals')::int        <> 3
  OR (st.stats->'total'->>'mvps')::int         <> 1
  OR (st.stats->'total'->>'clean_sheets')::int <> 2
  OR (st.stats->'total'->>'wins')::int         <> 1
  OR (st.stats->'total'->>'draws')::int        <> 1
  OR (st.stats->'total'->>'losses')::int       <> 1 THEN
    RAISE EXCEPTION 'T2 FALLÓ: snapshot inexacto: %', st.stats->'total';
  END IF;
  IF jsonb_array_length(st.stats->'by_season') <> 1
  OR (st.stats->'by_season'->0->>'season_id')::uuid <> v_season THEN
    RAISE EXCEPTION 'T2 FALLÓ: desglose por temporada inexacto: %', st.stats->'by_season';
  END IF;
  RAISE NOTICE 'T2 OK: cierre con snapshot exacto (goles, MVPs, vallas, V/E/D, temporada).';

  IF (st.stats->'total'->>'pj_ranking')::int <> 2 THEN
    RAISE EXCEPTION 'T3 FALLÓ: pj_ranking=% (esperado 2: el WO contó como PJ)',
      st.stats->'total'->>'pj_ranking';
  END IF;
  RAISE NOTICE 'T3 OK: el WO no cuenta como PJ individual.';

  IF (st.stats->'total'->>'pj_amistoso')::int <> 1 THEN
    RAISE EXCEPTION 'T4 FALLÓ: pj_amistoso=% (esperado 1, desglosado de ranking)',
      st.stats->'total'->>'pj_amistoso';
  END IF;
  RAISE NOTICE 'T4 OK: amistosos contados y desglosados de ranking.';

  -- ── Ciclo vigente en Origen 2 + adulteración del snapshot cerrado ───────────
  INSERT INTO team_members (team_id, profile_id, role, joined_at)
  VALUES (v_origen2, c_player, 'JUGADOR', now() - interval '5 days');
  INSERT INTO matches (team_a_id, team_b_id, match_type, status, scheduled_at, season_id)
  VALUES (v_origen2, v_rival, 'RANKING', 'FINALIZADO', now() - interval '1 day', v_season)
  RETURNING id INTO v_m;
  INSERT INTO match_results (match_id, team_id, submitted_by, goals_scored, goals_against, scorers) VALUES
    (v_m, v_origen2, c_player, 2, 1,
     jsonb_build_array(jsonb_build_object('profile_id', c_player, 'goals', 2))),
    (v_m, v_rival, c_player, 1, 2, '[]'::jsonb);
  INSERT INTO match_participants (match_id, profile_id, team_id) VALUES (v_m, c_player, v_origen2);

  -- Si la RPC devolviera goals=99 es porque LEE el snapshot (no recomputa).
  UPDATE team_stints SET stats = jsonb_set(stats, '{total,goals}', '99') WHERE id = st.id;

  v_career := public.get_player_career(c_player);

  -- T8a: el primer elemento es un ciclo vigente.
  IF (v_career->'stints'->0->>'is_current')::boolean IS NOT TRUE THEN
    RAISE EXCEPTION 'T8 FALLÓ: el primer stint del career no es el vigente: %',
      v_career->'stints'->0;
  END IF;
  -- T8b: el vigente (Origen 2) computa EN VIVO.
  SELECT s INTO v_elem FROM jsonb_array_elements(v_career->'stints') s
   WHERE (s->>'team_id')::uuid = v_origen2;
  IF v_elem IS NULL OR (v_elem->'stats'->'total'->>'goals')::int <> 2
     OR (v_elem->'stats'->'total'->>'pj_ranking')::int <> 1
     OR (v_elem->'stats'->'total'->>'wins')::int <> 1 THEN
    RAISE EXCEPTION 'T8 FALLÓ: stats en vivo del ciclo vigente inexactas: %', v_elem->'stats';
  END IF;
  -- T8c: el cerrado se lee del snapshot congelado (goals adulterado = 99).
  SELECT s INTO v_elem FROM jsonb_array_elements(v_career->'stints') s
   WHERE (s->>'stint_id')::uuid = st.id;
  IF v_elem IS NULL OR (v_elem->'stats'->'total'->>'goals')::int <> 99 THEN
    RAISE EXCEPTION 'T8 FALLÓ: el ciclo cerrado no se leyó del snapshot (goals=%, esperado 99)',
      v_elem->'stats'->'total'->>'goals';
  END IF;
  RAISE NOTICE 'T8 OK: vigente en vivo y primero; cerrado desde snapshot congelado.';

  -- T5: G1 como invitado en __TH Rival, fuera de los stints.
  SELECT g INTO v_elem FROM jsonb_array_elements(v_career->'guest_appearances') g
   WHERE (g->>'team_id')::uuid = v_rival;
  IF v_elem IS NULL OR (v_elem->>'pj_ranking')::int <> 1
     OR (v_elem->>'goals')::int <> 1 OR (v_elem->>'mvps')::int <> 1 THEN
    RAISE EXCEPTION 'T5 FALLÓ: aparición como invitado ausente o inexacta: %', v_elem;
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(v_career->'stints') s
    WHERE (s->>'team_id')::uuid = v_rival
  ) THEN
    RAISE EXCEPTION 'T5 FALLÓ: la participación como invitado abrió un stint en __TH Rival';
  END IF;
  RAISE NOTICE 'T5 OK: invitados en guest_appearances, sin abrir stint.';
END $$;
ROLLBACK;


-- ─── T6. Inmutabilidad: authenticated lee pero no escribe ────────────────────
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"8e7bd5df-5201-4622-8f6b-b94725c18da8"}', true);
DO $$
DECLARE
  c_player CONSTANT uuid := 'ef88b757-4d4e-48b1-b300-51da1cb2e678';
  c_leones CONSTANT uuid := '22222222-2222-2222-2222-222222222221';
BEGIN
  -- Lectura y RPC: permitidas.
  PERFORM 1 FROM team_stints LIMIT 1;
  PERFORM public.get_player_career(c_player);

  BEGIN
    INSERT INTO team_stints (profile_id, team_id, team_name, started_at)
    VALUES (c_player, c_leones, '__TH Ilegítimo', now());
    RAISE EXCEPTION 'T6 FALLÓ: authenticated insertó directo en team_stints';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  BEGIN
    UPDATE team_stints SET team_name = '__TH Adulterado' WHERE profile_id = c_player;
    RAISE EXCEPTION 'T6 FALLÓ: authenticated actualizó team_stints';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  BEGIN
    DELETE FROM team_stints WHERE profile_id = c_player;
    RAISE EXCEPTION 'T6 FALLÓ: authenticated borró filas de team_stints';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  RAISE NOTICE 'T6 OK: ledger legible pero inmutable para authenticated.';
END $$;
ROLLBACK;


-- ─── T7. Re-ingreso: segundo ciclo + único abierto por membresía ─────────────
BEGIN;
DO $$
DECLARE
  c_player CONSTANT uuid := 'ef88b757-4d4e-48b1-b300-51da1cb2e678';
  v_team   uuid;
  v_n      integer;
BEGIN
  INSERT INTO teams (name, category, zone, preferred_format)
  VALUES ('__TH Reingreso', 'MIXTO', 'ZTH_TEST', 'FUTBOL_5') RETURNING id INTO v_team;

  INSERT INTO team_members (team_id, profile_id, role, joined_at)
  VALUES (v_team, c_player, 'JUGADOR', now() - interval '20 days');
  DELETE FROM team_members WHERE team_id = v_team AND profile_id = c_player;
  INSERT INTO team_members (team_id, profile_id, role)
  VALUES (v_team, c_player, 'JUGADOR');

  SELECT count(*) INTO v_n FROM team_stints
   WHERE profile_id = c_player AND team_id = v_team;
  IF v_n <> 2 THEN
    RAISE EXCEPTION 'T7 FALLÓ: re-ingreso dejó % stints (esperado 2: cerrado + abierto)', v_n;
  END IF;
  SELECT count(*) INTO v_n FROM team_stints
   WHERE profile_id = c_player AND team_id = v_team AND ended_at IS NULL;
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'T7 FALLÓ: % ciclos abiertos tras re-ingreso (esperado 1)', v_n;
  END IF;

  BEGIN
    INSERT INTO team_stints (profile_id, team_id, team_name, started_at)
    VALUES (c_player, v_team, '__TH Reingreso', now());
    RAISE EXCEPTION 'T7 FALLÓ: la base aceptó un segundo ciclo abierto del mismo par';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;

  RAISE NOTICE 'T7 OK: re-ingreso crea fila nueva; imposible duplicar ciclo abierto.';
END $$;
ROLLBACK;


-- ─── T9. Paridad seed/backfill: capitanes con ciclo abierto ──────────────────
BEGIN;
DO $$
DECLARE
  c_cap    CONSTANT uuid := '33333333-3333-3333-3333-000000000001';
  c_leones CONSTANT uuid := '22222222-2222-2222-2222-222222222221';
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM team_stints
    WHERE profile_id = c_cap AND team_id = c_leones AND ended_at IS NULL
  ) THEN
    RAISE EXCEPTION 'T9 FALLÓ: el capitán del seed no tiene ciclo abierto en Los Leones FC (¿backfill/trigger?)';
  END IF;
  RAISE NOTICE 'T9 OK: membresías preexistentes tienen su ciclo abierto (trigger en local, backfill en prod).';
END $$;
ROLLBACK;
