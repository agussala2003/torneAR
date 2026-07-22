-- ============================================================
-- 260-rls-performance — Regresión de equivalencia RLS (pgTAP)
-- ============================================================
-- Migración declarativa de tests-legacy/rls_performance_regression.sql:
-- valida que la reescritura de 20260714144056_rls_performance_optimization.sql
-- (wrap de auth.uid() en (select auth.uid()) + consolidación de políticas
-- permisivas duplicadas) NO alteró permisos: nadie perdió ni ganó acceso.
--   S0 — Estructural: 0 políticas con auth.uid() sin cachear; exactamente
--        1 política permisiva por acción consolidada.
--   P1 — profiles: el usuario edita su propio perfil, no el ajeno.
--   P2 — challenges UPDATE consolidada: emisor cancela, receptor rechaza,
--        receptor NO cancela, un tercero no ve la fila.
--   P3 — team_join_requests UPDATE consolidada: admin del equipo resuelve,
--        el dueño sólo mantiene PENDIENTE, un admin ajeno no ve la fila.
--   P4 — team_members INSERT consolidada: bootstrap del capitán fundador OK;
--        alta de un jugador SIN solicitud rechazada.
--   P5 — messages INSERT (wrap): el participante envía, un extraño no.
--
-- Fidelidad al legacy: las aserciones de "N filas afectadas" usan ROW_COUNT
-- (helper tests.perf_rowcount, SECURITY INVOKER) en vez de RETURNING, para
-- depender sólo del privilegio de UPDATE/INSERT (no de SELECT) — igual que el
-- GET DIAGNOSTICS del original. Los rechazos por WITH CHECK usan throws_ok
-- con SQLSTATE 42501 (insufficient_privilege). La simulación de usuario usa
-- el helper tests.authenticate_as_profile(auth_uid) + tests.clear_auth().
--
-- IDs del seed: cap Tigres 0004 (auth ...-0004, equipo 2222...222) · cap
-- Leones 0001 (auth ...-0001, equipo 2222...221) · cap Rayos 0007
-- (auth ...-0007) · convo mercado 00861a5e-... · player ef88b757-...
-- (auth 8e7bd5df-...).
-- ============================================================

begin;
select plan(20);

-- Helper efímero: ejecuta un DML con el rol ACTUAL (invoker) y devuelve las
-- filas afectadas. No usa RETURNING → sólo requiere UPDATE/INSERT, no SELECT.
create function tests.perf_rowcount(p_sql text)
returns integer language plpgsql as $$
declare v_rows integer;
begin
  execute p_sql;
  get diagnostics v_rows = row_count;
  return v_rows;
end;
$$;
grant execute on function tests.perf_rowcount(text) to authenticated;

-- ════════════════════════════════════════════════════════════════════════════
-- S0 — Estructural (como postgres; lee el catálogo pg_policies)
-- ════════════════════════════════════════════════════════════════════════════
select is(
  (select count(*)::int from pg_policies
   where schemaname = 'public'
     and (replace(coalesce(qual, ''),       'SELECT auth.uid() AS uid', '') like '%auth.uid()%'
       or replace(coalesce(with_check, ''), 'SELECT auth.uid() AS uid', '') like '%auth.uid()%')),
  0, 'S0a: no quedan políticas con auth.uid() sin cachear');
select is(
  (select count(*)::int from pg_policies where schemaname='public' and tablename='challenges' and cmd='UPDATE'),
  1, 'S0b: challenges UPDATE tiene exactamente 1 política');
select is(
  (select count(*)::int from pg_policies where schemaname='public' and tablename='match_proposals' and cmd='UPDATE'),
  1, 'S0c: match_proposals UPDATE tiene exactamente 1 política');
select is(
  (select count(*)::int from pg_policies where schemaname='public' and tablename='team_join_requests' and cmd='UPDATE'),
  1, 'S0d: team_join_requests UPDATE tiene exactamente 1 política');
