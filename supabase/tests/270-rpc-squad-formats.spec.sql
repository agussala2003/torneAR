-- ============================================================
-- 270-rpc-squad-formats — Planteles, formatos y suplentes (pgTAP)
-- ============================================================
-- Migración declarativa de tests-legacy/squad_formats.sql. Valida
-- 20260714200000 (estructura) y 20260714201000 (submit_team_checkin + RLS):
--   S1 — Camino feliz: 5 TITULAR + 2 SUPLENTE en F5; roles persistidos,
--        sello de check-in por equipo, caller con presencia + result loader;
--        el rival presenta la suya → EN_VIVO.
--   S2 — Re-presentación: la lista se REEMPLAZA (sale uno, entra otro,
--        cambian roles) preservando la presencia previa.
--   S3 — 8 rechazos con su código: MIN_STARTERS_NOT_MET, TOO_MANY_STARTERS,
--        SQUAD_LIMIT_EXCEEDED, NOT_TEAM_ADMIN, DUPLICATE_PLAYER,
--        PLAYER_NOT_IN_TEAM, INVALID_MATCH_STATUS, INVALID_PAYLOAD.
--   S4 — Trigger FORMAT_REQUIRED: PENDIENTE→CONFIRMADO sin formato falla;
--        con formato pasa; históricos con format NULL siguen actualizables.
--   S5 — RLS endurecida: un capitán NO inserta filas sueltas ni toca
--        lineup_role/filas ajenas; un invitado SÍ se auto-registra.
--
-- Estructura: pgTAP corre todo en UNA transacción. Se crea UN roster
-- compartido (Leones 01..12, Tigres 21..26 — rangos disjuntos para que
-- ningún perfil quede en dos equipos) y cada escenario usa su propio match
-- con UUID determinista (77777777-...-000N), así no comparten estado.
-- S1..S4 corren como postgres seteando sólo request.jwt.claims (auth.uid()
-- para la RPC SECURITY DEFINER); S5 usa tests.authenticate_as_profile porque
-- prueba RLS con DML directo (necesita el rol authenticated).
--
-- IDs del seed: cap Leones 0001 (auth ...-001, equipo 2222...221) · cap
-- Tigres 0004 (auth ...-004, equipo 2222...222) · jugador libre ef88b757
-- (auth 8e7bd5df-...). Roster extra: profiles 55555555-...-NN / auth
-- bbbbbbbb-...-NN, descartados en el ROLLBACK.
-- ============================================================

begin;
select plan(25);

-- ── Helpers efímeros ────────────────────────────────────────────────────────
-- Lista de n jugadores del roster de Leones (1..12), los primeros t TITULAR.
create function pg_temp.sq_build_list(n integer, t integer) returns jsonb
language sql as $fn$
  select jsonb_agg(jsonb_build_object(
    'profile_id', '55555555-0000-0000-0000-0000000000' || lpad(g::text, 2, '0'),
    'lineup_role', case when g <= t then 'TITULAR' else 'SUPLENTE' end))
  from generate_series(1, n) g
$fn$;

-- DML con el rol actual (invoker) devolviendo ROW_COUNT (para el 0-filas de RLS).
create function tests.sq_rowcount(p_sql text) returns integer
language plpgsql as $$
declare v_rows integer;
begin
  execute p_sql;
  get diagnostics v_rows = row_count;
  return v_rows;
end;
$$;
grant execute on function tests.sq_rowcount(text) to authenticated;

-- ── Roster compartido (como postgres) ───────────────────────────────────────
-- Leones: 12 jugadores (profiles 01..12 / auth 01..12).
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
                        raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
                        confirmation_token, recovery_token, email_change, email_change_token_new)
select '00000000-0000-0000-0000-000000000000',
       ('bbbbbbbb-0000-0000-0000-0000000000' || lpad(g::text, 2, '0'))::uuid,
       'authenticated', 'authenticated', 'sq.leo' || g || '@test.local', '', now(),
       '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', ''
from generate_series(1, 12) g;
insert into profiles (id, auth_user_id, username, full_name, zone)
select ('55555555-0000-0000-0000-0000000000' || lpad(g::text, 2, '0'))::uuid,
       ('bbbbbbbb-0000-0000-0000-0000000000' || lpad(g::text, 2, '0'))::uuid,
       '__sq_leo' || g, 'SQ Leo ' || g, 'Palermo'
