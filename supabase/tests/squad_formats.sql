-- ============================================================
-- SQUAD FORMATS — PLANTELES, FORMATOS Y SUPLENTES — 2026-07-14
-- ============================================================
-- Valida las migraciones 20260714200000 (estructura) y 20260714201000
-- (RPC submit_team_checkin + RLS):
--   S1 — Camino feliz: el capitán presenta 5 TITULAR + 2 SUPLENTE en F5;
--        roles persistidos, sello de check-in del equipo, caller con
--        presencia + result loader. El rival presenta la suya → EN_VIVO.
--   S2 — Re-presentación: la lista se REEMPLAZA (sale uno, entra otro,
--        cambian roles) mientras el partido siga CONFIRMADO.
--   S3 — Rechazos de cupos y autorización (cada uno con su código):
--        titulares < mínimo, titulares > cancha, convocados > máximo,
--        caller no capitán, jugador duplicado, jugador ajeno al equipo,
--        partido no CONFIRMADO, payload malformado.
--   S4 — Trigger FORMAT_REQUIRED: PENDIENTE→CONFIRMADO sin formato falla;
--        con formato pasa; los históricos con format NULL siguen
--        actualizables mientras no transicionen.
--   S5 — RLS endurecida: como `authenticated`, un capitán NO puede
--        insertar filas sueltas ni tocar lineup_role ajeno; un invitado
--        SÍ puede auto-registrarse (compat con join_match_as_guest).
--
-- Cada bloque corre en BEGIN...ROLLBACK: no persiste nada. Bloques
-- auto-verificantes: EXCEPTION "Sx FALLÓ:" si hay regresión, NOTICE
-- "Sx OK:" si el comportamiento es el esperado.
--
-- IDs de seed usados (si el seed cambia, actualizar acá):
--   cap Leones  : 33333333-3333-3333-3333-000000000001 (auth aaaaaaaa-...-001)
--   cap Tigres  : 33333333-3333-3333-3333-000000000004 (auth aaaaaaaa-...-004)
--   jugador libre: ef88b757-4d4e-48b1-b300-51da1cb2e678 (auth 8e7bd5df-...)
--   Leones : 22222222-2222-2222-2222-222222222221
--   Tigres : 22222222-2222-2222-2222-222222222222
-- Los jugadores extra del plantel se crean dentro de cada transacción con
-- el prefijo bbbbbbbb-… (auth) / 55555555-… (profile) y se descartan en el
-- ROLLBACK.
-- ============================================================


-- ─── S1. Camino feliz: lista válida, sellos y EN_VIVO ────────────────────────
BEGIN;
SELECT set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-000000000001"}', true);
DO $$
DECLARE
  c_leones   CONSTANT uuid := '22222222-2222-2222-2222-222222222221';
  c_tigres   CONSTANT uuid := '22222222-2222-2222-2222-222222222222';
  c_cap_leo  CONSTANT uuid := '33333333-3333-3333-3333-000000000001';
  c_cap_tig  CONSTANT uuid := '33333333-3333-3333-3333-000000000004';
  v_match    uuid;
  v_players  jsonb;
  v_result   json;
  v_n        integer;
  m          matches%rowtype;
  i          integer;
