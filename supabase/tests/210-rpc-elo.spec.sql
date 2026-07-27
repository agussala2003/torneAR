-- ============================================================
-- 210-rpc-elo — Motor de ELO unificado (pgTAP)
-- ============================================================
-- Migración declarativa de tests-legacy/elo_engine_unification.sql: regresión
-- del fix ROJO #1 del audit 360° del 13-jul (doble motor de ELO). Prueba que
-- un partido computa stats, ELO e historial exactamente UNA vez.
-- RPC/trigger vigente: 20260714024611_elo_engine_unification.sql.
--
-- Matemática esperada (K=40, ratings iniciales 1000 iguales → ±20 exactos):
--   E1 — RANKING 2-1: ganador 1000→1020, perdedor 1000→980; stats 1x;
--        2 filas en elo_history.
--   E2 — Idempotencia: re-ejecutar resolve_match + re-updatear el status ya
--        FINALIZADO no re-acumula nada.
--   E3 — WO_A (3-0): mismas stats/ELO que una victoria; 2 filas de historial.
--   E4 — AMISTOSO 1-1: cuenta stats (empate) pero NO mueve ELO ni escribe
--        elo_history.
--
-- Lógica de dominio pura movida por triggers (SECURITY DEFINER) al insertar
-- match_results / cambiar el status del partido — no requiere simular auth,
-- igual que el legacy. Todo corre en la transacción del archivo (rollback
-- automático); cada escenario usa equipos/partidos con UUIDs fijos propios.
-- Único perfil del seed referenciado (submitted_by):
--   33333333-3333-3333-3333-000000000004
-- ============================================================

begin;
select plan(13);

-- ════════════════════════════════════════════════════════════════════════════
-- E1 + E2 — Partido RANKING: aplica UNA vez + idempotencia
-- ════════════════════════════════════════════════════════════════════════════
insert into teams (id, name, category, zone, preferred_format) values
  ('e1000000-0000-0000-0000-0000000000a1', '__TEST ELO A', 'MIXTO', 'Palermo', 'FUTBOL_5'),
  ('e1000000-0000-0000-0000-0000000000b1', '__TEST ELO B', 'MIXTO', 'Palermo', 'FUTBOL_5');

insert into matches (id, team_a_id, team_b_id, match_type, status, format, scheduled_at, season_id)
values ('e1000000-0000-0000-0000-0000000000c1',
        'e1000000-0000-0000-0000-0000000000a1',
        'e1000000-0000-0000-0000-0000000000b1',
        'RANKING', 'EN_VIVO', 'FUTBOL_5', now(),
        (select id from seasons where is_active = true limit 1));

-- Resultados cruzados 2-1: el segundo INSERT dispara trg_on_result_submitted
-- (ambos resultados presentes → resuelve el partido).
insert into match_results (match_id, team_id, submitted_by, goals_scored, goals_against)
values ('e1000000-0000-0000-0000-0000000000c1', 'e1000000-0000-0000-0000-0000000000a1',
        '33333333-3333-3333-3333-000000000004', 2, 1);
insert into match_results (match_id, team_id, submitted_by, goals_scored, goals_against)
values ('e1000000-0000-0000-0000-0000000000c1', 'e1000000-0000-0000-0000-0000000000b1',
        '33333333-3333-3333-3333-000000000004', 1, 2);

-- ── E1 ──────────────────────────────────────────────────────────────────────
select results_eq(
  $$ select status::text from matches where id = 'e1000000-0000-0000-0000-0000000000c1' $$,
  array['FINALIZADO'],
  'E1: la carga de ambos resultados finaliza el partido'
);

select results_eq(
  $$ select matches_played, season_wins, season_draws, season_losses,
            season_goals_for, season_goals_against, elo_rating
     from teams where id = 'e1000000-0000-0000-0000-0000000000a1' $$,
  $$ values (1, 1, 0, 0, 2, 1, 1020) $$,
  'E1: ganador computa stats 1x y ELO +20 (1000→1020)'
);

select results_eq(
  $$ select matches_played, season_losses, elo_rating
     from teams where id = 'e1000000-0000-0000-0000-0000000000b1' $$,
  $$ values (1, 1, 980) $$,
  'E1: perdedor computa 1 PJ, 1 derrota y ELO -20 (1000→980)'
);

select is(
  (select count(*)::int from elo_history
   where match_id = 'e1000000-0000-0000-0000-0000000000c1'),
  2,
  'E1: elo_history tiene exactamente 2 filas para el partido'
);

select results_eq(
  $$ select elo_before, elo_after, delta from elo_history
     where match_id = 'e1000000-0000-0000-0000-0000000000c1'
       and team_id  = 'e1000000-0000-0000-0000-0000000000a1' $$,
  $$ values (1000, 1020, 20) $$,
  'E1: la fila de historial del ganador registra 1000→1020 (Δ+20)'
);