from generate_series(1, 12) g;
insert into team_members (team_id, profile_id, role)
select '22222222-2222-2222-2222-222222222221',
       ('55555555-0000-0000-0000-0000000000' || lpad(g::text, 2, '0'))::uuid, 'JUGADOR'
from generate_series(1, 12) g;

-- Tigres: 6 jugadores (profiles 21..26 / auth 21..26).
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
                        raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
                        confirmation_token, recovery_token, email_change, email_change_token_new)
select '00000000-0000-0000-0000-000000000000',
       ('bbbbbbbb-0000-0000-0000-0000000000' || lpad(g::text, 2, '0'))::uuid,
       'authenticated', 'authenticated', 'sq.tig' || g || '@test.local', '', now(),
       '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', ''
from generate_series(21, 26) g;
insert into profiles (id, auth_user_id, username, full_name, zone)
select ('55555555-0000-0000-0000-0000000000' || lpad(g::text, 2, '0'))::uuid,
       ('bbbbbbbb-0000-0000-0000-0000000000' || lpad(g::text, 2, '0'))::uuid,
       '__sq_tig' || g, 'SQ Tig ' || g, 'Palermo'
from generate_series(21, 26) g;
insert into team_members (team_id, profile_id, role)
select '22222222-2222-2222-2222-222222222222',
       ('55555555-0000-0000-0000-0000000000' || lpad(g::text, 2, '0'))::uuid, 'JUGADOR'
from generate_series(21, 26) g;

-- ════════════════════════════════════════════════════════════════════════════
-- S1 — Camino feliz: lista válida, sellos por equipo y pase a EN_VIVO
-- ════════════════════════════════════════════════════════════════════════════
insert into matches (id, team_a_id, team_b_id, match_type, status, format, scheduled_at, season_id)
values ('77777777-0000-0000-0000-000000000001',
        '22222222-2222-2222-2222-222222222221', '22222222-2222-2222-2222-222222222222',
        'RANKING', 'CONFIRMADO', 'FUTBOL_5', now(), (select id from seasons where is_active = true));

-- Leones presenta: cap + 4 titulares + 2 suplentes (7 <= max 10).
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-000000000001"}', true);
create temp table s1_res as select public.submit_team_checkin(
  '77777777-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222221',
  jsonb_build_array(
    jsonb_build_object('profile_id', '33333333-3333-3333-3333-000000000001', 'lineup_role', 'TITULAR'),
    jsonb_build_object('profile_id', '55555555-0000-0000-0000-000000000001', 'lineup_role', 'TITULAR'),
    jsonb_build_object('profile_id', '55555555-0000-0000-0000-000000000002', 'lineup_role', 'TITULAR'),
    jsonb_build_object('profile_id', '55555555-0000-0000-0000-000000000003', 'lineup_role', 'TITULAR'),
    jsonb_build_object('profile_id', '55555555-0000-0000-0000-000000000004', 'lineup_role', 'TITULAR'),
    jsonb_build_object('profile_id', '55555555-0000-0000-0000-000000000005', 'lineup_role', 'SUPLENTE'),
    jsonb_build_object('profile_id', '55555555-0000-0000-0000-000000000006', 'lineup_role', 'SUPLENTE'))) as r;

select results_eq(
  $$ select (r->>'starters')::int, (r->>'substitutes')::int from s1_res $$,
  $$ values (5, 2) $$, 'S1-1: el resumen devuelve 5 titulares y 2 suplentes');
select is(
  (select count(*)::int from match_participants where match_id='77777777-0000-0000-0000-000000000001'
     and team_id='22222222-2222-2222-2222-222222222221' and lineup_role='TITULAR'),
  5, 'S1-2: 5 titulares persistidos');
select is(
  (select count(*)::int from match_participants where match_id='77777777-0000-0000-0000-000000000001'
     and team_id='22222222-2222-2222-2222-222222222221' and lineup_role='SUPLENTE'),
  2, 'S1-3: 2 suplentes persistidos');
select isnt_empty(
  $$ select 1 from match_participants where match_id='77777777-0000-0000-0000-000000000001'
       and profile_id='33333333-3333-3333-3333-000000000001' and did_checkin and is_result_loader $$,
  'S1-4: el capitán queda con did_checkin + is_result_loader');
select results_eq(
  $$ select checkin_team_a_at is not null, status::text from matches where id='77777777-0000-0000-0000-000000000001' $$,
  $$ values (true, 'CONFIRMADO') $$, 'S1-5: tras la 1a lista, sello A puesto y sigue CONFIRMADO');

