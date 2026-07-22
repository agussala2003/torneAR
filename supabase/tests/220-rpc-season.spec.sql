-- ============================================================
-- 220-rpc-season — Ciclo de vida de temporadas (pgTAP)
-- ============================================================
-- Migración declarativa de tests-legacy/season_lifecycle.sql. Valida
-- transition_season y sus refuerzos estructurales
-- (20260714131532_season_lifecycle.sql):
--   T1 — Transición feliz: cierra la activa, crea la nueva (única activa),
--        resetea contadores season_* de teams, deja elo_rating y
--        matches_played INTACTOS, y notifica a los admins.
--   T4 — Partidos abiertos re-etiquetados a la temporada nueva; los
--        terminales conservan su temporada original. (dentro de T1)
--   T2 — Un usuario no-admin no puede ejecutar la transición.
--   T3 — El índice único parcial impide dos temporadas activas.
--   T5 — Sin temporada activa, la transición falla con error claro.
--
-- Aislamiento (pgTAP corre todo en UNA transacción, no un BEGIN/ROLLBACK por
-- caso como el legacy): se evita la interferencia de estado sin savepoints —
--   · T2 usa el perfil 0001 (nunca admin en este archivo), así que su rechazo
--     no depende de que T1 haya seteado is_admin en 0004.
--   · T5 va al final: deja el sistema sin temporada activa a propósito.
-- Todo corre como postgres seteando sólo request.jwt.claims (para auth.uid()
-- dentro de las RPCs SECURITY DEFINER), igual que el legacy.
--
-- IDs del seed: admin 33333333-...-0004 (auth aaaaaaaa-...-0004) ·
-- no-admin 33333333-...-0001 (auth aaaaaaaa-...-0001) ·
-- partido terminal 44444444-4444-4444-4444-000000000003.
-- ============================================================

begin;
select plan(9);

-- ════════════════════════════════════════════════════════════════════════════
-- T1 + T4 — Transición feliz
-- ════════════════════════════════════════════════════════════════════════════
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-000000000004"}', true);
update public.profiles set is_admin = true where id = '33333333-3333-3333-3333-000000000004';

-- Equipo con contadores/ELO adulterados para verificar qué se resetea.
insert into teams (id, name, category, zone, preferred_format) values
  ('a1a1a1a1-0000-0000-0000-000000000001', '__TEST SEASON',       'MIXTO', 'Palermo', 'FUTBOL_5'),
  ('a1a1a1a1-0000-0000-0000-000000000002', '__TEST SEASON RIVAL', 'MIXTO', 'Palermo', 'FUTBOL_5');
update teams set
  elo_rating = 1234, matches_played = 9,
  season_wins = 7, season_draws = 1, season_losses = 1,
  season_goals_for = 20, season_goals_against = 5
where id = 'a1a1a1a1-0000-0000-0000-000000000001';

-- Partido abierto (debe re-etiquetarse) en la temporada vieja.
insert into matches (id, team_a_id, team_b_id, match_type, status, format, scheduled_at, season_id)
values ('a1a1a1a1-0000-0000-0000-0000000000c1',
        'a1a1a1a1-0000-0000-0000-000000000001',
        'a1a1a1a1-0000-0000-0000-000000000002',
        'AMISTOSO', 'CONFIRMADO', 'FUTBOL_5', now() + interval '3 days',
        (select id from seasons where is_active = true));

-- Captura del estado previo (pgTAP no comparte variables entre sentencias).
create temp table t1_ctx as select
  (select id from seasons where is_active = true) as old_season_id,
  (select season_id from matches where id = '44444444-4444-4444-4444-000000000003') as final_season_before;

-- Transición (SECURITY DEFINER, autoriza por auth.uid()); devuelve el id nuevo.
create temp table t1_new as
  select public.transition_season('__TEST Temporada Nueva', '2026-07-01', '2026-12-31') as new_id;

-- T1a: exactamente 1 activa, y es la nueva.
select is(
  (select count(*)::int from seasons where is_active = true),
  1, 'T1a: queda exactamente una temporada activa tras la transición');
select is(
  (select is_active from seasons where id = (select new_id from t1_new)),
  true, 'T1a: la nueva temporada es la activa');

-- T1b: contadores season_* en 0; elo_rating y matches_played intactos.
select results_eq(
  $$ select season_wins, season_draws, season_losses,
            season_goals_for, season_goals_against, elo_rating, matches_played
     from teams where id = 'a1a1a1a1-0000-0000-0000-000000000001' $$,
  $$ values (0, 0, 0, 0, 0, 1234, 9) $$,
  'T1b: contadores season_* reseteados; elo_rating y matches_played intactos');

-- T1c: notificación de auditoría al admin.
select isnt_empty(
  $$ select 1 from notifications
     where profile_id = '33333333-3333-3333-3333-000000000004'
       and type = 'TEMPORADA_INICIADA'
       and data->>'season_id' = (select new_id from t1_new)::text $$,
  'T1c: notificación TEMPORADA_INICIADA al admin');

-- T4: el partido abierto migró; el terminal conservó su temporada.
select is(
  (select season_id from matches where id = 'a1a1a1a1-0000-0000-0000-0000000000c1'),
  (select new_id from t1_new),
  'T4: el partido abierto se re-etiquetó a la temporada nueva');
select is(
  (select season_id from matches where id = '44444444-4444-4444-4444-000000000003'),
  (select final_season_before from t1_ctx),
  'T4: el partido terminal conservó su temporada original');

-- ════════════════════════════════════════════════════════════════════════════
-- T2 — No-admin (perfil 0001, nunca admin): rechazado
-- ════════════════════════════════════════════════════════════════════════════
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-000000000001"}', true);
select throws_matching(
  $$ select public.transition_season('__TEST Ilegítima', '2026-07-01', '2026-12-31') $$,
  'No autorizado',
  'T2: un usuario sin is_admin no puede ejecutar la transición');

-- ════════════════════════════════════════════════════════════════════════════
-- T3 — Una sola temporada activa (garantía estructural del índice parcial)
-- ════════════════════════════════════════════════════════════════════════════
select throws_ok(
  $$ insert into seasons (name, slug, starts_at, ends_at, is_active)
     values ('__TEST Doble Activa', '--test-doble-activa', '2027-01-01', '2027-06-30', true) $$,
  '23505', null,
  'T3: el índice único parcial impide una segunda temporada activa');

-- ════════════════════════════════════════════════════════════════════════════
-- T5 — Sin temporada activa: error claro (va último: deja el sistema sin activa)
-- ════════════════════════════════════════════════════════════════════════════
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-000000000004"}', true);
update seasons set is_active = false where is_active = true;
select throws_matching(
  $$ select public.transition_season('__TEST Sin Activa', '2026-07-01', '2026-12-31') $$,
  'No hay temporada activa',
  'T5: sin temporada activa la transición falla con error claro');

select * from finish();
rollback;
