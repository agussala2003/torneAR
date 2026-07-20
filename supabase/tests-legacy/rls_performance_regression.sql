-- ============================================================
-- RLS PERFORMANCE — REGRESIÓN DE EQUIVALENCIA — 2026-07-14
-- ============================================================
-- Valida que la reescritura de políticas de
-- 20260714_rls_performance_optimization.sql (wrap de auth.uid() en
-- (select auth.uid()) + consolidación de políticas permisivas duplicadas)
-- NO alteró permisos: nadie perdió acceso y nadie ganó acceso indebido.
--
--   S0 — Estructural: 0 políticas con auth.uid() sin cachear; exactamente
--        1 política permisiva por acción consolidada.
--   P1 — profiles: el usuario edita su propio perfil, no el ajeno.
--   P2 — challenges UPDATE consolidada: el emisor CANCELA, el receptor
--        RECHAZA, el receptor NO puede cancelar, un tercero no ve la fila.
--   P3 — team_join_requests UPDATE consolidada: el admin del equipo
--        resuelve, el dueño sólo mantiene PENDIENTE (no puede auto-aceptarse),
--        un admin ajeno no ve la fila.
--   P4 — team_members INSERT consolidada: bootstrap del capitán fundador OK;
--        alta de un jugador SIN solicitud de unión rechazada.
--   P5 — messages INSERT (wrap): el participante de la conversación envía,
--        un extraño no.
--
-- Cada bloque corre en BEGIN...ROLLBACK (cero persistencia) y es
-- auto-verificante: EXCEPTION "Px FALLÓ:" si la equivalencia se rompió.
-- La simulación de usuario usa set_config('role','authenticated') +
-- request.jwt.claims, y se revierte con set_config('role','none').
--
-- IDs de seed usados (si el seed cambia, actualizar acá):
--   capitán Tigres  : 33333333-3333-3333-3333-000000000004 (auth aaaaaaaa-...-0004)
--     equipo Tigres : 22222222-2222-2222-2222-222222222222
--   capitán Leones  : 33333333-3333-3333-3333-000000000001 (auth aaaaaaaa-...-0001)
--     equipo Leones : 22222222-2222-2222-2222-222222222221
--   capitán Rayos   : 33333333-3333-3333-3333-000000000007 (auth aaaaaaaa-...-0007)
--   market convo    : 00861a5e-e9f1-4e20-8a9f-9bd1341c5d2a
--     player        : ef88b757-4d4e-48b1-b300-51da1cb2e678 (auth 8e7bd5df-5201-4622-8f6b-b94725c18da8)
--
-- Última corrida: 14 jul 2026 — S0 + P1-P5 OK contra el proyecto real.
-- ============================================================


-- ─── S0. Estructural ──────────────────────────────────────────────────────────
BEGIN;
DO $$
DECLARE
  v_bare integer;
  v_n    integer;
BEGIN
  SELECT count(*) INTO v_bare
  FROM pg_policies
  WHERE schemaname = 'public'
    AND (
      replace(coalesce(qual, ''), 'SELECT auth.uid() AS uid', '') LIKE '%auth.uid()%'
      OR replace(coalesce(with_check, ''), 'SELECT auth.uid() AS uid', '') LIKE '%auth.uid()%'
    );
  IF v_bare > 0 THEN
    RAISE EXCEPTION 'S0 FALLÓ: quedan % políticas con auth.uid() sin cachear', v_bare;
  END IF;

  SELECT count(*) INTO v_n FROM pg_policies WHERE schemaname='public' AND tablename='challenges' AND cmd='UPDATE';
  IF v_n <> 1 THEN RAISE EXCEPTION 'S0 FALLÓ: challenges UPDATE tiene % políticas', v_n; END IF;
  SELECT count(*) INTO v_n FROM pg_policies WHERE schemaname='public' AND tablename='match_proposals' AND cmd='UPDATE';
  IF v_n <> 1 THEN RAISE EXCEPTION 'S0 FALLÓ: match_proposals UPDATE tiene % políticas', v_n; END IF;
  SELECT count(*) INTO v_n FROM pg_policies WHERE schemaname='public' AND tablename='team_join_requests' AND cmd='UPDATE';
  IF v_n <> 1 THEN RAISE EXCEPTION 'S0 FALLÓ: team_join_requests UPDATE tiene % políticas', v_n; END IF;
  SELECT count(*) INTO v_n FROM pg_policies WHERE schemaname='public' AND tablename='team_members' AND cmd='INSERT';
  IF v_n <> 1 THEN RAISE EXCEPTION 'S0 FALLÓ: team_members INSERT tiene % políticas', v_n; END IF;
  RAISE NOTICE 'S0 OK: estructura de políticas correcta.';
