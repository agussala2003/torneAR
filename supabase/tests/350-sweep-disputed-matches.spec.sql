-- ============================================================
-- 350-sweep-disputed-matches — Escrutinio automático de disputas (pgTAP)
-- ============================================================
-- Cubre public.sweep_disputed_matches() (migración 20260803150000), la segunda
-- pieza que MUTA ESTADO COMPETITIVO SIN INTERVENCIÓN HUMANA: cierra la votación
-- de una disputa, corrige el marcador del perdedor y dispara ELO, stats de
-- temporada y Fair Play.
--
-- Reemplaza a la resolución manual (`resolve_match_dispute`, eliminada en la
-- misma migración) porque aquélla corría en el instante del tap de un capitán y
-- el desempate por Fair Play convertía toda disputa recién nacida —0 a 0— en una
-- carrera por el botón.
--
-- Ramas verificadas:
--   D-1      Disputa vencida con mayoría de votos → FINALIZADO por votación.
--   D-2      El marcador del perdedor se corrige al espejo del ganador.
--   D-3/D-4  ELO y stats se aplican por el motor normal.
--   D-5      Empate de votos → desempata Fair Play.
--   D-6      Empate de votos Y de Fair Play → intacto, para el admin.
--   D-7      Falta el marcador de un equipo → intacto, para el admin.
--   D-8      Disputa reciente (dentro de las 24 h) → intacta.
--   D-9      Idempotencia: la segunda corrida no reprocesa (no duplica ELO).
--   D-10     La RPC manual ya no existe.
--
-- Equipos nuevos y aislados (elo 1000 de arranque) para que las aserciones de
-- ELO sean deterministas, igual que en 300-sweep-stale-matches.
--
-- Los conteos del jsonb de retorno NO se asertan: el barrido también recorre las
-- disputas del seed, así que esos totales no son estables entre corridas.
-- ============================================================

begin;
select plan(12);

-- ── Setup ───────────────────────────────────────────────────────────────────
-- Fair Play explícito: es el criterio de desempate y el default (100) haría que
-- D-5 no pudiera distinguirse de D-6.
insert into teams (id, name, category, zone, preferred_format, fair_play_score) values
  ('51000000-0000-0000-0000-00000000000a', 'DISP_A', 'HOMBRES', 'ZDISP', 'FUTBOL_5', 100),
  ('51000000-0000-0000-0000-00000000000b', 'DISP_B', 'HOMBRES', 'ZDISP', 'FUTBOL_5', 100),
  ('51000000-0000-0000-0000-00000000000c', 'DISP_C', 'HOMBRES', 'ZDISP', 'FUTBOL_5', 90),
  ('51000000-0000-0000-0000-00000000000d', 'DISP_D', 'HOMBRES', 'ZDISP', 'FUTBOL_5', 70),
  ('51000000-0000-0000-0000-00000000000e', 'DISP_E', 'HOMBRES', 'ZDISP', 'FUTBOL_5', 55),
  ('51000000-0000-0000-0000-00000000000f', 'DISP_F', 'HOMBRES', 'ZDISP', 'FUTBOL_5', 55);

-- m1: disputa de hace 30 h. A dice 2-1, B dice 3-1 (no cruzan). Dos votos para A.
insert into matches (id, team_a_id, team_b_id, status, match_type, format, season_id,
                     scheduled_at, disputed_at) values
  ('5b000000-0000-0000-0000-0000000000f1', '51000000-0000-0000-0000-00000000000a',
   '51000000-0000-0000-0000-00000000000b', 'EN_DISPUTA', 'RANKING', 'FUTBOL_5',
   (select id from seasons where is_active = true limit 1),
   now() - interval '2 days', now() - interval '30 hours');

insert into match_results (match_id, team_id, submitted_by, goals_scored, goals_against) values
  ('5b000000-0000-0000-0000-0000000000f1', '51000000-0000-0000-0000-00000000000a',
   '33333333-3333-3333-3333-000000000001', 2, 1),
  ('5b000000-0000-0000-0000-0000000000f1', '51000000-0000-0000-0000-00000000000b',
   '33333333-3333-3333-3333-000000000004', 3, 1);

