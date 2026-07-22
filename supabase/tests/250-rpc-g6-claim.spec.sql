-- ============================================================
-- 250-rpc-g6-claim — claim_wo: validación de goleadores + MVP (pgTAP)
-- ============================================================
-- Migración declarativa de tests-legacy/g6_claim_wo.sql: prueba la RPC
-- public.claim_wo (20260713201810_g6_wo_scorers_mvp.sql).
--
-- Escenario propio: partido CONFIRMADO Leones vs Tigres + capitán de Leones
-- con check-in. Casos (secuenciales, una transacción):
--   G6-1 — Happy path: capitán, 3 goles propios, MVP propio → devuelve id.
--   G6-2 — Rechaza suma de goles > 3.
--   G6-3 — Rechaza goleador ajeno al equipo reclamante.
--   G6-4 — Rechaza emisor no autorizado (outsider sin rol ni check-in).
--   G6-5 — Rechaza MVP ajeno al equipo reclamante.
--   G6-6 — Rechaza más de 3 goleadores.
--
-- claim_wo tiene UNIQUE(match_id): tras el happy path se borra el reclamo
-- creado para que los casos negativos fallen por su validación y no por el
-- unique. Los casos negativos usan throws_ok (basta con que la RPC rechace),
-- fiel a la laxitud del legacy ("cualquier error = validación activa").
--
-- Como el legacy: postgres seteando request.jwt.claims. Firma:
-- claim_wo(match_id, team_id, reason, photo_url, scorers jsonb, mvp_id).
-- IDs del seed: Leones 2222...221 · Tigres 2222...222 · capitán Leones
-- 33333333-...-0001 (auth aaaaaaaa-...-0001) · rival 33333333-...-0004 ·
-- outsider auth 8e7bd5df-5201-4622-8f6b-b94725c18da8.
-- ============================================================

begin;
select plan(6);

-- ── Setup: partido CONFIRMADO + capitán de Leones con check-in ──────────────
insert into matches (id, team_a_id, team_b_id, match_type, status, format, scheduled_at)
values ('d4d4d4d4-0000-0000-0000-0000000000c1',
        '22222222-2222-2222-2222-222222222221',
        '22222222-2222-2222-2222-222222222222',
        'RANKING', 'CONFIRMADO', 'FUTBOL_5', now() - interval '1 hour');
insert into match_participants (match_id, profile_id, team_id, did_checkin)
values ('d4d4d4d4-0000-0000-0000-0000000000c1',
        '33333333-3333-3333-3333-000000000001',
        '22222222-2222-2222-2222-222222222221', true);

select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-000000000001"}', true);

-- ── G6-1. Happy path: capitán, 3 goles propios, MVP propio ──────────────────
select ok(
  (select public.claim_wo(
     'd4d4d4d4-0000-0000-0000-0000000000c1',
     '22222222-2222-2222-2222-222222222221',
     'NO_PRESENTACION', 'evidencia/e.jpg',
     jsonb_build_array(jsonb_build_object('profile_id', '33333333-3333-3333-3333-000000000001', 'goals', 3)),
     '33333333-3333-3333-3333-000000000001')) is not null,
  'G6-1: el happy path devuelve el id del reclamo');

-- Se borra para no chocar con el UNIQUE(match_id) en los casos siguientes.
delete from wo_claims where match_id = 'd4d4d4d4-0000-0000-0000-0000000000c1';

-- ── G6-2. Rechaza suma de goles > 3 ─────────────────────────────────────────
select throws_ok(
  $$ select public.claim_wo(
       'd4d4d4d4-0000-0000-0000-0000000000c1', '22222222-2222-2222-2222-222222222221',
       'NO_PRESENTACION', 'p.jpg',
       jsonb_build_array(jsonb_build_object('profile_id', '33333333-3333-3333-3333-000000000001', 'goals', 4)),
       null) $$,
  'P0001', null, 'G6-2: rechaza una suma de goles mayor al 3-0 del WO');

-- ── G6-3. Rechaza goleador ajeno al equipo reclamante ───────────────────────
select throws_ok(
  $$ select public.claim_wo(
       'd4d4d4d4-0000-0000-0000-0000000000c1', '22222222-2222-2222-2222-222222222221',
       'NO_PRESENTACION', 'p.jpg',
       jsonb_build_array(jsonb_build_object('profile_id', '33333333-3333-3333-3333-000000000004', 'goals', 1)),
       null) $$,
  'P0001', null, 'G6-3: rechaza un goleador que no pertenece al equipo reclamante');

-- ── G6-4. Rechaza emisor no autorizado (outsider) ───────────────────────────
select set_config('request.jwt.claims', '{"sub":"8e7bd5df-5201-4622-8f6b-b94725c18da8"}', true);
select throws_ok(
  $$ select public.claim_wo(
       'd4d4d4d4-0000-0000-0000-0000000000c1', '22222222-2222-2222-2222-222222222221',
       'NO_PRESENTACION', 'p.jpg', '[]'::jsonb, null) $$,
  'P0001', null, 'G6-4: rechaza a un outsider sin rol de equipo ni check-in');
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-000000000001"}', true);

-- ── G6-5. Rechaza MVP ajeno al equipo reclamante ────────────────────────────
select throws_ok(
  $$ select public.claim_wo(
       'd4d4d4d4-0000-0000-0000-0000000000c1', '22222222-2222-2222-2222-222222222221',
       'NO_PRESENTACION', 'p.jpg',
       jsonb_build_array(jsonb_build_object('profile_id', '33333333-3333-3333-3333-000000000001', 'goals', 1)),
       '33333333-3333-3333-3333-000000000004') $$,
  'P0001', null, 'G6-5: rechaza un MVP que no pertenece al equipo reclamante');

-- ── G6-6. Rechaza más de 3 goleadores ───────────────────────────────────────
select throws_ok(
  $$ select public.claim_wo(
       'd4d4d4d4-0000-0000-0000-0000000000c1', '22222222-2222-2222-2222-222222222221',
       'NO_PRESENTACION', 'p.jpg',
       jsonb_build_array(
         jsonb_build_object('profile_id', '33333333-3333-3333-3333-000000000001', 'goals', 1),
         jsonb_build_object('profile_id', '33333333-3333-3333-3333-000000000001', 'goals', 1),
         jsonb_build_object('profile_id', '33333333-3333-3333-3333-000000000001', 'goals', 1),
         jsonb_build_object('profile_id', '33333333-3333-3333-3333-000000000001', 'goals', 1)),
       null) $$,
  'P0001', null, 'G6-6: rechaza más de 3 goleadores');

select * from finish();
rollback;
