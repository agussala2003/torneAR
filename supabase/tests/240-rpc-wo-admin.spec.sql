-- ============================================================
-- 240-rpc-wo-admin — Resolución administrativa de WOs (pgTAP)
-- ============================================================
-- Migración declarativa de tests-legacy/wo_admin_resolution.sql: prueba
-- resolve_wo_claim + get_pending_wo_claims con el hardening del hotfix
-- (FOR UPDATE, guarda terminal, resolved_by).
-- Migraciones: 20260714002506_wo_admin_resolution.sql +
-- 20260714022651_hotfix_security_rls.sql.
--
-- Flujo secuencial (una transacción, como está diseñado el legacy):
--   1/2 — un no-admin (0001) no puede resolver ni listar pendientes.
--   3   — como admin (0004), el claim pendiente aparece en la lista.
--   4-7 — aprobar claim1: status APROBADO + resolved_by, partido WO_A,
--         resultado 3-0, stats/ELO del motor unificado (equipos nuevos:
--         ganador 1000→1020, ausente 1000→980).
--   8/9 — rechazar claim2: queda RECHAZADO y el partido no cambia.
--   10  — get_pending deja de mostrar lo resuelto.
--
-- Como el legacy: postgres seteando request.jwt.claims. IDs del seed:
-- admin 33333333-...-0004 (auth ...-0004) · no-admin 33333333-...-0001
-- (auth ...-0001).
-- ============================================================

begin;
select plan(11);

-- ── Setup (postgres): admin + 2 partidos RANKING con claims pendientes ──────
update profiles set is_admin = true where id = '33333333-3333-3333-3333-000000000004';

insert into teams (id, name, category, zone, preferred_format) values
  ('c3c3c3c3-0000-0000-0000-000000000001', 'TA_WO', 'HOMBRES', 'ZWO_TEST', 'FUTBOL_5'),
  ('c3c3c3c3-0000-0000-0000-000000000002', 'TB_WO', 'HOMBRES', 'ZWO_TEST', 'FUTBOL_5');

insert into matches (id, team_a_id, team_b_id, status, match_type, format, season_id) values
  ('c3c3c3c3-0000-0000-0000-0000000000c1', 'c3c3c3c3-0000-0000-0000-000000000001', 'c3c3c3c3-0000-0000-0000-000000000002',
   'CONFIRMADO', 'RANKING', 'FUTBOL_5', (select id from seasons where is_active = true limit 1)),
  ('c3c3c3c3-0000-0000-0000-0000000000c2', 'c3c3c3c3-0000-0000-0000-000000000001', 'c3c3c3c3-0000-0000-0000-000000000002',
   'CONFIRMADO', 'RANKING', 'FUTBOL_5', (select id from seasons where is_active = true limit 1));

insert into wo_claims (id, match_id, claimed_by, claiming_team_id, photo_url, reason, status, scorers, mvp_id)
values ('c3c3c3c3-0000-0000-0000-0000000000d1', 'c3c3c3c3-0000-0000-0000-0000000000c1',
        '33333333-3333-3333-3333-000000000004', 'c3c3c3c3-0000-0000-0000-000000000001',
        'wo_evidences/x.jpg', 'NO_PRESENTACION', 'PENDIENTE_REVISION',
        jsonb_build_array(jsonb_build_object('profile_id', '33333333-3333-3333-3333-000000000004', 'goals', 3)),
        '33333333-3333-3333-3333-000000000004');
insert into wo_claims (id, match_id, claimed_by, claiming_team_id, photo_url, reason, status)
values ('c3c3c3c3-0000-0000-0000-0000000000d2', 'c3c3c3c3-0000-0000-0000-0000000000c2',
        '33333333-3333-3333-3333-000000000004', 'c3c3c3c3-0000-0000-0000-000000000001',
        'wo_evidences/y.jpg', 'ABANDONO', 'PENDIENTE_REVISION');

-- ── WA-1/2. No-admin (0001): ambas RPCs rechazan ────────────────────────────
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-000000000001"}', true);
select throws_matching(
  $$ select resolve_wo_claim('c3c3c3c3-0000-0000-0000-0000000000d1', true, null) $$,
  'No autorizado', 'WA-1: un no-admin no puede resolver un reclamo');
select throws_matching(
  $$ select count(*) from get_pending_wo_claims() $$,
  'No autorizado', 'WA-2: un no-admin no puede listar los reclamos pendientes');

-- ── WA-3. Como admin (0004): el claim pendiente aparece ─────────────────────
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-000000000004"}', true);
select isnt_empty(
  $$ select 1 from get_pending_wo_claims() where claim_id = 'c3c3c3c3-0000-0000-0000-0000000000d1' $$,
  'WA-3: el claim pendiente aparece en get_pending_wo_claims');

-- ── WA-4..7. Aprobar claim1: estado + 3-0 + stats/ELO ───────────────────────
select resolve_wo_claim('c3c3c3c3-0000-0000-0000-0000000000d1', true, 'aprobado en test');

select results_eq(
  $$ select status::text, resolved_by from wo_claims where id = 'c3c3c3c3-0000-0000-0000-0000000000d1' $$,
  $$ values ('APROBADO', '33333333-3333-3333-3333-000000000004'::uuid) $$,
  'WA-4: el claim queda APROBADO con resolved_by del admin');
select results_eq(
  $$ select status::text from matches where id = 'c3c3c3c3-0000-0000-0000-0000000000c1' $$,
  array['WO_A'], 'WA-5: el partido del claim aprobado queda en WO_A');
select results_eq(
  $$ select goals_scored, goals_against from match_results
     where match_id = 'c3c3c3c3-0000-0000-0000-0000000000c1'
       and team_id  = 'c3c3c3c3-0000-0000-0000-000000000001' $$,
  $$ values (3, 0) $$, 'WA-6: el resultado del WO es 3-0 para el ganador');
select results_eq(
  $$ select season_wins, season_goals_for, elo_rating
     from teams where id = 'c3c3c3c3-0000-0000-0000-000000000001' $$,
  $$ values (1, 3, 1020) $$, 'WA-7a: ganador suma victoria, 3 GF y ELO +20');
select results_eq(
  $$ select season_losses, season_goals_against, elo_rating
     from teams where id = 'c3c3c3c3-0000-0000-0000-000000000002' $$,
  $$ values (1, 3, 980) $$, 'WA-7b: ausente suma derrota, 3 GC y ELO -20');

-- ── WA-8/9. Rechazar claim2: el partido no cambia ───────────────────────────
select resolve_wo_claim('c3c3c3c3-0000-0000-0000-0000000000d2', false, 'evidencia insuficiente');
select results_eq(
  $$ select status::text from wo_claims where id = 'c3c3c3c3-0000-0000-0000-0000000000d2' $$,
  array['RECHAZADO'], 'WA-8: el claim rechazado queda en RECHAZADO');
select results_eq(
  $$ select status::text from matches where id = 'c3c3c3c3-0000-0000-0000-0000000000c2' $$,
  array['CONFIRMADO'], 'WA-9: el partido del claim rechazado sigue CONFIRMADO');

-- ── WA-10. get_pending deja de mostrar lo resuelto ──────────────────────────
select is_empty(
  $$ select 1 from get_pending_wo_claims()
     where claim_id in ('c3c3c3c3-0000-0000-0000-0000000000d1', 'c3c3c3c3-0000-0000-0000-0000000000d2') $$,
  'WA-10: ningún claim resuelto sigue apareciendo como pendiente');

select * from finish();
rollback;