END $$;
ROLLBACK;


-- ─── P1. profiles: propio sí, ajeno no ────────────────────────────────────────
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-000000000004"}', true);
DO $$
DECLARE v_rows integer;
BEGIN
  UPDATE public.profiles SET full_name = full_name
   WHERE id = '33333333-3333-3333-3333-000000000004';
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 1 THEN RAISE EXCEPTION 'P1 FALLÓ: no pudo editar su propio perfil (% filas)', v_rows; END IF;

  UPDATE public.profiles SET full_name = full_name
   WHERE id = '33333333-3333-3333-3333-000000000001';
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 0 THEN RAISE EXCEPTION 'P1 FALLÓ: pudo editar un perfil ajeno (% filas)', v_rows; END IF;
  RAISE NOTICE 'P1 OK: perfil propio editable, ajeno no.';
END $$;
ROLLBACK;


-- ─── P2. challenges UPDATE consolidada ────────────────────────────────────────
BEGIN;
DO $$
DECLARE
  v_ch   uuid;
  v_rows integer;
BEGIN
  INSERT INTO challenges (from_team_id, to_team_id, created_by, status)
  VALUES ('22222222-2222-2222-2222-222222222222', '22222222-2222-2222-2222-222222222221',
          '33333333-3333-3333-3333-000000000004', 'ENVIADA')
  RETURNING id INTO v_ch;

  -- Tercero: 0 filas.
  PERFORM set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-000000000007"}', true);
  PERFORM set_config('role', 'authenticated', true);
  UPDATE challenges SET status = 'CANCELADA' WHERE id = v_ch;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  PERFORM set_config('role', 'none', true);
  IF v_rows <> 0 THEN RAISE EXCEPTION 'P2 FALLÓ: un tercero tocó un desafío ajeno (% filas)', v_rows; END IF;

  -- Receptor no puede CANCELAR.
  PERFORM set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-000000000001"}', true);
  PERFORM set_config('role', 'authenticated', true);
  BEGIN
    UPDATE challenges SET status = 'CANCELADA' WHERE id = v_ch;
    PERFORM set_config('role', 'none', true);
    RAISE EXCEPTION 'P2 FALLÓ: el receptor pudo CANCELAR el desafío del emisor';
  EXCEPTION
    WHEN insufficient_privilege THEN PERFORM set_config('role', 'none', true);
  END;

  -- Receptor sí RECHAZA.
  PERFORM set_config('role', 'authenticated', true);
  UPDATE challenges SET status = 'RECHAZADA' WHERE id = v_ch;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  PERFORM set_config('role', 'none', true);
  IF v_rows <> 1 THEN RAISE EXCEPTION 'P2 FALLÓ: el receptor no pudo rechazar (% filas)', v_rows; END IF;

  -- Emisor sí CANCELA.
  UPDATE challenges SET status = 'ENVIADA' WHERE id = v_ch;
  PERFORM set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-000000000004"}', true);
  PERFORM set_config('role', 'authenticated', true);
  UPDATE challenges SET status = 'CANCELADA' WHERE id = v_ch;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  PERFORM set_config('role', 'none', true);
  IF v_rows <> 1 THEN RAISE EXCEPTION 'P2 FALLÓ: el emisor no pudo cancelar (% filas)', v_rows; END IF;
  RAISE NOTICE 'P2 OK: matriz de permisos de challenges intacta.';
END $$;
ROLLBACK;


-- ─── P3. team_join_requests UPDATE consolidada ────────────────────────────────
BEGIN;
DO $$
DECLARE
  v_req  uuid;
  v_rows integer;
