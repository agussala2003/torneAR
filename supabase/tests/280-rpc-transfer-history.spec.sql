-- ============================================================
-- 280-rpc-transfer-history — Ledger de trayectoria team_stints (pgTAP)
-- ============================================================
-- Migración declarativa de tests-legacy/transfer_history.sql. Valida el
-- ledger team_stints y su motor (20260715_transfer_history_{structure,
-- engine,rpc,backfill}.sql):
--   T1 — Apertura: el INSERT en team_members abre un ciclo (started_at =
--        joined_at, nombre/escudo desnormalizados).
--   T2 — Cierre: el DELETE congela snapshot exacto (PJ, goles, MVPs, vallas,
--        V/E/D), leave_reason ABANDONO por default, last_role de la baja.
--   T3 — Los WO no cuentan como PJ individual (dentro de T2).
--   T4 — Los AMISTOSOS se desglosan de RANKING (dentro de T2).
--   T5 — Invitados: van a guest_appearances, nunca abren stint (dentro de T2).
--   T8 — RPC vivo vs cerrado: el vigente se computa EN VIVO y va primero;
--        el cerrado se lee del snapshot congelado (dentro de T2).
--   T6 — Inmutabilidad: authenticated lee el ledger y la RPC, pero no escribe.
--   T7 — Re-ingreso: segundo ciclo en fila nueva; el índice único parcial
--        impide dos ciclos abiertos del mismo (jugador, equipo).
--   T9 — Paridad seed/backfill: los capitanes del seed tienen ciclo abierto.
--
-- Aislamiento (pgTAP corre todo en UNA transacción): T2 va PRIMERO porque su
-- get_player_career(player) devuelve TODOS los stints del jugador; corriéndolo
-- antes de T1/T7 (que abren stints del mismo player en otros equipos) su
-- career queda limpio. El player del seed (player_market) no tiene membresías
-- en seed.sql, así que arranca sin stints. Escenarios como postgres (los
-- triggers open/close_team_stint son SECURITY DEFINER); T6 usa
-- authenticate_as_profile porque prueba la inmutabilidad bajo RLS/grants.
--
-- IDs del seed: player ef88b757 (auth 8e7bd5df-...) · scorer2/cap Leones
-- 0001 · equipo Leones 2222...221. Fixtures con prefijo 88888888-... (equipos
-- y partidos) descartados en el ROLLBACK.
-- ============================================================

begin;
select plan(18);

-- ════════════════════════════════════════════════════════════════════════════
-- T2 (+T3/T4/T5/T8) — Cierre con snapshot exacto y RPC vivo/congelado
-- ════════════════════════════════════════════════════════════════════════════
-- Equipos: Origen (88..01), Rival (88..02), Origen2 (88..03).
insert into teams (id, name, category, zone, preferred_format) values
  ('88888888-0000-0000-0000-000000000001', '__TH Origen',   'MIXTO', 'ZTH_TEST', 'FUTBOL_5'),
  ('88888888-0000-0000-0000-000000000002', '__TH Rival',    'MIXTO', 'ZTH_TEST', 'FUTBOL_5'),
  ('88888888-0000-0000-0000-000000000003', '__TH Origen 2', 'MIXTO', 'ZTH_TEST', 'FUTBOL_5');

-- Membresía en Origen (SUBCAPITAN, alta hace 30 días) → abre el ciclo.
insert into team_members (team_id, profile_id, role, joined_at)
values ('88888888-0000-0000-0000-000000000001', 'ef88b757-4d4e-48b1-b300-51da1cb2e678',
        'SUBCAPITAN', now() - interval '30 days');

-- R1: Origen 3-0 (valla) · player 2 goles · MVP player.
insert into matches (id, team_a_id, team_b_id, match_type, status, scheduled_at, season_id)
values ('88888888-0000-0000-0000-000000000011', '88888888-0000-0000-0000-000000000001',
        '88888888-0000-0000-0000-000000000002', 'RANKING', 'FINALIZADO', now() - interval '10 days',
        (select id from seasons where is_active = true));
