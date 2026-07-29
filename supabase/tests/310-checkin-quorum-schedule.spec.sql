-- ============================================================
-- 310-checkin-quorum-schedule — D9 + D13 (pgTAP)
-- ============================================================
-- Cubre las dos migraciones del Bloque 7:
--
--   · 20260728220000 — checkin_team deja de sellar la presencia del EQUIPO con
--     el tap de una sola persona. El sello (`checkin_team_X_at`) es el input
--     que lee el WO automático de sweep_stale_matches, así que "quién puede
--     ponerlo" es una regla de integridad competitiva, no de UI.
--
--   · 20260728221000 — una propuesta no puede agendarse en el pasado ni sobre
--     una franja que alguno de los dos equipos ya tiene comprometida.
--
-- Aserciones:
--   Q-1..Q-3  un check-in solo NO presenta al equipo, pero SÍ registra la
--             llegada individual (los dos hechos que la RPC mezclaba).
--   Q-4..Q-6  alcanzado el quórum sella, informa `justSealed`, y un check-in
--             posterior no reescribe la hora de llegada del equipo.
--   Q-7       el check-in exige partido CONFIRMADO/EN_VIVO.
--   Q-8       sigue rechazando al no-miembro con el literal 'No autorizado'
--             (P1-4 de 100-rls-security depende de ese texto; la rama nueva de
--             invitados no podía aflojarlo).
--   Q-9..Q-11 propuesta con fecha pasada, propuesta solapada y propuesta en
--             franja libre.
--   Q-12      el detector de solapamiento excluye al propio partido — sin eso
--             ninguna propuesta podría confirmarse dos veces ni corregirse.
--
-- Equipos y partidos propios, aislados del seed. `format_rules` se baja a 2
-- titulares SÓLO dentro de esta transacción: así el quórum se alcanza con los
-- dos capitanes del seed y no hace falta fabricar planteles enteros. De paso
-- verifica que el umbral realmente sale del catálogo y no de una constante.
-- ============================================================

begin;
select plan(12);

-- ── Setup (postgres) ────────────────────────────────────────────────────────
insert into teams (id, name, category, zone, preferred_format) values
  ('51000000-0000-0000-0000-00000000000a', 'QRM_A', 'HOMBRES', 'ZQRM', 'FUTBOL_5'),
  ('51000000-0000-0000-0000-00000000000b', 'QRM_B', 'HOMBRES', 'ZQRM', 'FUTBOL_5'),
  ('51000000-0000-0000-0000-00000000000c', 'QRM_C', 'HOMBRES', 'ZQRM', 'FUTBOL_5');

-- Dos miembros en QRM_A: son los que van a alcanzar el quórum.
insert into team_members (team_id, profile_id, role) values
  ('51000000-0000-0000-0000-00000000000a', '33333333-3333-3333-3333-000000000001', 'CAPITAN'),
  ('51000000-0000-0000-0000-00000000000a', '33333333-3333-3333-3333-000000000004', 'JUGADOR');

-- Quórum de 2 para FUTBOL_5 mientras dure esta transacción.
update format_rules set min_players_to_start = 2 where format = 'FUTBOL_5';

-- mq1: el partido sobre el que se hace check-in.
insert into matches (id, team_a_id, team_b_id, status, match_type, format, scheduled_at) values
  ('5b000000-0000-0000-0000-0000000000f1', '51000000-0000-0000-0000-00000000000a',
   '51000000-0000-0000-0000-00000000000b', 'CONFIRMADO', 'AMISTOSO', 'FUTBOL_5',
   now() + interval '1 hour');

-- mq2: mismo par de equipos, todavía PENDIENTE → el check-in no corre.
insert into matches (id, team_a_id, team_b_id, status, match_type, scheduled_at) values
  ('5b000000-0000-0000-0000-0000000000f2', '51000000-0000-0000-0000-00000000000a',
   '51000000-0000-0000-0000-00000000000b', 'PENDIENTE', 'AMISTOSO', now() + interval '3 days');

-- mq3: partido PENDIENTE de QRM_A contra un tercero, para probar el agendado.
insert into matches (id, team_a_id, team_b_id, status, match_type, scheduled_at) values
  ('5b000000-0000-0000-0000-0000000000f3', '51000000-0000-0000-0000-00000000000a',
   '51000000-0000-0000-0000-00000000000c', 'PENDIENTE', 'AMISTOSO', now() + interval '10 days');


-- ── Q-1..Q-3. Un jugador solo NO presenta al equipo ─────────────────────────
select tests.authenticate_as_profile('aaaaaaaa-0000-0000-0000-000000000001');

select is(
  (select public.checkin_team(
     '5b000000-0000-0000-0000-0000000000f1',
     '51000000-0000-0000-0000-00000000000a', null, null)->>'teamSealed'),
  'false',
  'Q-1: el primer check-in no da por presentado al equipo');

select tests.clear_auth();

select ok(
  (select checkin_team_a_at is null from matches where id = '5b000000-0000-0000-0000-0000000000f1'),
  'Q-2: el sello que lee el WO automático sigue vacío con un solo jugador');