insert into match_dispute_votes (match_id, profile_id, voted_team_id) values
  ('5b000000-0000-0000-0000-0000000000f1', '33333333-3333-3333-3333-000000000001',
   '51000000-0000-0000-0000-00000000000a'),
  ('5b000000-0000-0000-0000-0000000000f1', '33333333-3333-3333-3333-000000000004',
   '51000000-0000-0000-0000-00000000000a');

-- m2: disputa vencida SIN votos. Fair Play 90 (C) contra 70 (D) → gana C.
insert into matches (id, team_a_id, team_b_id, status, match_type, format, season_id,
                     scheduled_at, disputed_at) values
  ('5b000000-0000-0000-0000-0000000000f2', '51000000-0000-0000-0000-00000000000c',
   '51000000-0000-0000-0000-00000000000d', 'EN_DISPUTA', 'AMISTOSO', 'FUTBOL_5',
   (select id from seasons where is_active = true limit 1),
   now() - interval '2 days', now() - interval '30 hours');

insert into match_results (match_id, team_id, submitted_by, goals_scored, goals_against) values
  ('5b000000-0000-0000-0000-0000000000f2', '51000000-0000-0000-0000-00000000000c',
   '33333333-3333-3333-3333-000000000001', 4, 0),
  ('5b000000-0000-0000-0000-0000000000f2', '51000000-0000-0000-0000-00000000000d',
   '33333333-3333-3333-3333-000000000004', 1, 1);

-- m3: disputa vencida sin votos y con Fair Play IDÉNTICO (55 y 55) → sin criterio.
insert into matches (id, team_a_id, team_b_id, status, match_type, format, season_id,
                     scheduled_at, disputed_at) values
  ('5b000000-0000-0000-0000-0000000000f3', '51000000-0000-0000-0000-00000000000e',
   '51000000-0000-0000-0000-00000000000f', 'EN_DISPUTA', 'AMISTOSO', 'FUTBOL_5',
   (select id from seasons where is_active = true limit 1),
   now() - interval '2 days', now() - interval '30 hours');

insert into match_results (match_id, team_id, submitted_by, goals_scored, goals_against) values
  ('5b000000-0000-0000-0000-0000000000f3', '51000000-0000-0000-0000-00000000000e',
   '33333333-3333-3333-3333-000000000001', 2, 2),
  ('5b000000-0000-0000-0000-0000000000f3', '51000000-0000-0000-0000-00000000000f',
   '33333333-3333-3333-3333-000000000004', 5, 0);

-- m4: disputa vencida con UN SOLO marcador cargado (el caso que abre
-- sweep_stale_matches al vencer un EN_VIVO). El voto favorece al equipo que
-- nunca cargó: no hay marcador que adoptar.
insert into matches (id, team_a_id, team_b_id, status, match_type, format, season_id,
                     scheduled_at, disputed_at) values
  ('5b000000-0000-0000-0000-0000000000f4', '51000000-0000-0000-0000-00000000000a',
   '51000000-0000-0000-0000-00000000000c', 'EN_DISPUTA', 'AMISTOSO', 'FUTBOL_5',
   (select id from seasons where is_active = true limit 1),
   now() - interval '2 days', now() - interval '30 hours');

insert into match_results (match_id, team_id, submitted_by, goals_scored, goals_against) values
  ('5b000000-0000-0000-0000-0000000000f4', '51000000-0000-0000-0000-00000000000c',
   '33333333-3333-3333-3333-000000000004', 1, 0);

insert into match_dispute_votes (match_id, profile_id, voted_team_id) values
  ('5b000000-0000-0000-0000-0000000000f4', '33333333-3333-3333-3333-000000000001',
   '51000000-0000-0000-0000-00000000000a');

-- m5: disputa abierta hace 2 h — dentro de la ventana, no se toca.
insert into matches (id, team_a_id, team_b_id, status, match_type, format, season_id,
                     scheduled_at, disputed_at) values
  ('5b000000-0000-0000-0000-0000000000f5', '51000000-0000-0000-0000-00000000000b',
   '51000000-0000-0000-0000-00000000000d', 'EN_DISPUTA', 'AMISTOSO', 'FUTBOL_5',
   (select id from seasons where is_active = true limit 1),
   now() - interval '3 hours', now() - interval '2 hours');