select is(
  (select count(*)::int from pg_policies where schemaname='public' and tablename='team_members' and cmd='INSERT'),
  1, 'S0e: team_members INSERT tiene exactamente 1 política');

-- ════════════════════════════════════════════════════════════════════════════
-- P1 — profiles: propio sí, ajeno no
-- ════════════════════════════════════════════════════════════════════════════
select tests.authenticate_as_profile('aaaaaaaa-0000-0000-0000-000000000004');
select is(
  tests.perf_rowcount($$ update public.profiles set full_name = full_name where id = '33333333-3333-3333-3333-000000000004' $$),
  1, 'P1a: el usuario edita su propio perfil (1 fila)');
select is(
  tests.perf_rowcount($$ update public.profiles set full_name = full_name where id = '33333333-3333-3333-3333-000000000001' $$),
  0, 'P1b: el usuario no edita un perfil ajeno (0 filas)');
select tests.clear_auth();

-- ════════════════════════════════════════════════════════════════════════════
-- P2 — challenges UPDATE consolidada
-- ════════════════════════════════════════════════════════════════════════════
insert into challenges (id, from_team_id, to_team_id, created_by, status)
values ('f2f2f2f2-0000-0000-0000-0000000000c1',
        '22222222-2222-2222-2222-222222222222', '22222222-2222-2222-2222-222222222221',
        '33333333-3333-3333-3333-000000000004', 'ENVIADA');

-- Tercero (Rayos 0007): no ve la fila → 0 filas.
select tests.authenticate_as_profile('aaaaaaaa-0000-0000-0000-000000000007');
select is(
  tests.perf_rowcount($$ update challenges set status = 'CANCELADA' where id = 'f2f2f2f2-0000-0000-0000-0000000000c1' $$),
  0, 'P2a: un tercero no toca un desafío ajeno (0 filas)');

-- Receptor (Leones 0001): NO puede CANCELAR (WITH CHECK → 42501).
select tests.authenticate_as_profile('aaaaaaaa-0000-0000-0000-000000000001');
select throws_ok(
  $$ update challenges set status = 'CANCELADA' where id = 'f2f2f2f2-0000-0000-0000-0000000000c1' $$,
  '42501', null, 'P2b: el receptor no puede CANCELAR el desafío del emisor');
-- Receptor SÍ RECHAZA.
select is(
  tests.perf_rowcount($$ update challenges set status = 'RECHAZADA' where id = 'f2f2f2f2-0000-0000-0000-0000000000c1' $$),
  1, 'P2c: el receptor sí puede RECHAZAR (1 fila)');

-- Emisor (Tigres 0004) SÍ CANCELA (se restablece a ENVIADA como postgres).
select tests.clear_auth();
update challenges set status = 'ENVIADA' where id = 'f2f2f2f2-0000-0000-0000-0000000000c1';
select tests.authenticate_as_profile('aaaaaaaa-0000-0000-0000-000000000004');
select is(
  tests.perf_rowcount($$ update challenges set status = 'CANCELADA' where id = 'f2f2f2f2-0000-0000-0000-0000000000c1' $$),
  1, 'P2d: el emisor sí puede CANCELAR (1 fila)');
select tests.clear_auth();

-- ════════════════════════════════════════════════════════════════════════════
-- P3 — team_join_requests UPDATE consolidada
-- ════════════════════════════════════════════════════════════════════════════
insert into team_join_requests (id, team_id, profile_id, status)
values ('f3f3f3f3-0000-0000-0000-0000000000c1',
        '22222222-2222-2222-2222-222222222222', '33333333-3333-3333-3333-000000000007', 'PENDIENTE');

-- Admin ajeno (Leones 0001): no ve la fila → 0 filas.
select tests.authenticate_as_profile('aaaaaaaa-0000-0000-0000-000000000001');
select is(
  tests.perf_rowcount($$ update team_join_requests set status = 'ACEPTADA' where id = 'f3f3f3f3-0000-0000-0000-0000000000c1' $$),
  0, 'P3a: un admin ajeno no toca la solicitud (0 filas)');