BEGIN
  -- Plantel extra: 6 jugadores para Leones (i=1..6) y 6 para Tigres (i=11..16)
  FOR i IN 1..6 LOOP
    INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
                            raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
                            confirmation_token, recovery_token, email_change, email_change_token_new)
    VALUES ('00000000-0000-0000-0000-000000000000',
            ('bbbbbbbb-0000-0000-0000-0000000000' || lpad(i::text, 2, '0'))::uuid,
            'authenticated', 'authenticated', 'sq.leo' || i || '@test.local', '', now(),
            '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', ''),
           ('00000000-0000-0000-0000-000000000000',
            ('bbbbbbbb-0000-0000-0000-0000000000' || lpad((i + 10)::text, 2, '0'))::uuid,
            'authenticated', 'authenticated', 'sq.tig' || i || '@test.local', '', now(),
            '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', '');
    INSERT INTO profiles (id, auth_user_id, username, full_name, zone)
    VALUES (('55555555-0000-0000-0000-0000000000' || lpad(i::text, 2, '0'))::uuid,
            ('bbbbbbbb-0000-0000-0000-0000000000' || lpad(i::text, 2, '0'))::uuid,
            '__sq_leo' || i, 'SQ Leo ' || i, 'Palermo'),
           (('55555555-0000-0000-0000-0000000000' || lpad((i + 10)::text, 2, '0'))::uuid,
            ('bbbbbbbb-0000-0000-0000-0000000000' || lpad((i + 10)::text, 2, '0'))::uuid,
            '__sq_tig' || i, 'SQ Tig ' || i, 'Palermo');
    INSERT INTO team_members (team_id, profile_id, role)
    VALUES (c_leones, ('55555555-0000-0000-0000-0000000000' || lpad(i::text, 2, '0'))::uuid, 'JUGADOR'),
           (c_tigres, ('55555555-0000-0000-0000-0000000000' || lpad((i + 10)::text, 2, '0'))::uuid, 'JUGADOR');
  END LOOP;

  INSERT INTO matches (team_a_id, team_b_id, match_type, status, format, scheduled_at,
                       season_id)
  VALUES (c_leones, c_tigres, 'RANKING', 'CONFIRMADO', 'FUTBOL_5', now(),
          (SELECT id FROM seasons WHERE is_active = true))
  RETURNING id INTO v_match;

  -- Lista Leones: capitán + 4 titulares, 2 suplentes (7 <= max 10)
  v_players := jsonb_build_array(
    jsonb_build_object('profile_id', c_cap_leo, 'lineup_role', 'TITULAR'),
    jsonb_build_object('profile_id', '55555555-0000-0000-0000-000000000001', 'lineup_role', 'TITULAR'),
    jsonb_build_object('profile_id', '55555555-0000-0000-0000-000000000002', 'lineup_role', 'TITULAR'),
    jsonb_build_object('profile_id', '55555555-0000-0000-0000-000000000003', 'lineup_role', 'TITULAR'),
    jsonb_build_object('profile_id', '55555555-0000-0000-0000-000000000004', 'lineup_role', 'TITULAR'),
    jsonb_build_object('profile_id', '55555555-0000-0000-0000-000000000005', 'lineup_role', 'SUPLENTE'),
    jsonb_build_object('profile_id', '55555555-0000-0000-0000-000000000006', 'lineup_role', 'SUPLENTE')
  );
  v_result := public.submit_team_checkin(v_match, c_leones, v_players);

  IF (v_result->>'starters')::int <> 5 OR (v_result->>'substitutes')::int <> 2 THEN
    RAISE EXCEPTION 'S1 FALLÓ: el resumen devolvió %/% (esperado 5/2)',
      v_result->>'starters', v_result->>'substitutes';
  END IF;

  SELECT count(*) INTO v_n FROM match_participants
  WHERE match_id = v_match AND team_id = c_leones AND lineup_role = 'TITULAR';
  IF v_n <> 5 THEN RAISE EXCEPTION 'S1 FALLÓ: % titulares persistidos (esperado 5)', v_n; END IF;
  SELECT count(*) INTO v_n FROM match_participants
  WHERE match_id = v_match AND team_id = c_leones AND lineup_role = 'SUPLENTE';
  IF v_n <> 2 THEN RAISE EXCEPTION 'S1 FALLÓ: % suplentes persistidos (esperado 2)', v_n; END IF;

  -- Caller con presencia marcada y habilitado a cargar resultado
  IF NOT EXISTS (
    SELECT 1 FROM match_participants
    WHERE match_id = v_match AND profile_id = c_cap_leo
      AND did_checkin AND is_result_loader
  ) THEN
    RAISE EXCEPTION 'S1 FALLÓ: el capitán no quedó con did_checkin + is_result_loader';
  END IF;

  -- Un solo equipo presentó lista: sellado A, sigue CONFIRMADO
  SELECT * INTO m FROM matches WHERE id = v_match;
  IF m.checkin_team_a_at IS NULL OR m.status <> 'CONFIRMADO' THEN
    RAISE EXCEPTION 'S1 FALLÓ: tras la primera lista el estado es % (esperado CONFIRMADO con sello A)', m.status;
  END IF;

  -- El rival presenta la suya (capitán de Tigres) → EN_VIVO
  PERFORM set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-000000000004"}', true);
  v_players := jsonb_build_array(
    jsonb_build_object('profile_id', c_cap_tig, 'lineup_role', 'TITULAR'),
    jsonb_build_object('profile_id', '55555555-0000-0000-0000-000000000011', 'lineup_role', 'TITULAR'),
    jsonb_build_object('profile_id', '55555555-0000-0000-0000-000000000012', 'lineup_role', 'TITULAR'),
    jsonb_build_object('profile_id', '55555555-0000-0000-0000-000000000013', 'lineup_role', 'TITULAR'),
    jsonb_build_object('profile_id', '55555555-0000-0000-0000-000000000014', 'lineup_role', 'TITULAR')
  );
  v_result := public.submit_team_checkin(v_match, c_tigres, v_players);

  SELECT * INTO m FROM matches WHERE id = v_match;
  IF m.status <> 'EN_VIVO' OR m.started_at IS NULL OR m.checkin_team_b_at IS NULL THEN
    RAISE EXCEPTION 'S1 FALLÓ: con ambas listas el estado es % (esperado EN_VIVO con started_at)', m.status;
  END IF;
  RAISE NOTICE 'S1 OK: listas válidas persistidas con roles, sellos por equipo y pase a EN_VIVO.';