insert into match_results (match_id, team_id, submitted_by, goals_scored, goals_against, scorers, mvp_id) values
  ('88888888-0000-0000-0000-000000000011', '88888888-0000-0000-0000-000000000001', 'ef88b757-4d4e-48b1-b300-51da1cb2e678',
   3, 0, jsonb_build_array(
     jsonb_build_object('profile_id', 'ef88b757-4d4e-48b1-b300-51da1cb2e678', 'goals', 2),
     jsonb_build_object('profile_id', '33333333-3333-3333-3333-000000000001', 'goals', 1)),
   'ef88b757-4d4e-48b1-b300-51da1cb2e678'),
  ('88888888-0000-0000-0000-000000000011', '88888888-0000-0000-0000-000000000002', 'ef88b757-4d4e-48b1-b300-51da1cb2e678',
   0, 3, '[]'::jsonb, null);
insert into match_participants (match_id, profile_id, team_id)
values ('88888888-0000-0000-0000-000000000011', 'ef88b757-4d4e-48b1-b300-51da1cb2e678', '88888888-0000-0000-0000-000000000001');

-- R2: Origen 1-2 · player 1 gol.
insert into matches (id, team_a_id, team_b_id, match_type, status, scheduled_at, season_id)
values ('88888888-0000-0000-0000-000000000012', '88888888-0000-0000-0000-000000000001',
        '88888888-0000-0000-0000-000000000002', 'RANKING', 'FINALIZADO', now() - interval '8 days',
        (select id from seasons where is_active = true));
insert into match_results (match_id, team_id, submitted_by, goals_scored, goals_against, scorers) values
  ('88888888-0000-0000-0000-000000000012', '88888888-0000-0000-0000-000000000001', 'ef88b757-4d4e-48b1-b300-51da1cb2e678',
   1, 2, jsonb_build_array(jsonb_build_object('profile_id', 'ef88b757-4d4e-48b1-b300-51da1cb2e678', 'goals', 1))),
  ('88888888-0000-0000-0000-000000000012', '88888888-0000-0000-0000-000000000002', 'ef88b757-4d4e-48b1-b300-51da1cb2e678',
   2, 1, '[]'::jsonb);
insert into match_participants (match_id, profile_id, team_id)
values ('88888888-0000-0000-0000-000000000012', 'ef88b757-4d4e-48b1-b300-51da1cb2e678', '88888888-0000-0000-0000-000000000001');

-- A1: AMISTOSO 0-0 (valla, empate).
insert into matches (id, team_a_id, team_b_id, match_type, status, scheduled_at, season_id)
values ('88888888-0000-0000-0000-000000000013', '88888888-0000-0000-0000-000000000001',
        '88888888-0000-0000-0000-000000000002', 'AMISTOSO', 'FINALIZADO', now() - interval '6 days',
        (select id from seasons where is_active = true));
insert into match_results (match_id, team_id, submitted_by, goals_scored, goals_against) values
  ('88888888-0000-0000-0000-000000000013', '88888888-0000-0000-0000-000000000001', 'ef88b757-4d4e-48b1-b300-51da1cb2e678', 0, 0),
  ('88888888-0000-0000-0000-000000000013', '88888888-0000-0000-0000-000000000002', 'ef88b757-4d4e-48b1-b300-51da1cb2e678', 0, 0);
insert into match_participants (match_id, profile_id, team_id)
values ('88888888-0000-0000-0000-000000000013', 'ef88b757-4d4e-48b1-b300-51da1cb2e678', '88888888-0000-0000-0000-000000000001');

-- W1: WO_A con participación — NO debe sumar PJ.
insert into matches (id, team_a_id, team_b_id, match_type, status, scheduled_at, season_id)
values ('88888888-0000-0000-0000-000000000014', '88888888-0000-0000-0000-000000000001',
        '88888888-0000-0000-0000-000000000002', 'RANKING', 'WO_A', now() - interval '4 days',
        (select id from seasons where is_active = true));
insert into match_participants (match_id, profile_id, team_id)
values ('88888888-0000-0000-0000-000000000014', 'ef88b757-4d4e-48b1-b300-51da1cb2e678', '88888888-0000-0000-0000-000000000001');

-- G1: player INVITADO en Rival: 1-0, 1 gol, MVP.
insert into matches (id, team_a_id, team_b_id, match_type, status, scheduled_at, season_id)
values ('88888888-0000-0000-0000-000000000015', '88888888-0000-0000-0000-000000000001',
        '88888888-0000-0000-0000-000000000002', 'RANKING', 'FINALIZADO', now() - interval '2 days',
        (select id from seasons where is_active = true));
