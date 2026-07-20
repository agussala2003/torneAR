-- ============================================================
-- 100-rls-security — Regresión de seguridad P1 (pgTAP)
-- ============================================================
-- Migración declarativa de tests-legacy/p1_security_regression.sql: los 7
-- intentos de acceso no autorizado de la auditoría de marzo 2026
-- (docs/auditoria.md), arreglados el 28-mar y re-verificados el 8-jul-2026.
--
-- Primera suite que usa los helpers de 000-setup.sql:
--   tests.authenticate_as_profile(auth_uid) → claims JWT + rol authenticated
--   tests.clear_auth()                      → vuelve al contexto privilegiado
--
-- Identidades del seed (supabase/seed.sql):
--   capitán Leones : perfil 33333333-...-0001 · auth aaaaaaaa-...-0001
--   capitán Tigres : perfil 33333333-...-0004 · auth aaaaaaaa-...-0004
--   capitán Rayos  : perfil 33333333-...-0007 · auth aaaaaaaa-...-0007
--   sin equipo     : auth 8e7bd5df-5201-4622-8f6b-b94725c18da8
--   equipos        : Leones 2222...221 · Tigres 2222...222 · Rayos 2222...223
--
-- El escenario usa IDs fijos con prefijo 99999999- (pgTAP no comparte
-- variables entre sentencias, a diferencia del DO $$ legacy):
--   desafío 9999...0001 · partido 9999...0002 · propuesta 9999...0003
--   venue 9999...0004
--
-- Nota sobre las aserciones: las RPCs son SECURITY DEFINER y validan
-- autorización a mano (RAISE EXCEPTION 'No autorizado...'), NO devuelven
-- "permission denied" de Postgres → se usa throws_matching contra el mensaje
-- real. El caso 6 (UPDATE directo) no lanza error: RLS filtra la fila en
-- silencio → is_empty sobre UPDATE ... RETURNING replica el chequeo de
-- ROW_COUNT del legacy.
-- ============================================================

begin;
select plan(7);

-- ── Setup: el capitán de Rayos entra como JUGADOR raso de Leones ────────────
insert into team_members (team_id, profile_id, role)
values ('22222222-2222-2222-2222-222222222221',
        '33333333-3333-3333-3333-000000000007', 'JUGADOR');

-- ── 1. send_challenge invocado por un JUGADOR (no admin) ────────────────────
select tests.authenticate_as_profile('aaaaaaaa-0000-0000-0000-000000000007');

select throws_matching(
  $$ select public.send_challenge(
       '22222222-2222-2222-2222-222222222221',
       '22222222-2222-2222-2222-222222222222',
       'AMISTOSO') $$,
  'No autorizado',
  'P1-1: un JUGADOR no puede enviar un desafío en nombre del equipo'
);

-- ── 2. accept_challenge invocado por alguien ajeno al equipo receptor ───────
select tests.clear_auth();
insert into challenges (id, from_team_id, to_team_id, created_by, status)
values ('99999999-0000-0000-0000-000000000001',
        '22222222-2222-2222-2222-222222222221',
        '22222222-2222-2222-2222-222222222223',
        '33333333-3333-3333-3333-000000000001', 'ENVIADA');

select tests.authenticate_as_profile('aaaaaaaa-0000-0000-0000-000000000004');

select throws_matching(
  $$ select public.accept_challenge('99999999-0000-0000-0000-000000000001') $$,
  'No autorizado',
  'P1-2: un ajeno al equipo receptor no puede aceptar el desafío'
);

-- ── 3. confirm_match_proposal invocado por el propio equipo proponente ──────
select tests.clear_auth();
insert into matches (id, team_a_id, team_b_id, match_type, status, scheduled_at)
values ('99999999-0000-0000-0000-000000000002',
        '22222222-2222-2222-2222-222222222221',
        '22222222-2222-2222-2222-222222222222',
        'AMISTOSO', 'PENDIENTE', now() + interval '7 days');
insert into match_proposals (id, match_id, proposed_by, from_team_id, format,
                             match_type, scheduled_at, duration_minutes)
values ('99999999-0000-0000-0000-000000000003',
        '99999999-0000-0000-0000-000000000002',
        '33333333-3333-3333-3333-000000000001',
        '22222222-2222-2222-2222-222222222221',
        'FUTBOL_5', 'AMISTOSO', now() + interval '7 days', 60);

select tests.authenticate_as_profile('aaaaaaaa-0000-0000-0000-000000000001');

select throws_matching(
  $$ select public.confirm_match_proposal(
       '99999999-0000-0000-0000-000000000003',
       '99999999-0000-0000-0000-000000000002') $$,
  'No autorizado',
  'P1-3: el equipo proponente no puede confirmar su propia propuesta'
);

-- ── 4. checkin_team invocado por alguien sin equipo en el partido ───────────
select tests.clear_auth();
update matches set status = 'CONFIRMADO', format = 'FUTBOL_5'
where id = '99999999-0000-0000-0000-000000000002';

select tests.authenticate_as_profile('8e7bd5df-5201-4622-8f6b-b94725c18da8');

select throws_matching(
  $$ select public.checkin_team(
       '99999999-0000-0000-0000-000000000002',
       '22222222-2222-2222-2222-222222222221', null, null) $$,
  'No autorizado',
  'P1-4: un no-miembro no puede hacer check-in por el equipo'
);

-- ── 5. request_match_cancellation invocado por un JUGADOR (no admin) ────────
select tests.authenticate_as_profile('aaaaaaaa-0000-0000-0000-000000000007');

select throws_matching(
  $$ select public.request_match_cancellation(
       '99999999-0000-0000-0000-000000000002',
       '22222222-2222-2222-2222-222222222221',
       'MUTUO_ACUERDO', null) $$,
  'No autorizado',
  'P1-5: un JUGADOR no puede solicitar la cancelación del partido'
);

-- ── 6. UPDATE directo a challenges por un usuario ajeno (bypass del RPC) ────
-- RLS no lanza error en UPDATE: filtra la fila y afecta 0 registros. El
-- RETURNING vacío es la prueba de que la policy bloqueó la escritura.
select tests.authenticate_as_profile('aaaaaaaa-0000-0000-0000-000000000004');

select is_empty(
  $$ update public.challenges set status = 'ACEPTADA'
     where id = '99999999-0000-0000-0000-000000000001'
     returning 1 $$,
  'P1-6: RLS bloquea el UPDATE directo de un ajeno al desafío (0 filas)'
);

-- ── 7. checkin_team — geofence obligatorio cuando el venue tiene coords ─────
select tests.clear_auth();
insert into venues (id, name, lat, lng)
values ('99999999-0000-0000-0000-000000000004',
        '__TEST P1 Venue', -34.6037, -58.3816);
update matches set venue_id = '99999999-0000-0000-0000-000000000004'
where id = '99999999-0000-0000-0000-000000000002';

select tests.authenticate_as_profile('aaaaaaaa-0000-0000-0000-000000000001');

select throws_matching(
  $$ select public.checkin_team(
       '99999999-0000-0000-0000-000000000002',
       '22222222-2222-2222-2222-222222222221', null, null) $$,
  '(GPS|ubicación)',
  'P1-7: check-in sin GPS rechazado cuando el venue está georreferenciado'
);

select * from finish();
rollback;