END $$;
ROLLBACK;


-- ─── S2. Re-presentación: la lista se reemplaza atómicamente ─────────────────
BEGIN;
SELECT set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-000000000001"}', true);
DO $$
DECLARE
  c_leones  CONSTANT uuid := '22222222-2222-2222-2222-222222222221';
  c_tigres  CONSTANT uuid := '22222222-2222-2222-2222-222222222222';
  c_cap_leo CONSTANT uuid := '33333333-3333-3333-3333-000000000001';
  v_match   uuid;
  v_n       integer;
  i         integer;
BEGIN
  FOR i IN 1..6 LOOP
    INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
                            raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
                            confirmation_token, recovery_token, email_change, email_change_token_new)
    VALUES ('00000000-0000-0000-0000-000000000000',
            ('bbbbbbbb-0000-0000-0000-0000000000' || lpad(i::text, 2, '0'))::uuid,
            'authenticated', 'authenticated', 'sq.leo' || i || '@test.local', '', now(),
            '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', '');
    INSERT INTO profiles (id, auth_user_id, username, full_name, zone)
    VALUES (('55555555-0000-0000-0000-0000000000' || lpad(i::text, 2, '0'))::uuid,
            ('bbbbbbbb-0000-0000-0000-0000000000' || lpad(i::text, 2, '0'))::uuid,
            '__sq_leo' || i, 'SQ Leo ' || i, 'Palermo');
    INSERT INTO team_members (team_id, profile_id, role)
    VALUES (c_leones, ('55555555-0000-0000-0000-0000000000' || lpad(i::text, 2, '0'))::uuid, 'JUGADOR');
  END LOOP;

  INSERT INTO matches (team_a_id, team_b_id, match_type, status, format, scheduled_at, season_id)
  VALUES (c_leones, c_tigres, 'RANKING', 'CONFIRMADO', 'FUTBOL_5', now(),
          (SELECT id FROM seasons WHERE is_active = true))
  RETURNING id INTO v_match;

  -- Lista 1: cap + jugadores 1..4 titulares, 5 suplente
  PERFORM public.submit_team_checkin(v_match, c_leones, jsonb_build_array(
    jsonb_build_object('profile_id', c_cap_leo, 'lineup_role', 'TITULAR'),
    jsonb_build_object('profile_id', '55555555-0000-0000-0000-000000000001', 'lineup_role', 'TITULAR'),
    jsonb_build_object('profile_id', '55555555-0000-0000-0000-000000000002', 'lineup_role', 'TITULAR'),
    jsonb_build_object('profile_id', '55555555-0000-0000-0000-000000000003', 'lineup_role', 'TITULAR'),
    jsonb_build_object('profile_id', '55555555-0000-0000-0000-000000000004', 'lineup_role', 'TITULAR'),
    jsonb_build_object('profile_id', '55555555-0000-0000-0000-000000000005', 'lineup_role', 'SUPLENTE')
  ));

  -- Lista 2: sale el jugador 5, entra el 6 como titular y el 4 baja al banco
  PERFORM public.submit_team_checkin(v_match, c_leones, jsonb_build_array(
    jsonb_build_object('profile_id', c_cap_leo, 'lineup_role', 'TITULAR'),
    jsonb_build_object('profile_id', '55555555-0000-0000-0000-000000000001', 'lineup_role', 'TITULAR'),
    jsonb_build_object('profile_id', '55555555-0000-0000-0000-000000000002', 'lineup_role', 'TITULAR'),
    jsonb_build_object('profile_id', '55555555-0000-0000-0000-000000000003', 'lineup_role', 'TITULAR'),
    jsonb_build_object('profile_id', '55555555-0000-0000-0000-000000000006', 'lineup_role', 'TITULAR'),
    jsonb_build_object('profile_id', '55555555-0000-0000-0000-000000000004', 'lineup_role', 'SUPLENTE')
  ));

  IF EXISTS (SELECT 1 FROM match_participants
             WHERE match_id = v_match AND profile_id = '55555555-0000-0000-0000-000000000005') THEN
    RAISE EXCEPTION 'S2 FALLÓ: el jugador removido sigue en la lista';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM match_participants
                 WHERE match_id = v_match AND profile_id = '55555555-0000-0000-0000-000000000004'
                   AND lineup_role = 'SUPLENTE') THEN
    RAISE EXCEPTION 'S2 FALLÓ: el cambio de rol TITULAR→SUPLENTE no se aplicó';
  END IF;
  SELECT count(*) INTO v_n FROM match_participants WHERE match_id = v_match AND team_id = c_leones;
  IF v_n <> 6 THEN RAISE EXCEPTION 'S2 FALLÓ: % convocados tras reemplazo (esperado 6)', v_n; END IF;
  -- La presencia previa del capitán no se pierde en el reemplazo
  IF NOT EXISTS (SELECT 1 FROM match_participants
                 WHERE match_id = v_match AND profile_id = c_cap_leo AND did_checkin) THEN
    RAISE EXCEPTION 'S2 FALLÓ: el reemplazo pisó el did_checkin del capitán';
  END IF;
  RAISE NOTICE 'S2 OK: re-presentación reemplaza la lista preservando presencia.';