-- El dueño (Rayos 0007) NO puede auto-aceptarse (WITH CHECK → 42501).
select tests.authenticate_as_profile('aaaaaaaa-0000-0000-0000-000000000007');
select throws_ok(
  $$ update team_join_requests set status = 'ACEPTADA' where id = 'f3f3f3f3-0000-0000-0000-0000000000c1' $$,
  '42501', null, 'P3b: el solicitante no puede auto-aceptarse');
-- El dueño SÍ puede mantenerla PENDIENTE.
select is(
  tests.perf_rowcount($$ update team_join_requests set status = 'PENDIENTE' where id = 'f3f3f3f3-0000-0000-0000-0000000000c1' $$),
  1, 'P3c: el dueño sí puede mantener su solicitud PENDIENTE (1 fila)');

-- El admin del equipo (Tigres 0004) SÍ resuelve.
select tests.authenticate_as_profile('aaaaaaaa-0000-0000-0000-000000000004');
select is(
  tests.perf_rowcount($$ update team_join_requests set status = 'ACEPTADA' where id = 'f3f3f3f3-0000-0000-0000-0000000000c1' $$),
  1, 'P3d: el admin del equipo sí puede aceptar la solicitud (1 fila)');
select tests.clear_auth();

-- ════════════════════════════════════════════════════════════════════════════
-- P4 — team_members INSERT consolidada
-- ════════════════════════════════════════════════════════════════════════════
select tests.authenticate_as_profile('aaaaaaaa-0000-0000-0000-000000000001');
select is(
  tests.perf_rowcount($$ insert into teams (id, name, category, zone, preferred_format)
    values ('f4f4f4f4-0000-0000-0000-0000000000c1', '__TEST RLS BOOTSTRAP', 'MIXTO', 'Palermo', 'FUTBOL_5') $$),
  1, 'P4a: el usuario puede crear un equipo');
select is(
  tests.perf_rowcount($$ insert into team_members (team_id, profile_id, role)
    values ('f4f4f4f4-0000-0000-0000-0000000000c1', '33333333-3333-3333-3333-000000000001', 'CAPITAN') $$),
  1, 'P4b: bootstrap del capitán fundador OK');
select throws_ok(
  $$ insert into team_members (team_id, profile_id, role)
     values ('f4f4f4f4-0000-0000-0000-0000000000c1', '33333333-3333-3333-3333-000000000007', 'JUGADOR') $$,
  '42501', null, 'P4c: alta de un jugador sin solicitud de unión rechazada');
select tests.clear_auth();

-- ════════════════════════════════════════════════════════════════════════════
-- P5 — messages INSERT (wrap): miembro sí, extraño no
-- ════════════════════════════════════════════════════════════════════════════
-- El player de la conversación de mercado envía un mensaje.
select tests.authenticate_as_profile('8e7bd5df-5201-4622-8f6b-b94725c18da8');
select is(
  tests.perf_rowcount($$ insert into messages (conversation_id, sender_profile_id, content)
    values ('00861a5e-e9f1-4e20-8a9f-9bd1341c5d2a', 'ef88b757-4d4e-48b1-b300-51da1cb2e678', '__test rls wrap') $$),
  1, 'P5a: el participante de la conversación envía un mensaje');

-- Un usuario ajeno a la conversación no puede (WITH CHECK → 42501).
select tests.authenticate_as_profile('aaaaaaaa-0000-0000-0000-000000000004');
select throws_ok(
  $$ insert into messages (conversation_id, sender_profile_id, content)
     values ('00861a5e-e9f1-4e20-8a9f-9bd1341c5d2a', '33333333-3333-3333-3333-000000000004', '__test intruso') $$,
  '42501', null, 'P5b: un extraño no puede insertar en una conversación ajena');
select tests.clear_auth();

select * from finish();
rollback;
