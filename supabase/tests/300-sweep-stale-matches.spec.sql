-- ============================================================
-- 300-sweep-stale-matches — Barrido de partidos huérfanos (pgTAP)
-- ============================================================
-- Cubre public.sweep_stale_matches() (migración 20260728181000), la única
-- pieza del sistema que MUTA ESTADO COMPETITIVO SIN INTERVENCIÓN HUMANA:
-- cancela partidos, otorga WOs y mueve ELO, stats de temporada y Fair Play.
-- Por eso es la función que más necesitaba cobertura de las tres tandas.
--
-- Se numera 300 y no 250 porque 250-rpc-g6-claim.spec.sql ya existe
-- (pg_prove corre en orden alfabético).
--
-- Ramas verificadas:
--   S-1/S-2  PENDIENTE viejo → CANCELADO; PENDIENTE reciente intacto.
--   S-3..S-6 CONFIRMADO vencido con un solo check-in → WO_A + 3-0 + ELO/stats.
--   S-7      CONFIRMADO vencido sin ningún check-in → CANCELADO (el agujero de
--            D4: sin check-in de nadie, claim_wo era inalcanzable para ambos).
--   S-8      CONFIRMADO vencido CON reclamo de WO en revisión → intacto. Es la
--            guarda que impide que el barrido le pise el veredicto al admin.
--   S-9      CONFIRMADO dentro de la ventana de gracia → intacto.
--   S-10     Idempotencia: una segunda corrida no reprocesa (no duplica ELO).
--
-- Equipos nuevos y aislados (elo 1000 de arranque) para que las aserciones de
-- ELO sean deterministas, igual que en 240-rpc-wo-admin.
--
-- Los conteos del jsonb de retorno NO se asertan: el barrido también recorre
-- los partidos del seed, así que esos totales no son estables entre corridas.
-- Todas las aserciones apuntan a ids propios de este archivo.
-- ============================================================

begin;
select plan(11);

-- ── Setup (postgres) ────────────────────────────────────────────────────────
insert into teams (id, name, category, zone, preferred_format) values
  ('50000000-0000-0000-0000-00000000000a', 'SWEEP_A', 'HOMBRES', 'ZSWEEP', 'FUTBOL_5'),
  ('50000000-0000-0000-0000-00000000000b', 'SWEEP_B', 'HOMBRES', 'ZSWEEP', 'FUTBOL_5'),
  ('50000000-0000-0000-0000-00000000000c', 'SWEEP_C', 'HOMBRES', 'ZSWEEP', 'FUTBOL_5'),
  ('50000000-0000-0000-0000-00000000000d', 'SWEEP_D', 'HOMBRES', 'ZSWEEP', 'FUTBOL_5');

-- m1: PENDIENTE creado hace 30 días y nunca coordinado (sin fecha).
insert into matches (id, team_a_id, team_b_id, status, match_type, created_at) values
  ('5a000000-0000-0000-0000-0000000000f1', '50000000-0000-0000-0000-00000000000a',
   '50000000-0000-0000-0000-00000000000b', 'PENDIENTE', 'AMISTOSO', now() - interval '30 days');

-- m2: PENDIENTE de ayer — dentro del umbral, no se toca.
insert into matches (id, team_a_id, team_b_id, status, match_type, created_at) values
  ('5a000000-0000-0000-0000-0000000000f2', '50000000-0000-0000-0000-00000000000a',
   '50000000-0000-0000-0000-00000000000b', 'PENDIENTE', 'AMISTOSO', now() - interval '1 day');

-- m3: CONFIRMADO de hace 8 h, sólo el equipo A hizo check-in → WO_A.
insert into matches (id, team_a_id, team_b_id, status, match_type, format, season_id,
                     scheduled_at, checkin_team_a_at) values
  ('5a000000-0000-0000-0000-0000000000f3', '50000000-0000-0000-0000-00000000000c',
   '50000000-0000-0000-0000-00000000000d', 'CONFIRMADO', 'RANKING', 'FUTBOL_5',
   (select id from seasons where is_active = true limit 1),
   now() - interval '8 hours', now() - interval '8 hours');

-- El barrido busca un perfil con check-in para firmar el 3-0 (submitted_by es
-- NOT NULL). Sin esta fila la rama igual otorga el WO, pero sin marcador.
insert into match_participants (match_id, profile_id, team_id, did_checkin, checkin_at, is_result_loader)
values ('5a000000-0000-0000-0000-0000000000f3',
        '33333333-3333-3333-3333-000000000001', '50000000-0000-0000-0000-00000000000c',
        true, now() - interval '8 hours', true);

-- m4: CONFIRMADO de hace 8 h y no fue nadie → CANCELADO.
-- `format` es obligatorio para pasar a CONFIRMADO desde el trigger
-- `enforce_match_format_required` (`20260714200000`, Bloque 2). Esta fixture se
-- escribió sin él y la suite nunca se había ejecutado, así que abortaba entera
-- (0/11) en la primera corrida real. Los demás partidos CONFIRMADO del archivo
-- ya lo traían.
insert into matches (id, team_a_id, team_b_id, status, match_type, format, scheduled_at) values
  ('5a000000-0000-0000-0000-0000000000f4', '50000000-0000-0000-0000-00000000000a',
   '50000000-0000-0000-0000-00000000000b', 'CONFIRMADO', 'AMISTOSO', 'FUTBOL_5',
   now() - interval '8 hours');