insert into match_results (match_id, team_id, submitted_by, goals_scored, goals_against, scorers, mvp_id) values
  ('88888888-0000-0000-0000-000000000015', '88888888-0000-0000-0000-000000000002', 'ef88b757-4d4e-48b1-b300-51da1cb2e678',
   1, 0, jsonb_build_array(jsonb_build_object('profile_id', 'ef88b757-4d4e-48b1-b300-51da1cb2e678', 'goals', 1)),
   'ef88b757-4d4e-48b1-b300-51da1cb2e678'),
  ('88888888-0000-0000-0000-000000000015', '88888888-0000-0000-0000-000000000001', 'ef88b757-4d4e-48b1-b300-51da1cb2e678',
   0, 1, '[]'::jsonb, null);
insert into match_participants (match_id, profile_id, team_id, is_guest)
values ('88888888-0000-0000-0000-000000000015', 'ef88b757-4d4e-48b1-b300-51da1cb2e678', '88888888-0000-0000-0000-000000000002', true);

-- Cierre del ciclo (DELETE de la membresía → congela snapshot).
delete from team_members
 where team_id = '88888888-0000-0000-0000-000000000001' and profile_id = 'ef88b757-4d4e-48b1-b300-51da1cb2e678';

-- T2-1: ciclo cerrado con metadatos correctos.
select results_eq(
  $$ select ended_at is not null, leave_reason::text, last_role::text
     from team_stints where profile_id='ef88b757-4d4e-48b1-b300-51da1cb2e678'
       and team_id='88888888-0000-0000-0000-000000000001' $$,
  $$ values (true, 'ABANDONO', 'SUBCAPITAN') $$,
  'T2-1: el DELETE cierra el ciclo (ended_at, leave_reason ABANDONO, last_role SUBCAPITAN)');

-- T2-2 (+T3+T4): snapshot total exacto.
select results_eq(
  $$ select (stats->'total'->>'goals')::int, (stats->'total'->>'mvps')::int,
            (stats->'total'->>'clean_sheets')::int, (stats->'total'->>'wins')::int,
            (stats->'total'->>'draws')::int, (stats->'total'->>'losses')::int,
            (stats->'total'->>'pj_ranking')::int, (stats->'total'->>'pj_amistoso')::int
     from team_stints where profile_id='ef88b757-4d4e-48b1-b300-51da1cb2e678'
       and team_id='88888888-0000-0000-0000-000000000001' $$,
  $$ values (3, 1, 2, 1, 1, 1, 2, 1) $$,
  'T2-2: snapshot exacto (goles 3, MVP 1, vallas 2, V/E/D 1/1/1, PJ 2 ranking + 1 amistoso; WO excluido)');

-- T2-3: desglose por una sola temporada, la activa.
select results_eq(
  $$ select jsonb_array_length(stats->'by_season'), (stats->'by_season'->0->>'season_id')::uuid
     from team_stints where profile_id='ef88b757-4d4e-48b1-b300-51da1cb2e678'
       and team_id='88888888-0000-0000-0000-000000000001' $$,
  $$ values (1, (select id from seasons where is_active = true)) $$,
  'T2-3: el desglose tiene una sola temporada (la activa)');

-- Ciclo vigente en Origen 2 (1 partido ganado 2-1, 2 goles) + adulteración
-- del snapshot cerrado a goals=99 (para probar que la RPC LEE, no recomputa).
insert into team_members (team_id, profile_id, role, joined_at)
values ('88888888-0000-0000-0000-000000000003', 'ef88b757-4d4e-48b1-b300-51da1cb2e678', 'JUGADOR', now() - interval '5 days');
insert into matches (id, team_a_id, team_b_id, match_type, status, scheduled_at, season_id)
values ('88888888-0000-0000-0000-000000000016', '88888888-0000-0000-0000-000000000003',
        '88888888-0000-0000-0000-000000000002', 'RANKING', 'FINALIZADO', now() - interval '1 day',
        (select id from seasons where is_active = true));