END $$;
ROLLBACK;


-- ─── S3. Rechazos: cupos, autorización y payload ─────────────────────────────
BEGIN;
SELECT set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-000000000001"}', true);

-- Helper temporal (se descarta en el ROLLBACK): lista de n jugadores del
-- plantel de prueba (1..12), los primeros t como TITULAR.
CREATE FUNCTION pg_temp.build_list(n integer, t integer) RETURNS jsonb
LANGUAGE sql AS $fn$
  SELECT jsonb_agg(jsonb_build_object(
    'profile_id', '55555555-0000-0000-0000-0000000000' || lpad(g::text, 2, '0'),
    'lineup_role', CASE WHEN g <= t THEN 'TITULAR' ELSE 'SUPLENTE' END))
  FROM generate_series(1, n) g
$fn$;

DO $$
DECLARE
  c_leones  CONSTANT uuid := '22222222-2222-2222-2222-222222222221';
  c_tigres  CONSTANT uuid := '22222222-2222-2222-2222-222222222222';
  c_cap_leo CONSTANT uuid := '33333333-3333-3333-3333-000000000001';
  c_free    CONSTANT uuid := 'ef88b757-4d4e-48b1-b300-51da1cb2e678'; -- sin equipo
  v_match     uuid;
  v_pendiente uuid;
  i           integer;