select is(
  (select count(*)::int from match_participants
    where match_id = '5b000000-0000-0000-0000-0000000000f1'
      and team_id  = '51000000-0000-0000-0000-00000000000a'
      and did_checkin),
  1,
  'Q-3: la llegada individual sí quedó registrada');


-- ── Q-4..Q-6. El quórum sella, y sella una sola vez ─────────────────────────
select tests.authenticate_as_profile('aaaaaaaa-0000-0000-0000-000000000004');

select is(
  (select public.checkin_team(
     '5b000000-0000-0000-0000-0000000000f1',
     '51000000-0000-0000-0000-00000000000a', null, null)->>'justSealed'),
  'true',
  'Q-4: el check-in que completa el quórum presenta al equipo');

select tests.clear_auth();

select ok(
  (select checkin_team_a_at is not null from matches where id = '5b000000-0000-0000-0000-0000000000f1'),
  'Q-5: con quórum, el sello del equipo queda puesto');

-- Un tercer check-in (o el mismo jugador de nuevo) no puede mover la hora de
-- llegada del equipo: es la evidencia con la que se resuelve un WO.
create temp table qrm_seal on commit drop as
  select checkin_team_a_at as ts from matches where id = '5b000000-0000-0000-0000-0000000000f1';

select tests.authenticate_as_profile('aaaaaaaa-0000-0000-0000-000000000001');
select public.checkin_team('5b000000-0000-0000-0000-0000000000f1',
                           '51000000-0000-0000-0000-00000000000a', null, null);
select tests.clear_auth();

select is(
  (select checkin_team_a_at from matches where id = '5b000000-0000-0000-0000-0000000000f1'),
  (select ts from qrm_seal),
  'Q-6: un check-in posterior no reescribe la hora de presentación del equipo');


-- ── Q-7. Guarda de estado ───────────────────────────────────────────────────
select tests.authenticate_as_profile('aaaaaaaa-0000-0000-0000-000000000001');

select throws_matching(
  $$ select public.checkin_team(
       '5b000000-0000-0000-0000-0000000000f2',
       '51000000-0000-0000-0000-00000000000a', null, null) $$,
  'INVALID_MATCH_STATUS',
  'Q-7: no se hace check-in sobre un partido que todavía está PENDIENTE');


-- ── Q-8. El no-miembro sigue rebotando con el literal de P1-4 ───────────────
select tests.authenticate_as_profile('aaaaaaaa-0000-0000-0000-000000000007');

select throws_matching(
  $$ select public.checkin_team(
       '5b000000-0000-0000-0000-0000000000f1',
       '51000000-0000-0000-0000-00000000000a', null, null) $$,
  'No autorizado',
  'Q-8: la rama nueva de invitados no abrió la puerta a un ajeno al equipo');

select tests.clear_auth();


-- ── Q-9..Q-11. Agendado de propuestas (D13) ────────────────────────────────
select throws_matching(
  $$ insert into match_proposals (match_id, proposed_by, from_team_id, format,
                                  match_type, scheduled_at, duration_minutes)
     values ('5b000000-0000-0000-0000-0000000000f3',
             '33333333-3333-3333-3333-000000000001',
             '51000000-0000-0000-0000-00000000000a',
             'FUTBOL_5', 'AMISTOSO', now() - interval '1 hour', 60) $$,
  'PROPOSAL_DATE_IN_PAST',
  'Q-9: no se propone un partido para una fecha que ya pasó');

-- mq1 está CONFIRMADO dentro de una hora y dura 60 minutos por defecto: una
-- propuesta de QRM_A para esa misma franja choca con su propio compromiso.
select throws_matching(
  $$ insert into match_proposals (match_id, proposed_by, from_team_id, format,
                                  match_type, scheduled_at, duration_minutes)
     values ('5b000000-0000-0000-0000-0000000000f3',
             '33333333-3333-3333-3333-000000000001',
             '51000000-0000-0000-0000-00000000000a',
             'FUTBOL_5', 'AMISTOSO', now() + interval '1 hour', 60) $$,
  'TEAM_SCHEDULE_CONFLICT',
  'Q-10: no se propone sobre una franja que el equipo ya tiene comprometida');

select lives_ok(
  $$ insert into match_proposals (match_id, proposed_by, from_team_id, format,
                                  match_type, scheduled_at, duration_minutes)
     values ('5b000000-0000-0000-0000-0000000000f3',
             '33333333-3333-3333-3333-000000000001',
             '51000000-0000-0000-0000-00000000000a',
             'FUTBOL_5', 'AMISTOSO', now() + interval '20 days', 60) $$,
  'Q-11: una franja libre y futura se propone sin problemas');


-- ── Q-12. El propio partido no cuenta como conflicto ───────────────────────
-- Sin esta exclusión, mq1 chocaría consigo mismo y ninguna propuesta de un
-- partido ya confirmado podría corregirse jamás.
select ok(
  public.match_schedule_conflict(
    '5b000000-0000-0000-0000-0000000000f1',
    array['51000000-0000-0000-0000-00000000000a'::uuid,
          '51000000-0000-0000-0000-00000000000b'::uuid],
    now() + interval '1 hour',
    60) is null,
  'Q-12: el detector de solapamiento excluye al partido que se está agendando');

select * from finish();
rollback;