-- El rival (Tigres) presenta la suya → EN_VIVO.
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-000000000004"}', true);
select public.submit_team_checkin(
  '77777777-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222',
  jsonb_build_array(
    jsonb_build_object('profile_id', '33333333-3333-3333-3333-000000000004', 'lineup_role', 'TITULAR'),
    jsonb_build_object('profile_id', '55555555-0000-0000-0000-000000000021', 'lineup_role', 'TITULAR'),
    jsonb_build_object('profile_id', '55555555-0000-0000-0000-000000000022', 'lineup_role', 'TITULAR'),
    jsonb_build_object('profile_id', '55555555-0000-0000-0000-000000000023', 'lineup_role', 'TITULAR'),
    jsonb_build_object('profile_id', '55555555-0000-0000-0000-000000000024', 'lineup_role', 'TITULAR')));
select results_eq(
  $$ select status::text, started_at is not null, checkin_team_b_at is not null
     from matches where id='77777777-0000-0000-0000-000000000001' $$,
  $$ values ('EN_VIVO', true, true) $$, 'S1-6: con ambas listas pasa a EN_VIVO con started_at y sello B');

-- ════════════════════════════════════════════════════════════════════════════
-- S2 — Re-presentación: la lista se reemplaza preservando la presencia
-- ════════════════════════════════════════════════════════════════════════════
insert into matches (id, team_a_id, team_b_id, match_type, status, format, scheduled_at, season_id)
values ('77777777-0000-0000-0000-000000000002',
        '22222222-2222-2222-2222-222222222221', '22222222-2222-2222-2222-222222222222',
        'RANKING', 'CONFIRMADO', 'FUTBOL_5', now(), (select id from seasons where is_active = true));
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-000000000001"}', true);

-- Lista 1: cap + 01..04 titulares, 05 suplente.
select public.submit_team_checkin(
  '77777777-0000-0000-0000-000000000002', '22222222-2222-2222-2222-222222222221',
  jsonb_build_array(
    jsonb_build_object('profile_id', '33333333-3333-3333-3333-000000000001', 'lineup_role', 'TITULAR'),
    jsonb_build_object('profile_id', '55555555-0000-0000-0000-000000000001', 'lineup_role', 'TITULAR'),
    jsonb_build_object('profile_id', '55555555-0000-0000-0000-000000000002', 'lineup_role', 'TITULAR'),
    jsonb_build_object('profile_id', '55555555-0000-0000-0000-000000000003', 'lineup_role', 'TITULAR'),
    jsonb_build_object('profile_id', '55555555-0000-0000-0000-000000000004', 'lineup_role', 'TITULAR'),
    jsonb_build_object('profile_id', '55555555-0000-0000-0000-000000000005', 'lineup_role', 'SUPLENTE')));
-- Lista 2: sale 05, entra 06 titular, 04 baja al banco.
select public.submit_team_checkin(
  '77777777-0000-0000-0000-000000000002', '22222222-2222-2222-2222-222222222221',
  jsonb_build_array(
    jsonb_build_object('profile_id', '33333333-3333-3333-3333-000000000001', 'lineup_role', 'TITULAR'),
    jsonb_build_object('profile_id', '55555555-0000-0000-0000-000000000001', 'lineup_role', 'TITULAR'),
    jsonb_build_object('profile_id', '55555555-0000-0000-0000-000000000002', 'lineup_role', 'TITULAR'),
    jsonb_build_object('profile_id', '55555555-0000-0000-0000-000000000003', 'lineup_role', 'TITULAR'),
    jsonb_build_object('profile_id', '55555555-0000-0000-0000-000000000006', 'lineup_role', 'TITULAR'),
    jsonb_build_object('profile_id', '55555555-0000-0000-0000-000000000004', 'lineup_role', 'SUPLENTE')));

select is_empty(
  $$ select 1 from match_participants where match_id='77777777-0000-0000-0000-000000000002'
       and profile_id='55555555-0000-0000-0000-000000000005' $$,
  'S2-1: el jugador removido ya no está en la lista');
select isnt_empty(
  $$ select 1 from match_participants where match_id='77777777-0000-0000-0000-000000000002'
       and profile_id='55555555-0000-0000-0000-000000000004' and lineup_role='SUPLENTE' $$,
  'S2-2: el cambio de rol TITULAR→SUPLENTE se aplicó');