insert into match_results (match_id, team_id, submitted_by, goals_scored, goals_against, scorers) values
  ('88888888-0000-0000-0000-000000000016', '88888888-0000-0000-0000-000000000003', 'ef88b757-4d4e-48b1-b300-51da1cb2e678',
   2, 1, jsonb_build_array(jsonb_build_object('profile_id', 'ef88b757-4d4e-48b1-b300-51da1cb2e678', 'goals', 2))),
  ('88888888-0000-0000-0000-000000000016', '88888888-0000-0000-0000-000000000002', 'ef88b757-4d4e-48b1-b300-51da1cb2e678',
   1, 2, '[]'::jsonb);
insert into match_participants (match_id, profile_id, team_id)
values ('88888888-0000-0000-0000-000000000016', 'ef88b757-4d4e-48b1-b300-51da1cb2e678', '88888888-0000-0000-0000-000000000003');

update team_stints set stats = jsonb_set(stats, '{total,goals}', '99')
 where profile_id='ef88b757-4d4e-48b1-b300-51da1cb2e678'
   and team_id='88888888-0000-0000-0000-000000000001' and ended_at is not null;

create temp table t2_career as select public.get_player_career('ef88b757-4d4e-48b1-b300-51da1cb2e678') as c;

-- T8a: el primer stint del career es el vigente.
select is(
  (select ((c->'stints'->0->>'is_current')::boolean) from t2_career),
  true, 'T8a: el ciclo vigente va primero en el career');
-- T8b: el vigente (Origen 2) computa EN VIVO.
select results_eq(
  $$ select (s->'stats'->'total'->>'goals')::int, (s->'stats'->'total'->>'pj_ranking')::int,
            (s->'stats'->'total'->>'wins')::int
     from jsonb_array_elements((select c from t2_career)->'stints') s
     where (s->>'team_id')::uuid = '88888888-0000-0000-0000-000000000003' $$,
  $$ values (2, 1, 1) $$,
  'T8b: el ciclo vigente computa stats en vivo (2 goles, 1 PJ, 1 victoria)');
-- T8c: el cerrado se lee del snapshot congelado (goals adulterado = 99).
select is(
  (select (s->'stats'->'total'->>'goals')::int
   from jsonb_array_elements((select c from t2_career)->'stints') s
   where (s->>'stint_id')::uuid = (select id from team_stints
     where profile_id='ef88b757-4d4e-48b1-b300-51da1cb2e678'
       and team_id='88888888-0000-0000-0000-000000000001' and ended_at is not null)),
  99, 'T8c: el ciclo cerrado se lee del snapshot congelado (no recomputa)');

-- T5: G1 como invitado en Rival, fuera de los stints.
select results_eq(
  $$ select (g->>'pj_ranking')::int, (g->>'goals')::int, (g->>'mvps')::int
     from jsonb_array_elements((select c from t2_career)->'guest_appearances') g
     where (g->>'team_id')::uuid = '88888888-0000-0000-0000-000000000002' $$,
  $$ values (1, 1, 1) $$,
  'T5a: la participación como invitado aparece en guest_appearances (1 PJ, 1 gol, 1 MVP)');
select is_empty(
  $$ select 1 from jsonb_array_elements((select c from t2_career)->'stints') s
     where (s->>'team_id')::uuid = '88888888-0000-0000-0000-000000000002' $$,
  'T5b: la participación como invitado NO abrió un stint en Rival');

-- ════════════════════════════════════════════════════════════════════════════
-- T1 — Apertura de ciclo con datos desnormalizados
-- ════════════════════════════════════════════════════════════════════════════
insert into teams (id, name, category, zone, preferred_format, shield_url)
values ('88888888-0000-0000-0000-0000000000a1', '__TH Apertura FC', 'MIXTO', 'ZTH_TEST', 'FUTBOL_5', 'https://x/shield.png');
insert into team_members (team_id, profile_id, role, joined_at)
values ('88888888-0000-0000-0000-0000000000a1', 'ef88b757-4d4e-48b1-b300-51da1cb2e678',
        'JUGADOR', '2026-06-22 12:00:00+00');

select results_eq(
  $$ select ended_at is null, started_at from team_stints
     where profile_id='ef88b757-4d4e-48b1-b300-51da1cb2e678' and team_id='88888888-0000-0000-0000-0000000000a1' $$,
  $$ values (true, '2026-06-22 12:00:00+00'::timestamptz) $$,
  'T1-1: el INSERT abre un ciclo vigente con started_at = joined_at');