BEGIN
  FOR i IN 1..12 LOOP
    INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
                            raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
                            confirmation_token, recovery_token, email_change, email_change_token_new)
    VALUES ('00000000-0000-0000-0000-000000000000',
            ('bbbbbbbb-0000-0000-0000-0000000000' || lpad(i::text, 2, '0'))::uuid,
            'authenticated', 'authenticated', 'sq.leo' || i || '@test.local', '', now(),
            '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', '');
    INSERT INTO profiles (id, auth_user_id, username, full_name, zone)
    VALUES (('55555555-0000-0000-0000-0000000000' || lpad(i::text, 2, '0'))::uuid,
            ('bbbbbbbb-0000-0000-0000-0000000000' || lpad(i::text, 2, '0'))::uuid,
            '__sq_leo' || i, 'SQ Leo ' || i, 'Palermo');
    INSERT INTO team_members (team_id, profile_id, role)
    VALUES (c_leones, ('55555555-0000-0000-0000-0000000000' || lpad(i::text, 2, '0'))::uuid, 'JUGADOR');
  END LOOP;

  INSERT INTO matches (team_a_id, team_b_id, match_type, status, format, scheduled_at, season_id)
  VALUES (c_leones, c_tigres, 'RANKING', 'CONFIRMADO', 'FUTBOL_5', now(),
          (SELECT id FROM seasons WHERE is_active = true))
  RETURNING id INTO v_match;
  INSERT INTO matches (team_a_id, team_b_id, match_type, status, scheduled_at, season_id)
  VALUES (c_leones, c_tigres, 'AMISTOSO', 'PENDIENTE', now() + interval '3 days',
          (SELECT id FROM seasons WHERE is_active = true))
  RETURNING id INTO v_pendiente;

  -- S3a: 3 titulares < mínimo 4 de F5
  BEGIN
    PERFORM public.submit_team_checkin(v_match, c_leones, pg_temp.build_list(3, 3));
    RAISE EXCEPTION 'S3a FALLÓ: aceptó una lista con 3 titulares en F5 (mínimo 4)';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM NOT LIKE 'MIN_STARTERS_NOT_MET%' THEN RAISE; END IF;
  END;

  -- S3b: 6 titulares > 5 en cancha
  BEGIN
    PERFORM public.submit_team_checkin(v_match, c_leones, pg_temp.build_list(6, 6));
    RAISE EXCEPTION 'S3b FALLÓ: aceptó 6 titulares en F5 (cancha de 5)';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM NOT LIKE 'TOO_MANY_STARTERS%' THEN RAISE; END IF;
  END;

  -- S3c: 11 convocados > máximo 10 de F5
  BEGIN
    PERFORM public.submit_team_checkin(v_match, c_leones, pg_temp.build_list(11, 5));
    RAISE EXCEPTION 'S3c FALLÓ: aceptó 11 convocados en F5 (máximo 10)';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM NOT LIKE 'SQUAD_LIMIT_EXCEEDED%' THEN RAISE; END IF;
  END;

  -- S3d: un JUGADOR raso no puede presentar la lista
  PERFORM set_config('request.jwt.claims', '{"sub":"bbbbbbbb-0000-0000-0000-000000000001"}', true);
  BEGIN
    PERFORM public.submit_team_checkin(v_match, c_leones, pg_temp.build_list(5, 5));
    RAISE EXCEPTION 'S3d FALLÓ: un JUGADOR sin rol de capitanía presentó la lista';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM NOT LIKE 'NOT_TEAM_ADMIN%' THEN RAISE; END IF;
  END;
  PERFORM set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-000000000001"}', true);

  -- S3e: jugador duplicado
  BEGIN
    PERFORM public.submit_team_checkin(v_match, c_leones, pg_temp.build_list(4, 4) ||
      jsonb_build_array(jsonb_build_object('profile_id', '55555555-0000-0000-0000-000000000001',
                                           'lineup_role', 'SUPLENTE')));
    RAISE EXCEPTION 'S3e FALLÓ: aceptó una lista con un jugador repetido';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM NOT LIKE 'DUPLICATE_PLAYER%' THEN RAISE; END IF;
  END;

  -- S3f: jugador ajeno (ni miembro ni invitado registrado)
  BEGIN
    PERFORM public.submit_team_checkin(v_match, c_leones, pg_temp.build_list(4, 4) ||
      jsonb_build_array(jsonb_build_object('profile_id', c_free, 'lineup_role', 'TITULAR')));
    RAISE EXCEPTION 'S3f FALLÓ: aceptó a un jugador que no es miembro ni invitado';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM NOT LIKE 'PLAYER_NOT_IN_TEAM%' THEN RAISE; END IF;
  END;

  -- S3g: partido no CONFIRMADO
  BEGIN
    PERFORM public.submit_team_checkin(v_pendiente, c_leones, pg_temp.build_list(5, 5));
    RAISE EXCEPTION 'S3g FALLÓ: aceptó lista con el partido PENDIENTE';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM NOT LIKE 'INVALID_MATCH_STATUS%' THEN RAISE; END IF;
  END;

  -- S3h: payload malformado (lineup_role inválido)
  BEGIN
    PERFORM public.submit_team_checkin(v_match, c_leones, jsonb_build_array(
      jsonb_build_object('profile_id', c_cap_leo, 'lineup_role', 'ARQUERO')));
    RAISE EXCEPTION 'S3h FALLÓ: aceptó un lineup_role inválido';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM NOT LIKE 'INVALID_PAYLOAD%' THEN RAISE; END IF;
  END;

  RAISE NOTICE 'S3 OK: los 8 rechazos responden con su código estable.';