-- m5: mismo caso que m3 pero con un reclamo de WO en revisión → intocable.
insert into matches (id, team_a_id, team_b_id, status, match_type, format, scheduled_at, checkin_team_a_at) values
  ('5a000000-0000-0000-0000-0000000000f5', '50000000-0000-0000-0000-00000000000a',
   '50000000-0000-0000-0000-00000000000b', 'CONFIRMADO', 'AMISTOSO', 'FUTBOL_5',
   now() - interval '8 hours', now() - interval '8 hours');

insert into wo_claims (match_id, claimed_by, claiming_team_id, photo_url, reason, status)
values ('5a000000-0000-0000-0000-0000000000f5',
        '33333333-3333-3333-3333-000000000001', '50000000-0000-0000-0000-00000000000a',
        'wo_evidences/sweep.jpg', 'NO_PRESENTACION', 'PENDIENTE_REVISION');

-- m6: CONFIRMADO que arranca en 2 h — todavía no venció la gracia.
insert into matches (id, team_a_id, team_b_id, status, match_type, format, scheduled_at) values
  ('5a000000-0000-0000-0000-0000000000f6', '50000000-0000-0000-0000-00000000000a',
   '50000000-0000-0000-0000-00000000000b', 'CONFIRMADO', 'AMISTOSO', 'FUTBOL_5',
   now() + interval '2 hours');


-- ── Primera corrida ─────────────────────────────────────────────────────────
select lives_ok(
  $$ select public.sweep_stale_matches() $$,
  'S-0: el barrido corre sin errores');

-- ── S-1/S-2. PENDIENTE ──────────────────────────────────────────────────────
select results_eq(
  $$ select status::text from matches where id = '5a000000-0000-0000-0000-0000000000f1' $$,
  array['CANCELADO'],
  'S-1: un PENDIENTE sin coordinar de 30 días se cancela solo');

select results_eq(
  $$ select status::text from matches where id = '5a000000-0000-0000-0000-0000000000f2' $$,
  array['PENDIENTE'],
  'S-2: un PENDIENTE de ayer no se toca');

-- ── S-3..S-6. Auto-WO por no presentación ───────────────────────────────────
select results_eq(
  $$ select status::text from matches where id = '5a000000-0000-0000-0000-0000000000f3' $$,
  array['WO_A'],
  'S-3: CONFIRMADO vencido con check-in sólo de A termina en WO_A');

select results_eq(
  $$ select goals_scored, goals_against from match_results
     where match_id = '5a000000-0000-0000-0000-0000000000f3'
       and team_id  = '50000000-0000-0000-0000-00000000000c' $$,
  $$ values (3, 0) $$,
  'S-4: se registra el 3-0 a favor del equipo presente');

select results_eq(
  $$ select season_wins, season_goals_for, elo_rating
     from teams where id = '50000000-0000-0000-0000-00000000000c' $$,
  $$ values (1, 3, 1020) $$,
  'S-5: el presente suma victoria, 3 GF y ELO +20');

select results_eq(
  $$ select season_losses, season_goals_against, elo_rating
     from teams where id = '50000000-0000-0000-0000-00000000000d' $$,
  $$ values (1, 3, 980) $$,
  'S-6: el ausente suma derrota, 3 GC y ELO −20');

-- ── S-7. Nadie se presentó (agujero de D4) ──────────────────────────────────
select results_eq(
  $$ select status::text from matches where id = '5a000000-0000-0000-0000-0000000000f4' $$,
  array['CANCELADO'],
  'S-7: si ningún equipo hizo check-in el partido se cancela y libera a los convocados');

-- ── S-8. No pisar al admin ──────────────────────────────────────────────────
select results_eq(
  $$ select status::text from matches where id = '5a000000-0000-0000-0000-0000000000f5' $$,
  array['CONFIRMADO'],
  'S-8: un partido con reclamo de WO en revisión queda intacto para el admin');

-- ── S-9. Dentro de la ventana de gracia ─────────────────────────────────────
select results_eq(
  $$ select status::text from matches where id = '5a000000-0000-0000-0000-0000000000f6' $$,
  array['CONFIRMADO'],
  'S-9: un partido que todavía no empezó no se toca');

-- ── S-10. Idempotencia: la segunda corrida no reprocesa ─────────────────────
-- Si el barrido volviera a aplicar el WO, apply_match_outcome sumaría ELO y
-- stats por segunda vez — exactamente el bug de doble conteo que costó una
-- reparación de datos completa en 20260714024611.
select public.sweep_stale_matches();

select results_eq(
  $$ select elo_rating, season_wins from teams where id = '50000000-0000-0000-0000-00000000000c' $$,
  $$ values (1020, 1) $$,
  'S-10: correr el barrido dos veces no duplica ELO ni estadísticas');

select * from finish();
rollback;
