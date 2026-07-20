-- ============================================================
-- 120-rls-hotfix — Hallazgos ROJOS #2/#3 del audit 360° 2026-07-13 (pgTAP)
-- ============================================================
-- Migración declarativa de tests-legacy/hotfix_security_rls.sql:
--   H1 — profiles: un usuario NO puede auto-asignarse is_admin.
--   H2 — teams: un CAPITAN NO puede editar elo_rating (ni stats de sistema).
--   H3 — wo_claims: el INSERT directo está bloqueado (sólo RPC claim_wo).
--   H4 — camino feliz: name del equipo y full_name propio SÍ son editables
--        (el lockdown no rompió la app).
--   H5 — resolve_wo_claim: guarda de estado terminal + registro resolved_by.
--
-- H1/H2 defienden PRIVILEGIOS DE COLUMNA (20260714022651 + restaurados en
-- 20260719130000 tras la regresión del grant a nivel tabla): la policy
-- profiles_update_own SÍ matchea el row; lo que frena es el privilegio.
-- Esta suite es el canario de esa clase de regresión — el 19-jul la detectó.
--
-- Identidades del seed (supabase/seed.sql):
--   capitán Tigres : perfil 33333333-...-0004 · auth aaaaaaaa-...-0004
--   equipo Tigres  : 22222222-2222-2222-2222-222222222222
--   partido FINALIZADO Tigres vs Rayos sin claim: 44444444-4444-...-0003
--
-- Escenario H5 con ID fijo: claim 99999999-0000-0000-0000-000000000021.
-- ============================================================

begin;
select plan(8);

-- ── H1. profiles.is_admin — escalada de privilegios bloqueada ───────────────
select tests.authenticate_as_profile('aaaaaaaa-0000-0000-0000-000000000004');

select throws_ok(
  $$ update public.profiles set is_admin = true
     where id = '33333333-3333-3333-3333-000000000004' $$,
  '42501',
  null,
  'H1: el usuario no puede escribir su propio is_admin (permission denied)'
);

-- ── H2. teams.elo_rating — manipulación del ranking bloqueada ───────────────
select throws_ok(
  $$ update public.teams set elo_rating = 9999
     where id = '22222222-2222-2222-2222-222222222222' $$,
  '42501',
  null,
  'H2: el capitán no puede escribir elo_rating de su equipo (permission denied)'
);

-- ── H3. wo_claims — INSERT directo bloqueado (sólo RPC claim_wo) ────────────
select throws_ok(
  $$ insert into public.wo_claims
       (match_id, claimed_by, claiming_team_id, photo_url, reason, status)
     values ('44444444-4444-4444-4444-000000000003',
             '33333333-3333-3333-3333-000000000004',
             '22222222-2222-2222-2222-222222222222',
             'evidencia-falsa.jpg', 'bypass de claim_wo',
             'PENDIENTE_REVISION') $$,
  '42501',
  null,
  'H3: el INSERT directo a wo_claims está bloqueado (sólo la RPC claim_wo)'
);

-- ── H4. Camino feliz — el lockdown no rompió los updates legítimos ──────────
select results_eq(
  $$ update public.teams set name = name, updated_at = now()
     where id = '22222222-2222-2222-2222-222222222222'
     returning 1 $$,
  array[1],
  'H4a: el capitán sigue pudiendo editar name/updated_at de su equipo'
);

select results_eq(
  $$ update public.profiles set full_name = full_name, updated_at = now()
     where id = '33333333-3333-3333-3333-000000000004'
     returning 1 $$,
  array[1],
  'H4b: el usuario sigue pudiendo editar su propio full_name'
);

-- ── H5. resolve_wo_claim — guarda terminal + auditoría resolved_by ──────────
-- Setup (privilegiado): promover al capitán a admin y sembrar un claim
-- PENDIENTE sobre el partido FINALIZADO del seed.
select tests.clear_auth();

update public.profiles set is_admin = true
 where id = '33333333-3333-3333-3333-000000000004';

insert into public.wo_claims
  (id, match_id, claimed_by, claiming_team_id, photo_url, reason, status)
values ('99999999-0000-0000-0000-000000000021',
        '44444444-4444-4444-4444-000000000003',
        '33333333-3333-3333-3333-000000000004',
        '22222222-2222-2222-2222-222222222222',
        'evidencia.jpg', 'test guarda terminal', 'PENDIENTE_REVISION');

select tests.authenticate_as_profile('aaaaaaaa-0000-0000-0000-000000000004');

-- (a) Aprobar sobre un partido FINALIZADO debe frenar en la guarda terminal
--     (el 3-0 del WO no puede pisar un resultado real).
select throws_matching(
  $$ select public.resolve_wo_claim(
       '99999999-0000-0000-0000-000000000021', true, 'no debería aplicarse') $$,
  'estado terminal',
  'H5a: la guarda terminal frena la aprobación sobre partido resuelto'
);

-- (b) Rechazar sí procede...
select lives_ok(
  $$ select public.resolve_wo_claim(
       '99999999-0000-0000-0000-000000000021', false, 'rechazado en test') $$,
  'H5b: el rechazo del reclamo procede sin error'
);

-- ...y graba la auditoría del admin que resolvió.
select tests.clear_auth();

select results_eq(
  $$ select status::text, resolved_by from public.wo_claims
     where id = '99999999-0000-0000-0000-000000000021' $$,
  $$ values ('RECHAZADO', '33333333-3333-3333-3333-000000000004'::uuid) $$,
  'H5c: el rechazo queda registrado con resolved_by del admin'
);

select * from finish();
rollback;
