-- ============================================================
-- 230-rpc-leaderboard-wo — Leaderboard + WO (pgTAP)
-- ============================================================
-- Migración declarativa de tests-legacy/leaderboard_wo.sql (audit 360°
-- 13-jul, ROJO #4 funcional): los goleadores y el MVP cargados en un reclamo
-- de WO (G6) y aprobados por el admin (resolve_wo_claim) SÍ computan en
-- get_player_leaderboard, y SOLO computa el equipo ganador.
-- Requiere 20260714125138_leaderboard_wo_support.sql.
--
-- Flujo (fiel a producción, todo en la transacción del archivo):
--   1. Dos equipos en zona única '__TEST_WO_LB' (aísla las aserciones vía
--      el filtro p_zone).
--   2. Partido RANKING CONFIRMADO + participantes (2 del ganador con check-in,
--      1 del ausente sin check-in).
--   3. Reclamo de WO con scorers (cap 2 goles + jugador2 1 gol) y MVP.
--   4. Aprobación vía resolve_wo_claim (admin por auth.uid()).
--   5. Aserciones sobre goals / mvps / clean_sheets / matches.
--
-- Como el legacy: se corre como postgres seteando sólo request.jwt.claims.
-- IDs del seed: cap/scorer1/MVP 33333333-...-0004 (auth aaaaaaaa-...-0004) ·
-- scorer2 33333333-...-0001 · participante del ausente 33333333-...-0007.
-- get_player_leaderboard.value es bigint → se compara con array[N::bigint].
-- ============================================================

begin;
select plan(7);

-- ── Setup: admin transaccional + escenario en zona aislada ──────────────────
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-000000000004"}', true);
update public.profiles set is_admin = true where id = '33333333-3333-3333-3333-000000000004';

insert into teams (id, name, category, zone, preferred_format) values
  ('b2b2b2b2-0000-0000-0000-000000000001', '__TEST WO LB GANADOR', 'MIXTO', '__TEST_WO_LB', 'FUTBOL_5'),
  ('b2b2b2b2-0000-0000-0000-000000000002', '__TEST WO LB AUSENTE', 'MIXTO', '__TEST_WO_LB', 'FUTBOL_5');

insert into matches (id, team_a_id, team_b_id, match_type, status, format, scheduled_at, season_id)
values ('b2b2b2b2-0000-0000-0000-0000000000c1',
        'b2b2b2b2-0000-0000-0000-000000000001',
        'b2b2b2b2-0000-0000-0000-000000000002',
        'RANKING', 'CONFIRMADO', 'FUTBOL_5', now(),
        (select id from seasons where is_active = true limit 1));

insert into match_participants (match_id, team_id, profile_id, did_checkin) values
  ('b2b2b2b2-0000-0000-0000-0000000000c1', 'b2b2b2b2-0000-0000-0000-000000000001', '33333333-3333-3333-3333-000000000004', true),
  ('b2b2b2b2-0000-0000-0000-0000000000c1', 'b2b2b2b2-0000-0000-0000-000000000001', '33333333-3333-3333-3333-000000000001', true),
  ('b2b2b2b2-0000-0000-0000-0000000000c1', 'b2b2b2b2-0000-0000-0000-000000000002', '33333333-3333-3333-3333-000000000007', false);

insert into wo_claims (id, match_id, claimed_by, claiming_team_id, photo_url, reason, status, scorers, mvp_id)
values ('b2b2b2b2-0000-0000-0000-0000000000d1',
        'b2b2b2b2-0000-0000-0000-0000000000c1',
        '33333333-3333-3333-3333-000000000004',
        'b2b2b2b2-0000-0000-0000-000000000001',
        'evidencia.jpg', 'rival ausente', 'PENDIENTE_REVISION',
        jsonb_build_array(
          jsonb_build_object('profile_id', '33333333-3333-3333-3333-000000000004', 'goals', 2),
          jsonb_build_object('profile_id', '33333333-3333-3333-3333-000000000001', 'goals', 1)
        ),
        '33333333-3333-3333-3333-000000000004');

select public.resolve_wo_claim('b2b2b2b2-0000-0000-0000-0000000000d1', true, 'aprobado en test');

-- ── L1. goals: los goleadores del WO suman ──────────────────────────────────
select results_eq(
  $$ select value from public.get_player_leaderboard('goals', '__TEST_WO_LB')
     where profile_id = '33333333-3333-3333-3333-000000000004' $$,
  array[2::bigint],
  'L1a: el capitán suma 2 goles del WO aprobado');
select results_eq(
  $$ select value from public.get_player_leaderboard('goals', '__TEST_WO_LB')
     where profile_id = '33333333-3333-3333-3333-000000000001' $$,
  array[1::bigint],
  'L1b: el jugador2 suma 1 gol del WO aprobado');

-- ── L2. mvps: el MVP del WO suma ────────────────────────────────────────────
select results_eq(
  $$ select value from public.get_player_leaderboard('mvps', '__TEST_WO_LB')
     where profile_id = '33333333-3333-3333-3333-000000000004' $$,
  array[1::bigint],
  'L2: el MVP del WO aprobado suma en el ranking');

-- ── L3. clean_sheets: la valla invicta del 3-0 computa para el ganador ──────
select results_eq(
  $$ select value from public.get_player_leaderboard('clean_sheets', '__TEST_WO_LB')
     where profile_id = '33333333-3333-3333-3333-000000000004' $$,
  array[1::bigint],
  'L3: la valla invicta del WO computa para el ganador');

-- ── L4. matches: el participante del ganador suma PJ ────────────────────────
select results_eq(
  $$ select value from public.get_player_leaderboard('matches', '__TEST_WO_LB')
     where profile_id = '33333333-3333-3333-3333-000000000001' $$,
  array[1::bigint],
  'L4: el participante del ganador suma 1 partido jugado');

-- ── L5. El equipo AUSENTE no computa en ninguna rama ────────────────────────
select is_empty(
  $$ select 1 from public.get_player_leaderboard('matches', '__TEST_WO_LB')
     where profile_id = '33333333-3333-3333-3333-000000000007' $$,
  'L5a: el participante del equipo ausente no suma partidos');
select is_empty(
  $$ select 1 from public.get_player_leaderboard('clean_sheets', '__TEST_WO_LB')
     where profile_id = '33333333-3333-3333-3333-000000000007' $$,
  'L5b: el participante del equipo ausente no suma vallas invictas');

select * from finish();
rollback;