select is(
  (select count(*)::int from match_participants where match_id='77777777-0000-0000-0000-000000000002'
     and team_id='22222222-2222-2222-2222-222222222221'),
  6, 'S2-3: 6 convocados tras el reemplazo');
select isnt_empty(
  $$ select 1 from match_participants where match_id='77777777-0000-0000-0000-000000000002'
       and profile_id='33333333-3333-3333-3333-000000000001' and did_checkin $$,
  'S2-4: el reemplazo preserva el did_checkin del capitán');

-- ════════════════════════════════════════════════════════════════════════════
-- S3 — Rechazos: cupos, autorización y payload (cada uno con su código)
-- ════════════════════════════════════════════════════════════════════════════
insert into matches (id, team_a_id, team_b_id, match_type, status, format, scheduled_at, season_id) values
  ('77777777-0000-0000-0000-000000000003', '22222222-2222-2222-2222-222222222221', '22222222-2222-2222-2222-222222222222',
   'RANKING', 'CONFIRMADO', 'FUTBOL_5', now(), (select id from seasons where is_active = true)),
  ('77777777-0000-0000-0000-000000000004', '22222222-2222-2222-2222-222222222221', '22222222-2222-2222-2222-222222222222',
   'AMISTOSO', 'PENDIENTE', null, now() + interval '3 days', (select id from seasons where is_active = true));
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-000000000001"}', true);

select throws_matching(
  $$ select public.submit_team_checkin('77777777-0000-0000-0000-000000000003', '22222222-2222-2222-2222-222222222221', pg_temp.sq_build_list(3, 3)) $$,
  'MIN_STARTERS_NOT_MET', 'S3a: 3 titulares < mínimo 4 de F5');
select throws_matching(
  $$ select public.submit_team_checkin('77777777-0000-0000-0000-000000000003', '22222222-2222-2222-2222-222222222221', pg_temp.sq_build_list(6, 6)) $$,
  'TOO_MANY_STARTERS', 'S3b: 6 titulares > 5 en cancha de F5');
select throws_matching(
  $$ select public.submit_team_checkin('77777777-0000-0000-0000-000000000003', '22222222-2222-2222-2222-222222222221', pg_temp.sq_build_list(11, 5)) $$,
  'SQUAD_LIMIT_EXCEEDED', 'S3c: 11 convocados > máximo 10 de F5');

-- S3d: un JUGADOR raso (auth del roster 01) no puede presentar la lista.
select set_config('request.jwt.claims', '{"sub":"bbbbbbbb-0000-0000-0000-000000000001"}', true);
select throws_matching(
  $$ select public.submit_team_checkin('77777777-0000-0000-0000-000000000003', '22222222-2222-2222-2222-222222222221', pg_temp.sq_build_list(5, 5)) $$,
  'NOT_TEAM_ADMIN', 'S3d: un JUGADOR sin rol de capitanía no presenta la lista');
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-000000000001"}', true);

select throws_matching(
  $$ select public.submit_team_checkin('77777777-0000-0000-0000-000000000003', '22222222-2222-2222-2222-222222222221',
       pg_temp.sq_build_list(4, 4) || jsonb_build_array(jsonb_build_object('profile_id', '55555555-0000-0000-0000-000000000001', 'lineup_role', 'SUPLENTE'))) $$,
  'DUPLICATE_PLAYER', 'S3e: jugador repetido en la lista');
select throws_matching(
  $$ select public.submit_team_checkin('77777777-0000-0000-0000-000000000003', '22222222-2222-2222-2222-222222222221',
       pg_temp.sq_build_list(4, 4) || jsonb_build_array(jsonb_build_object('profile_id', 'ef88b757-4d4e-48b1-b300-51da1cb2e678', 'lineup_role', 'TITULAR'))) $$,
  'PLAYER_NOT_IN_TEAM', 'S3f: jugador que no es miembro ni invitado');
select throws_matching(
  $$ select public.submit_team_checkin('77777777-0000-0000-0000-000000000004', '22222222-2222-2222-2222-222222222221', pg_temp.sq_build_list(5, 5)) $$,
  'INVALID_MATCH_STATUS', 'S3g: el partido no está CONFIRMADO');
select throws_matching(
  $$ select public.submit_team_checkin('77777777-0000-0000-0000-000000000003', '22222222-2222-2222-2222-222222222221',
       jsonb_build_array(jsonb_build_object('profile_id', '33333333-3333-3333-3333-000000000001', 'lineup_role', 'ARQUERO'))) $$,
  'INVALID_PAYLOAD', 'S3h: lineup_role inválido en el payload');