END $$;
ROLLBACK;


-- ─── S4. Trigger: formato obligatorio al confirmar ───────────────────────────
BEGIN;
DO $$
DECLARE
  c_leones CONSTANT uuid := '22222222-2222-2222-2222-222222222221';
  c_tigres CONSTANT uuid := '22222222-2222-2222-2222-222222222222';
  v_match  uuid;
  v_legacy uuid;
BEGIN
  INSERT INTO matches (team_a_id, team_b_id, match_type, status, scheduled_at, season_id)
  VALUES (c_leones, c_tigres, 'AMISTOSO', 'PENDIENTE', now() + interval '3 days',
          (SELECT id FROM seasons WHERE is_active = true))
  RETURNING id INTO v_match;

  -- S4a: transición sin formato → rechazada
  BEGIN
    UPDATE matches SET status = 'CONFIRMADO' WHERE id = v_match;
    RAISE EXCEPTION 'S4a FALLÓ: un partido pasó a CONFIRMADO sin formato';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM NOT LIKE 'FORMAT_REQUIRED%' THEN RAISE; END IF;
  END;

  -- S4b: la misma transición con formato pasa
  UPDATE matches SET status = 'CONFIRMADO', format = 'FUTBOL_7' WHERE id = v_match;

  -- S4c: un histórico terminal con format NULL sigue siendo actualizable
  --      mientras no transicione (INSERT directo FINALIZADO, como el seed)
  INSERT INTO matches (team_a_id, team_b_id, match_type, status, scheduled_at, season_id)
  VALUES (c_leones, c_tigres, 'AMISTOSO', 'FINALIZADO', now() - interval '30 days',
          (SELECT id FROM seasons WHERE is_active = true))
  RETURNING id INTO v_legacy;
  UPDATE matches SET duration_minutes = 60 WHERE id = v_legacy;

  RAISE NOTICE 'S4 OK: FORMAT_REQUIRED sólo bloquea transiciones sin formato; históricos intactos.';