BEGIN
  -- Solicitud del capitán de Rayos (0007) para unirse a Tigres.
  INSERT INTO team_join_requests (team_id, profile_id, status)
  VALUES ('22222222-2222-2222-2222-222222222222', '33333333-3333-3333-3333-000000000007', 'PENDIENTE')
  RETURNING id INTO v_req;

  -- Admin ajeno (capitán de Leones): 0 filas.
  PERFORM set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-000000000001"}', true);
  PERFORM set_config('role', 'authenticated', true);
  UPDATE team_join_requests SET status = 'ACEPTADA' WHERE id = v_req;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  PERFORM set_config('role', 'none', true);
  IF v_rows <> 0 THEN RAISE EXCEPTION 'P3 FALLÓ: un admin ajeno tocó la solicitud (% filas)', v_rows; END IF;

  -- El dueño NO puede auto-aceptarse.
  PERFORM set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-000000000007"}', true);
  PERFORM set_config('role', 'authenticated', true);
  BEGIN
    UPDATE team_join_requests SET status = 'ACEPTADA' WHERE id = v_req;
    PERFORM set_config('role', 'none', true);
    RAISE EXCEPTION 'P3 FALLÓ: el solicitante se auto-aceptó';
  EXCEPTION
    WHEN insufficient_privilege THEN PERFORM set_config('role', 'none', true);
  END;

  -- El dueño sí puede tocar su solicitud manteniéndola PENDIENTE.
  PERFORM set_config('role', 'authenticated', true);
  UPDATE team_join_requests SET status = 'PENDIENTE' WHERE id = v_req;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  PERFORM set_config('role', 'none', true);
  IF v_rows <> 1 THEN RAISE EXCEPTION 'P3 FALLÓ: el dueño no pudo mantener PENDIENTE (% filas)', v_rows; END IF;

  -- El admin del equipo sí resuelve.
  PERFORM set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-000000000004"}', true);
  PERFORM set_config('role', 'authenticated', true);
  UPDATE team_join_requests SET status = 'ACEPTADA' WHERE id = v_req;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  PERFORM set_config('role', 'none', true);
  IF v_rows <> 1 THEN RAISE EXCEPTION 'P3 FALLÓ: el admin del equipo no pudo aceptar (% filas)', v_rows; END IF;
  RAISE NOTICE 'P3 OK: matriz de permisos de team_join_requests intacta.';
END $$;
ROLLBACK;


-- ─── P4. team_members INSERT consolidada ──────────────────────────────────────
BEGIN;
DO $$
DECLARE
  v_team uuid;
BEGIN
  -- Bootstrap: el usuario crea un equipo y se inserta como CAPITAN.
  PERFORM set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-000000000001"}', true);
  PERFORM set_config('role', 'authenticated', true);
  INSERT INTO teams (name, category, zone, preferred_format)
  VALUES ('__TEST RLS BOOTSTRAP', 'MIXTO', 'Palermo', 'FUTBOL_5') RETURNING id INTO v_team;
  INSERT INTO team_members (team_id, profile_id, role)
  VALUES (v_team, '33333333-3333-3333-3333-000000000001', 'CAPITAN');

  -- Alta de un jugador SIN solicitud de unión: rechazada.
  BEGIN
    INSERT INTO team_members (team_id, profile_id, role)
    VALUES (v_team, '33333333-3333-3333-3333-000000000007', 'JUGADOR');
    PERFORM set_config('role', 'none', true);
    RAISE EXCEPTION 'P4 FALLÓ: alta de jugador sin solicitud de unión aceptada';
  EXCEPTION
    WHEN insufficient_privilege THEN PERFORM set_config('role', 'none', true);
  END;
  RAISE NOTICE 'P4 OK: bootstrap del capitán funciona, alta sin request bloqueada.';
END $$;
ROLLBACK;


-- ─── P5. messages INSERT (wrap): miembro sí, extraño no ───────────────────────
BEGIN;
DO $$
DECLARE
  v_rows integer;
BEGIN
  -- El player de la conversación de mercado envía un mensaje.
  PERFORM set_config('request.jwt.claims', '{"sub":"8e7bd5df-5201-4622-8f6b-b94725c18da8"}', true);
  PERFORM set_config('role', 'authenticated', true);
  INSERT INTO messages (conversation_id, sender_profile_id, content)
  VALUES ('00861a5e-e9f1-4e20-8a9f-9bd1341c5d2a', 'ef88b757-4d4e-48b1-b300-51da1cb2e678', '__test rls wrap');
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  PERFORM set_config('role', 'none', true);
  IF v_rows <> 1 THEN RAISE EXCEPTION 'P5 FALLÓ: el participante no pudo enviar mensaje'; END IF;

  -- Un usuario ajeno a la conversación no puede.
  PERFORM set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-000000000004"}', true);
  PERFORM set_config('role', 'authenticated', true);
  BEGIN
    INSERT INTO messages (conversation_id, sender_profile_id, content)
    VALUES ('00861a5e-e9f1-4e20-8a9f-9bd1341c5d2a', '33333333-3333-3333-3333-000000000004', '__test intruso');
    PERFORM set_config('role', 'none', true);
    RAISE EXCEPTION 'P5 FALLÓ: un extraño insertó un mensaje en una conversación ajena';
  EXCEPTION
    WHEN insufficient_privilege THEN PERFORM set_config('role', 'none', true);
  END;
  RAISE NOTICE 'P5 OK: INSERT de messages sigue correctamente restringido.';
END $$;
ROLLBACK;