select results_eq(
  $$ select team_name, shield_url from team_stints
     where profile_id='ef88b757-4d4e-48b1-b300-51da1cb2e678' and team_id='88888888-0000-0000-0000-0000000000a1' $$,
  $$ values ('__TH Apertura FC', 'https://x/shield.png') $$,
  'T1-2: nombre y escudo quedan desnormalizados en el ciclo');

-- ════════════════════════════════════════════════════════════════════════════
-- T7 — Re-ingreso: segundo ciclo + único abierto por par (jugador, equipo)
-- ════════════════════════════════════════════════════════════════════════════
insert into teams (id, name, category, zone, preferred_format)
values ('88888888-0000-0000-0000-0000000000b1', '__TH Reingreso', 'MIXTO', 'ZTH_TEST', 'FUTBOL_5');
insert into team_members (team_id, profile_id, role, joined_at)
values ('88888888-0000-0000-0000-0000000000b1', 'ef88b757-4d4e-48b1-b300-51da1cb2e678', 'JUGADOR', now() - interval '20 days');
delete from team_members
 where team_id='88888888-0000-0000-0000-0000000000b1' and profile_id='ef88b757-4d4e-48b1-b300-51da1cb2e678';
insert into team_members (team_id, profile_id, role)
values ('88888888-0000-0000-0000-0000000000b1', 'ef88b757-4d4e-48b1-b300-51da1cb2e678', 'JUGADOR');

select is(
  (select count(*)::int from team_stints
   where profile_id='ef88b757-4d4e-48b1-b300-51da1cb2e678' and team_id='88888888-0000-0000-0000-0000000000b1'),
  2, 'T7-1: el re-ingreso deja 2 stints (cerrado + abierto)');
select is(
  (select count(*)::int from team_stints
   where profile_id='ef88b757-4d4e-48b1-b300-51da1cb2e678' and team_id='88888888-0000-0000-0000-0000000000b1' and ended_at is null),
  1, 'T7-2: exactamente 1 ciclo abierto tras el re-ingreso');
select throws_ok(
  $$ insert into team_stints (profile_id, team_id, team_name, started_at)
     values ('ef88b757-4d4e-48b1-b300-51da1cb2e678', '88888888-0000-0000-0000-0000000000b1', '__TH Reingreso', now()) $$,
  '23505', null, 'T7-3: el índice único parcial impide dos ciclos abiertos del mismo par');

-- ════════════════════════════════════════════════════════════════════════════
-- T9 — Paridad seed/backfill: los capitanes del seed tienen ciclo abierto
-- ════════════════════════════════════════════════════════════════════════════
select isnt_empty(
  $$ select 1 from team_stints
     where profile_id='33333333-3333-3333-3333-000000000001'
       and team_id='22222222-2222-2222-2222-222222222221' and ended_at is null $$,
  'T9: el capitán del seed tiene ciclo abierto en Los Leones FC (trigger local / backfill prod)');

-- ════════════════════════════════════════════════════════════════════════════
-- T6 — Inmutabilidad: authenticated lee pero no escribe (rol authenticated)
-- ════════════════════════════════════════════════════════════════════════════
select tests.authenticate_as_profile('8e7bd5df-5201-4622-8f6b-b94725c18da8');
select lives_ok(
  $$ select 1 from team_stints where profile_id='ef88b757-4d4e-48b1-b300-51da1cb2e678' limit 1 $$,
  'T6-1: authenticated puede leer el ledger team_stints');
select throws_ok(
  $$ insert into team_stints (profile_id, team_id, team_name, started_at)
     values ('ef88b757-4d4e-48b1-b300-51da1cb2e678', '22222222-2222-2222-2222-222222222221', '__TH Ilegítimo', now()) $$,
  '42501', null, 'T6-2: authenticated NO puede insertar en team_stints');
select throws_ok(
  $$ update team_stints set team_name = '__TH Adulterado' where profile_id='ef88b757-4d4e-48b1-b300-51da1cb2e678' $$,
  '42501', null, 'T6-3: authenticated NO puede actualizar team_stints');
select throws_ok(
  $$ delete from team_stints where profile_id='ef88b757-4d4e-48b1-b300-51da1cb2e678' $$,
  '42501', null, 'T6-4: authenticated NO puede borrar de team_stints');
select tests.clear_auth();

select * from finish();
rollback;