END $$;
ROLLBACK;


-- ─── S5. RLS: la lista masiva sólo entra por la RPC ──────────────────────────
BEGIN;
DO $$
DECLARE
  c_leones  CONSTANT uuid := '22222222-2222-2222-2222-222222222221';
  c_tigres  CONSTANT uuid := '22222222-2222-2222-2222-222222222222';
  c_cap_leo CONSTANT uuid := '33333333-3333-3333-3333-000000000001';
  c_free    CONSTANT uuid := 'ef88b757-4d4e-48b1-b300-51da1cb2e678';
BEGIN
  INSERT INTO matches (id, team_a_id, team_b_id, match_type, status, format, scheduled_at, season_id)
  VALUES ('44444444-4444-4444-4444-000000000099', c_leones, c_tigres, 'RANKING', 'CONFIRMADO',
          'FUTBOL_5', now(), (SELECT id FROM seasons WHERE is_active = true));
  -- Fila del capitán de Tigres pre-cargada para el intento de UPDATE ajeno
  INSERT INTO match_participants (match_id, profile_id, team_id, lineup_role)
  VALUES ('44444444-4444-4444-4444-000000000099',
          '33333333-3333-3333-3333-000000000004', c_tigres, 'SUPLENTE');
END $$;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-000000000001"}', true);
DO $$
DECLARE
  v_n integer;
BEGIN
  -- S5a: el capitán NO puede insertar una fila suelta (no-guest) por fuera de la RPC
  BEGIN
    INSERT INTO match_participants (match_id, profile_id, team_id, is_guest)
    VALUES ('44444444-4444-4444-4444-000000000099',
            '33333333-3333-3333-3333-000000000001',
            '22222222-2222-2222-2222-222222222221', false);
    RAISE EXCEPTION 'S5a FALLÓ: un capitán insertó una fila directa en match_participants';
  EXCEPTION WHEN insufficient_privilege OR check_violation THEN
    NULL; -- 42501: bloqueado por la política de INSERT
  END;

  -- S5b: el capitán NO puede tocar el lineup_role de una fila ajena
  BEGIN
    UPDATE match_participants SET did_checkin = true
    WHERE match_id = '44444444-4444-4444-4444-000000000099'
      AND profile_id = '33333333-3333-3333-3333-000000000004';
    GET DIAGNOSTICS v_n = ROW_COUNT;
    IF v_n > 0 THEN
      RAISE EXCEPTION 'S5b FALLÓ: un capitán actualizó la fila de otro jugador';
    END IF;
  END;

  -- S5c: nadie puede escribir lineup_role directo, ni en su propia fila
  BEGIN
    UPDATE match_participants SET lineup_role = 'TITULAR'
    WHERE profile_id = '33333333-3333-3333-3333-000000000001';
    RAISE EXCEPTION 'S5c FALLÓ: lineup_role es actualizable por fuera de la RPC';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL; -- 42501: sin grant de columna
  END;
END $$;

-- S5d: un invitado SÍ puede auto-registrarse (compat join_match_as_guest)
SELECT set_config('request.jwt.claims', '{"sub":"8e7bd5df-5201-4622-8f6b-b94725c18da8"}', true);
DO $$
BEGIN
  INSERT INTO match_participants (match_id, profile_id, team_id, is_guest)
  VALUES ('44444444-4444-4444-4444-000000000099',
          'ef88b757-4d4e-48b1-b300-51da1cb2e678',
          '22222222-2222-2222-2222-222222222221', true);
  RAISE NOTICE 'S5 OK: escrituras directas cerradas; alta self-service de invitado intacta.';
EXCEPTION WHEN insufficient_privilege OR check_violation THEN
  RAISE EXCEPTION 'S5d FALLÓ: el alta self-service de invitados quedó bloqueada (%)', SQLERRM;
END $$;
RESET ROLE;
ROLLBACK;