-- ════════════════════════════════════════════════════════════════════════════
-- S4 — Trigger FORMAT_REQUIRED (como postgres; prueba el trigger, no RLS)
-- ════════════════════════════════════════════════════════════════════════════
insert into matches (id, team_a_id, team_b_id, match_type, status, scheduled_at, season_id)
values ('77777777-0000-0000-0000-000000000005', '22222222-2222-2222-2222-222222222221', '22222222-2222-2222-2222-222222222222',
        'AMISTOSO', 'PENDIENTE', now() + interval '3 days', (select id from seasons where is_active = true));

select throws_matching(
  $$ update matches set status = 'CONFIRMADO' where id = '77777777-0000-0000-0000-000000000005' $$,
  'FORMAT_REQUIRED', 'S4a: PENDIENTE→CONFIRMADO sin formato es rechazado');
select lives_ok(
  $$ update matches set status = 'CONFIRMADO', format = 'FUTBOL_7' where id = '77777777-0000-0000-0000-000000000005' $$,
  'S4b: la misma transición con formato pasa');

insert into matches (id, team_a_id, team_b_id, match_type, status, scheduled_at, season_id)
values ('77777777-0000-0000-0000-000000000006', '22222222-2222-2222-2222-222222222221', '22222222-2222-2222-2222-222222222222',
        'AMISTOSO', 'FINALIZADO', now() - interval '30 days', (select id from seasons where is_active = true));
select lives_ok(
  $$ update matches set duration_minutes = 60 where id = '77777777-0000-0000-0000-000000000006' $$,
  'S4c: un histórico terminal con format NULL sigue siendo actualizable');

-- ════════════════════════════════════════════════════════════════════════════
-- S5 — RLS: la lista masiva sólo entra por la RPC (rol authenticated)
-- ════════════════════════════════════════════════════════════════════════════
insert into matches (id, team_a_id, team_b_id, match_type, status, format, scheduled_at, season_id)
values ('77777777-0000-0000-0000-000000000007', '22222222-2222-2222-2222-222222222221', '22222222-2222-2222-2222-222222222222',
        'RANKING', 'CONFIRMADO', 'FUTBOL_5', now(), (select id from seasons where is_active = true));
-- Fila del capitán de Tigres pre-cargada (como postgres) para el UPDATE ajeno.
insert into match_participants (match_id, profile_id, team_id, lineup_role)
values ('77777777-0000-0000-0000-000000000007', '33333333-3333-3333-3333-000000000004',
        '22222222-2222-2222-2222-222222222222', 'SUPLENTE');

-- S5a/b/c como el capitán de Leones.
select tests.authenticate_as_profile('aaaaaaaa-0000-0000-0000-000000000001');
select throws_ok(
  $$ insert into match_participants (match_id, profile_id, team_id, is_guest)
     values ('77777777-0000-0000-0000-000000000007', '33333333-3333-3333-3333-000000000001',
             '22222222-2222-2222-2222-222222222221', false) $$,
  '42501', null, 'S5a: un capitán no puede insertar una fila directa (no-guest)');
select is(
  tests.sq_rowcount($$ update match_participants set did_checkin = true
    where match_id='77777777-0000-0000-0000-000000000007' and profile_id='33333333-3333-3333-3333-000000000004' $$),
  0, 'S5b: un capitán no toca la fila de otro jugador (0 filas por RLS)');
select throws_ok(
  $$ update match_participants set lineup_role = 'TITULAR' where profile_id='33333333-3333-3333-3333-000000000001' $$,
  '42501', null, 'S5c: lineup_role no es actualizable por fuera de la RPC (sin grant de columna)');

-- S5d: un invitado SÍ puede auto-registrarse (compat join_match_as_guest).
select tests.authenticate_as_profile('8e7bd5df-5201-4622-8f6b-b94725c18da8');
select lives_ok(
  $$ insert into match_participants (match_id, profile_id, team_id, is_guest)
     values ('77777777-0000-0000-0000-000000000007', 'ef88b757-4d4e-48b1-b300-51da1cb2e678',
             '22222222-2222-2222-2222-222222222221', true) $$,
  'S5d: el alta self-service de invitado sigue funcionando');
select tests.clear_auth();

select * from finish();
rollback;
