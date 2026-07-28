-- ============================================================
-- 290-geofence-hardening — Geofence obligatorio (pgTAP)
-- ============================================================
-- Valida 20260728140000. Qué se estaba escapando antes:
--
--   submit_team_checkin abría el geofence con
--     IF v_match.venue_id IS NOT NULL AND p_lat IS NOT NULL AND p_lng IS NOT NULL
--   es decir, EL CLIENTE decidía si el control corría. La RPC tiene
--   GRANT EXECUTE ... TO authenticated, así que cualquier usuario logueado podía
--   llamarla desde curl sin coordenadas y presentar la lista desde cualquier
--   lugar del mundo. Sin error y sin rastro: un check-in perfectamente válido.
--
--   (checkin_team ya había cerrado esto en 20260328150331; el agujero vivía sólo
--   en la RPC de convocatoria, que es la que usa el flujo real de la app.)
--
--   La segunda mitad del problema: un partido sin venue_id no se validaba nunca.
--   Con 14 de 20 zonas activas sin complejos cargados, proponer con dirección de
--   texto libre era el camino habitual — y desactivaba el geofence entero. Por
--   eso el trigger que exige venue para confirmar un RANKING.
--
-- Escenarios:
--   G1 — app_settings: el radio existe y el helper lo lee.
--   G2 — submit_team_checkin sin coords y con venue → LOCATION_REQUIRED.
--   G3 — submit_team_checkin lejos del venue → GEOFENCE_FAILED.
--   G4 — submit_team_checkin dentro del radio → pasa.
--   G5 — trigger: un RANKING no se confirma sin venue; con venue sí; los
--        amistosos siguen libres.
--
-- Fixtures: mismo criterio que 270 — roster propio (profiles 66666666-…),
-- matches con UUID determinista (88888888-…) y ROLLBACK final.
-- Venue de referencia: 'Racing Fútbol 5 Palermo' (0e000000-…d3), en
-- -34.58200 / -58.43000.
-- ============================================================

begin;
select plan(11);

-- ── Roster: 6 jugadores para Leones (profiles 66666666-…01..06) ─────────────
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
                        raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
                        confirmation_token, recovery_token, email_change, email_change_token_new)
select '00000000-0000-0000-0000-000000000000',
       ('cccccccc-0000-0000-0000-0000000000' || lpad(g::text, 2, '0'))::uuid,
       'authenticated', 'authenticated', 'gf.leo' || g || '@test.local', '', now(),
       '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', ''
from generate_series(1, 6) g;

insert into profiles (id, auth_user_id, username, full_name, zone)
select ('66666666-0000-0000-0000-0000000000' || lpad(g::text, 2, '0'))::uuid,
       ('cccccccc-0000-0000-0000-0000000000' || lpad(g::text, 2, '0'))::uuid,
       '__gf_leo' || g, 'GF Leo ' || g, 'Palermo'
from generate_series(1, 6) g;

insert into team_members (team_id, profile_id, role)
select '22222222-2222-2222-2222-222222222221',
       ('66666666-0000-0000-0000-0000000000' || lpad(g::text, 2, '0'))::uuid, 'JUGADOR'
from generate_series(1, 6) g;

-- Lista F5 válida: 5 titulares del roster nuevo.
create function pg_temp.gf_list() returns jsonb
language sql as $fn$
  select jsonb_agg(jsonb_build_object(
    'profile_id', '66666666-0000-0000-0000-0000000000' || lpad(g::text, 2, '0'),
    'lineup_role', 'TITULAR'))
  from generate_series(1, 5) g
$fn$;


-- ════════════════════════════════════════════════════════════════════════════
-- G1 — El radio vive en app_settings, no hardcodeado
-- ════════════════════════════════════════════════════════════════════════════
select is(
  (select value from app_settings where key = 'checkin_geofence_radius_m'),
  150::numeric,
  'G1-1: el radio por defecto sigue siendo 150 m'
);

select is(
  public.checkin_geofence_radius_m(),
  150::numeric,
  'G1-2: el helper devuelve el radio configurado'
);


-- ════════════════════════════════════════════════════════════════════════════
-- G2 — Sin coordenadas y con venue: rechazo (era el bypass)
-- ════════════════════════════════════════════════════════════════════════════
insert into matches (id, team_a_id, team_b_id, match_type, status, format, scheduled_at, venue_id, season_id)
values ('88888888-0000-0000-0000-000000000001',
        '22222222-2222-2222-2222-222222222221', '22222222-2222-2222-2222-222222222222',
        'RANKING', 'CONFIRMADO', 'FUTBOL_5', now(),
        '0e000000-0000-0000-0000-0000000000d3', (select id from seasons where is_active = true));

select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-000000000001"}', true);