-- ── E2: idempotencia ────────────────────────────────────────────────────────
select public.resolve_match('e1000000-0000-0000-0000-0000000000c1');
update matches set status = 'FINALIZADO' where id = 'e1000000-0000-0000-0000-0000000000c1';

select results_eq(
  $$ select matches_played, elo_rating
     from teams where id = 'e1000000-0000-0000-0000-0000000000a1' $$,
  $$ values (1, 1020) $$,
  'E2: re-ejecutar resolve_match no re-acumula stats/ELO del ganador'
);

select is(
  (select count(*)::int from elo_history
   where match_id = 'e1000000-0000-0000-0000-0000000000c1'),
  2,
  'E2: elo_history sigue con 2 filas (sin doble conteo)'
);

-- ════════════════════════════════════════════════════════════════════════════
-- E3 — WO_A: 3-0 + ELO, exactamente UNA vez
-- ════════════════════════════════════════════════════════════════════════════
insert into teams (id, name, category, zone, preferred_format) values
  ('e3000000-0000-0000-0000-0000000000a1', '__TEST WO A', 'MIXTO', 'Palermo', 'FUTBOL_5'),
  ('e3000000-0000-0000-0000-0000000000b1', '__TEST WO B', 'MIXTO', 'Palermo', 'FUTBOL_5');

insert into matches (id, team_a_id, team_b_id, match_type, status, format, scheduled_at, season_id)
values ('e3000000-0000-0000-0000-0000000000c1',
        'e3000000-0000-0000-0000-0000000000a1',
        'e3000000-0000-0000-0000-0000000000b1',
        'RANKING', 'CONFIRMADO', 'FUTBOL_5', now(),
        (select id from seasons where is_active = true limit 1));

-- Aprobación del WO (resolve_wo_claim setea el status igual): dispara el motor.
update matches set status = 'WO_A' where id = 'e3000000-0000-0000-0000-0000000000c1';

select results_eq(
  $$ select matches_played, season_wins, season_goals_for, season_goals_against, elo_rating
     from teams where id = 'e3000000-0000-0000-0000-0000000000a1' $$,
  $$ values (1, 1, 3, 0, 1020) $$,
  'E3: ganador del WO computa 3-0, victoria y ELO +20'
);

select results_eq(
  $$ select matches_played, season_losses, season_goals_against, elo_rating
     from teams where id = 'e3000000-0000-0000-0000-0000000000b1' $$,
  $$ values (1, 1, 3, 980) $$,
  'E3: ausente del WO computa derrota, 3 en contra y ELO -20'
);

select is(
  (select count(*)::int from elo_history
   where match_id = 'e3000000-0000-0000-0000-0000000000c1'),
  2,
  'E3: elo_history tiene exactamente 2 filas para el WO'
);

-- ════════════════════════════════════════════════════════════════════════════
-- E4 — AMISTOSO: stats sí, ELO/history no
-- ════════════════════════════════════════════════════════════════════════════
insert into teams (id, name, category, zone, preferred_format) values
  ('e4000000-0000-0000-0000-0000000000a1', '__TEST AMISTOSO A', 'MIXTO', 'Palermo', 'FUTBOL_5'),
  ('e4000000-0000-0000-0000-0000000000b1', '__TEST AMISTOSO B', 'MIXTO', 'Palermo', 'FUTBOL_5');

insert into matches (id, team_a_id, team_b_id, match_type, status, format, scheduled_at)
values ('e4000000-0000-0000-0000-0000000000c1',
        'e4000000-0000-0000-0000-0000000000a1',
        'e4000000-0000-0000-0000-0000000000b1',
        'AMISTOSO', 'EN_VIVO', 'FUTBOL_5', now());

insert into match_results (match_id, team_id, submitted_by, goals_scored, goals_against)
values ('e4000000-0000-0000-0000-0000000000c1', 'e4000000-0000-0000-0000-0000000000a1',
        '33333333-3333-3333-3333-000000000004', 1, 1);
insert into match_results (match_id, team_id, submitted_by, goals_scored, goals_against)
values ('e4000000-0000-0000-0000-0000000000c1', 'e4000000-0000-0000-0000-0000000000b1',
        '33333333-3333-3333-3333-000000000004', 1, 1);

select results_eq(
  $$ select matches_played, season_draws, season_goals_for
     from teams where id = 'e4000000-0000-0000-0000-0000000000a1' $$,
  $$ values (1, 1, 1) $$,
  'E4: el amistoso computa stats (1 PJ, 1 empate, 1 GF)'
);

select is(
  (select elo_rating from teams where id = 'e4000000-0000-0000-0000-0000000000a1'),
  1000,
  'E4: el amistoso NO mueve el ELO (queda en 1000)'
);

select is(
  (select count(*)::int from elo_history
   where match_id = 'e4000000-0000-0000-0000-0000000000c1'),
  0,
  'E4: el amistoso NO escribe en elo_history'
);

select * from finish();
rollback;