insert into match_results (match_id, team_id, submitted_by, goals_scored, goals_against) values
  ('5b000000-0000-0000-0000-0000000000f5', '51000000-0000-0000-0000-00000000000b',
   '33333333-3333-3333-3333-000000000001', 1, 0),
  ('5b000000-0000-0000-0000-0000000000f5', '51000000-0000-0000-0000-00000000000d',
   '33333333-3333-3333-3333-000000000004', 2, 2);


-- ── Corrida ─────────────────────────────────────────────────────────────────
select lives_ok(
  $$ select public.sweep_disputed_matches() $$,
  'D-0: el escrutinio corre sin errores');

-- ── D-1..D-4. Mayoría de votos ──────────────────────────────────────────────
select results_eq(
  $$ select status::text from matches where id = '5b000000-0000-0000-0000-0000000000f1' $$,
  array['FINALIZADO'],
  'D-1: una disputa vencida con mayoría de votos se cierra sola');

select results_eq(
  $$ select goals_scored, goals_against from match_results
     where match_id = '5b000000-0000-0000-0000-0000000000f1'
       and team_id  = '51000000-0000-0000-0000-00000000000b' $$,
  $$ values (1, 2) $$,
  'D-2: el perdedor adopta el espejo del marcador del ganador');

select results_eq(
  $$ select season_wins, season_goals_for, elo_rating
     from teams where id = '51000000-0000-0000-0000-00000000000a' $$,
  $$ values (1, 2, 1020) $$,
  'D-3: el ganador por votos suma victoria, 2 GF y ELO +20');

select results_eq(
  $$ select season_losses, season_goals_against, elo_rating
     from teams where id = '51000000-0000-0000-0000-00000000000b' $$,
  $$ values (1, 2, 980) $$,
  'D-4: el perdedor suma derrota, 2 GC y ELO −20');

-- ── D-5. Desempate por Fair Play ────────────────────────────────────────────
-- Sin votos, 90 contra 70. Es AMISTOSO: mueve stats pero no ELO.
select results_eq(
  $$ select status::text from matches where id = '5b000000-0000-0000-0000-0000000000f2' $$,
  array['FINALIZADO'],
  'D-5: sin votos, el Fair Play más alto se lleva el partido');

select results_eq(
  $$ select goals_scored, goals_against from match_results
     where match_id = '5b000000-0000-0000-0000-0000000000f2'
       and team_id  = '51000000-0000-0000-0000-00000000000d' $$,
  $$ values (0, 4) $$,
  'D-5b: el marcador del ganador por Fair Play también se espeja');

-- ── D-6. Empate total → para el admin ───────────────────────────────────────
select results_eq(
  $$ select status::text from matches where id = '5b000000-0000-0000-0000-0000000000f3' $$,
  array['EN_DISPUTA'],
  'D-6: votos y Fair Play empatados dejan el partido para el admin');

-- ── D-7. Falta un marcador → para el admin ──────────────────────────────────
select results_eq(
  $$ select status::text from matches where id = '5b000000-0000-0000-0000-0000000000f4' $$,
  array['EN_DISPUTA'],
  'D-7: sin el marcador de los dos equipos el escrutinio no cierra el partido');

-- ── D-8. Dentro de la ventana ───────────────────────────────────────────────
select results_eq(
  $$ select status::text from matches where id = '5b000000-0000-0000-0000-0000000000f5' $$,
  array['EN_DISPUTA'],
  'D-8: una disputa de 2 horas sigue abierta');

-- ── D-9. Idempotencia ───────────────────────────────────────────────────────
-- Si el escrutinio volviera a procesar el partido ya cerrado, apply_match_outcome
-- sumaría ELO y stats por segunda vez.
select public.sweep_disputed_matches();

select results_eq(
  $$ select season_wins, elo_rating from teams where id = '51000000-0000-0000-0000-00000000000a' $$,
  $$ values (1, 1020) $$,
  'D-9: una segunda corrida no reprocesa la disputa ya resuelta');

-- ── D-10. La resolución manual ya no existe ─────────────────────────────────
select is_empty(
  $$ select p.proname from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'resolve_match_dispute' $$,
  'D-10: resolve_match_dispute fue eliminada — no hay resolución disparable por el cliente');

select * from finish();
rollback;