select throws_matching(
  format($$ select public.submit_team_checkin(
       '88888888-0000-0000-0000-000000000001',
       '22222222-2222-2222-2222-222222222221',
       %L::jsonb, null, null) $$, pg_temp.gf_list()),
  'LOCATION_REQUIRED',
  'G2-1: omitir las coordenadas ya no saltea el geofence'
);

select is(
  (select checkin_team_a_at from matches where id = '88888888-0000-0000-0000-000000000001'),
  null,
  'G2-2: el check-in rechazado no dejó sello'
);


-- ════════════════════════════════════════════════════════════════════════════
-- G3 — Lejos del complejo: rechazo con distancia
-- ════════════════════════════════════════════════════════════════════════════
-- Obelisco (-34.60370 / -58.38160): ~5 km del venue de Palermo.
select throws_matching(
  format($$ select public.submit_team_checkin(
       '88888888-0000-0000-0000-000000000001',
       '22222222-2222-2222-2222-222222222221',
       %L::jsonb, -34.60370, -58.38160) $$, pg_temp.gf_list()),
  'GEOFENCE_FAILED',
  'G3-1: a ~5 km de la cancha el check-in se rechaza'
);


-- ════════════════════════════════════════════════════════════════════════════
-- G4 — Dentro del radio: pasa
-- ════════════════════════════════════════════════════════════════════════════
-- ~50 m del venue (0.0004° de latitud ≈ 44 m).
create temp table g4_res as select public.submit_team_checkin(
  '88888888-0000-0000-0000-000000000001',
  '22222222-2222-2222-2222-222222222221',
  pg_temp.gf_list(), -34.58240, -58.43000) as r;

select is(
  (select (r->>'starters')::int from g4_res),
  5,
  'G4-1: a ~50 m del complejo la lista se presenta'
);

select isnt(
  (select checkin_team_a_at from matches where id = '88888888-0000-0000-0000-000000000001'),
  null,
  'G4-2: el check-in válido sella el equipo'
);


-- ════════════════════════════════════════════════════════════════════════════
-- G5 — Un partido de RANKING no se confirma sin cancha del catálogo
-- ════════════════════════════════════════════════════════════════════════════
-- Sin este trigger, el endurecimiento de arriba se evade proponiendo sin venue:
-- venue_id queda NULL, el geofence no aplica y el check-in vuelve a ser libre.
insert into matches (id, team_a_id, team_b_id, match_type, status, format, scheduled_at, season_id)
values ('88888888-0000-0000-0000-000000000002',
        '22222222-2222-2222-2222-222222222221', '22222222-2222-2222-2222-222222222222',
        'RANKING', 'PENDIENTE', 'FUTBOL_5', now(), (select id from seasons where is_active = true));

select throws_matching(
  $$ update matches set status = 'CONFIRMADO'
     where id = '88888888-0000-0000-0000-000000000002' $$,
  'VENUE_REQUIRED',
  'G5-1: un RANKING sin venue no puede pasar a CONFIRMADO'
);

update matches set venue_id = '0e000000-0000-0000-0000-0000000000d3'
where id = '88888888-0000-0000-0000-000000000002';

select lives_ok(
  $$ update matches set status = 'CONFIRMADO'
     where id = '88888888-0000-0000-0000-000000000002' $$,
  'G5-2: con venue cargado, el mismo RANKING se confirma'
);

-- Amistoso sin venue: sigue siendo válido. No mueve ELO y puede jugarse en una
-- cancha no catalogada; ahí el check-in queda sin geofence a propósito.
insert into matches (id, team_a_id, team_b_id, match_type, status, format, scheduled_at, season_id)
values ('88888888-0000-0000-0000-000000000003',
        '22222222-2222-2222-2222-222222222221', '22222222-2222-2222-2222-222222222222',
        'AMISTOSO', 'PENDIENTE', 'FUTBOL_5', now(), (select id from seasons where is_active = true));

select lives_ok(
  $$ update matches set status = 'CONFIRMADO'
     where id = '88888888-0000-0000-0000-000000000003' $$,
  'G5-3: un AMISTOSO sin venue se confirma igual'
);

-- Un RANKING ya CONFIRMADO de antes (histórico con texto libre) sigue siendo
-- actualizable: el trigger sólo mira la transición hacia CONFIRMADO.
insert into matches (id, team_a_id, team_b_id, match_type, status, format, scheduled_at, season_id)
values ('88888888-0000-0000-0000-000000000004',
        '22222222-2222-2222-2222-222222222221', '22222222-2222-2222-2222-222222222222',
        'RANKING', 'CONFIRMADO', 'FUTBOL_5', now(), (select id from seasons where is_active = true));

select lives_ok(
  $$ update matches set status = 'EN_VIVO'
     where id = '88888888-0000-0000-0000-000000000004' $$,
  'G5-4: un RANKING histórico sin venue sigue avanzando de estado'
);

select * from finish();
rollback;
