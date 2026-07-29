-- ============================================================
-- 330-dt-permissions-quorum-fps — R6 + E5 (pgTAP)
-- ============================================================
-- Cubre las dos migraciones del Bloque 9, que cierran las dos últimas
-- decisiones de producto del reporte:
--
--   · 20260730120000 (R6) — `DIRECTOR_TECNICO` recibe permisos operativos del
--     día del partido: presentar la lista (`submit_team_checkin`) y cargar el
--     resultado (policy INSERT de `match_results`). Y **ninguno** de gestión
--     del club.
--
--   · 20260730121000 (E5) — la multa de Fair Play por un WO en contra deja de
--     ser una constante: depende del motivo registrado en `wo_claims.reason`.
--
-- Aserciones:
--   T-1      un DT presenta la lista de buena fe (antes: NOT_TEAM_ADMIN).
--   T-2      un JUGADOR sigue rebotando con el mismo literal.
--   T-3      un DT carga el resultado de su equipo.
--   T-4      un JUGADOR sin check-in no puede cargarlo — la policy no se
--            aflojó de más al agregar el rol.
--   T-5      el DT NO puede tocar el plantel: la policy de `team_members`
--            sigue siendo de la conducción. Es la mitad del fix que nadie ve.
--   Q-1..Q-3 la escala: FALTA_QUORUM = 5, NO_PRESENTACION = 15, sin reclamo
--            (WO automático del barrido) = 15.
--   Q-4/Q-5  el Fair Play resultante de un WO por quórum vs. por ausencia.
--
-- Equipos y partidos propios, aislados del seed. Los equipos arrancan con
-- fair_play_score = 100 y sin historial, así que las aserciones de FPS son
-- deterministas: 100 − multa.
-- ============================================================

begin;
select plan(10);

-- ── Setup (postgres) ────────────────────────────────────────────────────────
insert into teams (id, name, category, zone, preferred_format) values
  ('53000000-0000-0000-0000-00000000000a', 'DT_A', 'HOMBRES', 'ZDT', 'FUTBOL_5'),
  ('53000000-0000-0000-0000-00000000000b', 'DT_B', 'HOMBRES', 'ZDT', 'FUTBOL_5'),
  ('53000000-0000-0000-0000-00000000000c', 'DT_C', 'HOMBRES', 'ZDT', 'FUTBOL_5'),
  ('53000000-0000-0000-0000-00000000000d', 'DT_D', 'HOMBRES', 'ZDT', 'FUTBOL_5');

-- El perfil ...0001 es el DIRECTOR TÉCNICO de DT_A; el ...0004, un JUGADOR.
-- Los dos son miembros: lo único que los separa es el rol.
insert into team_members (team_id, profile_id, role) values
  ('53000000-0000-0000-0000-00000000000a', '33333333-3333-3333-3333-000000000001', 'DIRECTOR_TECNICO'),
  ('53000000-0000-0000-0000-00000000000a', '33333333-3333-3333-3333-000000000004', 'JUGADOR'),
  ('53000000-0000-0000-0000-00000000000a', '33333333-3333-3333-3333-000000000007', 'JUGADOR');

-- Quórum de 2 para FUTBOL_5 mientras dure esta transacción (mismo recurso que
-- 310): así la lista se presenta con dos jugadores y no hace falta fabricar
-- planteles enteros.
update format_rules set min_players_to_start = 2 where format = 'FUTBOL_5';

-- md1: CONFIRMADO y sin venue → sin geofence que interfiera.
insert into matches (id, team_a_id, team_b_id, status, match_type, format, scheduled_at) values
  ('5e000000-0000-0000-0000-0000000000f1', '53000000-0000-0000-0000-00000000000a',
   '53000000-0000-0000-0000-00000000000b', 'CONFIRMADO', 'AMISTOSO', 'FUTBOL_5',
   now() + interval '1 hour');

-- md2 y md3: EN_VIVO, para la carga de resultado. Dos partidos y no uno porque
-- `match_results` tiene unique(match_id, team_id): si el JUGADOR de T-4
-- intentara sobre el mismo partido que el DT de T-3, rebotaría con 23505
-- (duplicado) y el test estaría verde sin haber probado la policy.
insert into matches (id, team_a_id, team_b_id, status, match_type, format, scheduled_at, started_at) values
  ('5e000000-0000-0000-0000-0000000000f2', '53000000-0000-0000-0000-00000000000a',
   '53000000-0000-0000-0000-00000000000b', 'EN_VIVO', 'AMISTOSO', 'FUTBOL_5',
   now() - interval '1 hour', now() - interval '1 hour'),
  ('5e000000-0000-0000-0000-0000000000f5', '53000000-0000-0000-0000-00000000000a',
   '53000000-0000-0000-0000-00000000000b', 'EN_VIVO', 'AMISTOSO', 'FUTBOL_5',
   now() - interval '1 hour', now() - interval '1 hour');


-- ── T-1. El DT presenta la lista ────────────────────────────────────────────
select tests.authenticate_as_profile('aaaaaaaa-0000-0000-0000-000000000001');

select is(
  (select public.submit_team_checkin(
     '5e000000-0000-0000-0000-0000000000f1',
     '53000000-0000-0000-0000-00000000000a',
     '[{"profile_id":"33333333-3333-3333-3333-000000000004","lineup_role":"TITULAR"},
       {"profile_id":"33333333-3333-3333-3333-000000000007","lineup_role":"TITULAR"}]'::jsonb,
     null, null)->>'total'),
  '2',
  'T-1: el DIRECTOR_TECNICO presenta la lista de buena fe');

select tests.clear_auth();


-- ── T-2. Un JUGADOR sigue afuera ────────────────────────────────────────────
-- El literal `NOT_TEAM_ADMIN` se conservó a propósito: lib/checkin-data.ts
-- mapea ese prefijo. Ampliar el rol no podía cambiar el código de error.
select tests.authenticate_as_profile('aaaaaaaa-0000-0000-0000-000000000004');

select throws_matching(
  $$ select public.submit_team_checkin(
       '5e000000-0000-0000-0000-0000000000f1',
       '53000000-0000-0000-0000-00000000000a',
       '[{"profile_id":"33333333-3333-3333-3333-000000000004","lineup_role":"TITULAR"},
         {"profile_id":"33333333-3333-3333-3333-000000000007","lineup_role":"TITULAR"}]'::jsonb,
       null, null) $$,
  'NOT_TEAM_ADMIN',
  'T-2: un JUGADOR sigue sin poder presentar la lista');

select tests.clear_auth();


-- ── T-3/T-4. Carga de resultado (policy de match_results) ───────────────────
select tests.authenticate_as_profile('aaaaaaaa-0000-0000-0000-000000000001');

select lives_ok(
  $$ insert into match_results (match_id, team_id, submitted_by, goals_scored, goals_against)
     values ('5e000000-0000-0000-0000-0000000000f2',
             '53000000-0000-0000-0000-00000000000a',
             '33333333-3333-3333-3333-000000000001', 2, 1) $$,
  'T-3: el DIRECTOR_TECNICO carga el resultado de su equipo');

select tests.clear_auth();

-- El jugador ...0007 es miembro de DT_A pero no hizo check-in en md3 (la lista
-- se presentó en md1), así que no es is_result_loader ahí. Mismo equipo que el
-- DT de T-3: lo único que cambia entre los dos casos es el ROL.
select tests.authenticate_as_profile('aaaaaaaa-0000-0000-0000-000000000007');

-- `throws_ok(sql, errcode, errmsg, description)`: con SÓLO tres argumentos
-- pgTAP interpreta el segundo como el MENSAJE esperado, no como el SQLSTATE.
-- Por eso hace falta la firma de cuatro, con `null` en el mensaje (el texto de
-- la violación de RLS lo compone Postgres y no vale la pena fijarlo).
select throws_ok(
  $$ insert into match_results (match_id, team_id, submitted_by, goals_scored, goals_against)
     values ('5e000000-0000-0000-0000-0000000000f5',
             '53000000-0000-0000-0000-00000000000a',
             '33333333-3333-3333-3333-000000000007', 1, 2) $$,
  '42501',
  null,
  'T-4: agregar el rol al policy no abrió la puerta a un JUGADOR sin check-in');

select tests.clear_auth();


-- ── T-5. El DT no administra el plantel ─────────────────────────────────────
-- La otra mitad de la decisión de producto. Nada en la migración de R6 toca
-- team_members; este test existe para que siga siendo así.
select tests.authenticate_as_profile('aaaaaaaa-0000-0000-0000-000000000001');

-- El `WITH ... UPDATE` tiene que estar en el nivel superior de la sentencia:
-- Postgres rechaza un CTE que modifica datos dentro de un subquery. Por eso el
-- intento se materializa primero en una tabla temporal y la aserción mira esa
-- tabla — no un subquery con el UPDATE adentro.
create temp table dt_promote_attempt on commit drop as
  with attempt as (
    update team_members set role = 'CAPITAN'
    where team_id = '53000000-0000-0000-0000-00000000000a'
      and profile_id = '33333333-3333-3333-3333-000000000004'
    returning 1 as touched
  )
  select touched from attempt;

select is(
  (select count(*)::int from dt_promote_attempt),
  0,
  'T-5: el DT no puede promover a nadie — RLS no le deja tocar team_members');

select tests.clear_auth();


-- ── Q-1..Q-3. La escala de multas por motivo ────────────────────────────────
select is(
  public.fair_play_absence_penalty('FALTA_QUORUM'), 5::numeric,
  'Q-1: avisar que no se junta gente cuesta 5 puntos de Fair Play');

select is(
  public.fair_play_absence_penalty('NO_PRESENTACION'), 15::numeric,
  'Q-2: no presentarse sigue costando 15');

-- El WO automático de sweep_stale_matches no crea wo_claims: nadie declaró un
-- motivo porque el equipo no apareció ni avisó. La rama severa es la correcta.
select is(
  public.fair_play_absence_penalty(null), 15::numeric,
  'Q-3: sin reclamo (WO automático del barrido) la multa es la severa');


-- ── Q-4/Q-5. El Fair Play resultante ────────────────────────────────────────
-- mq1: DT_C pierde por WO con motivo FALTA_QUORUM.
insert into matches (id, team_a_id, team_b_id, status, match_type, scheduled_at) values
  ('5e000000-0000-0000-0000-0000000000f3', '53000000-0000-0000-0000-00000000000b',
   '53000000-0000-0000-0000-00000000000c', 'WO_A', 'AMISTOSO', now() - interval '2 days');

insert into wo_claims (match_id, claimed_by, claiming_team_id, photo_url, reason, status)
values ('5e000000-0000-0000-0000-0000000000f3',
        '33333333-3333-3333-3333-000000000004', '53000000-0000-0000-0000-00000000000b',
        'wo_evidences/quorum.jpg', 'FALTA_QUORUM', 'APROBADO');

-- mq2: DT_D pierde por WO con motivo NO_PRESENTACION.
insert into matches (id, team_a_id, team_b_id, status, match_type, scheduled_at) values
  ('5e000000-0000-0000-0000-0000000000f4', '53000000-0000-0000-0000-00000000000b',
   '53000000-0000-0000-0000-00000000000d', 'WO_A', 'AMISTOSO', now() - interval '2 days');

insert into wo_claims (match_id, claimed_by, claiming_team_id, photo_url, reason, status)
values ('5e000000-0000-0000-0000-0000000000f4',
        '33333333-3333-3333-3333-000000000004', '53000000-0000-0000-0000-00000000000b',
        'wo_evidences/ausente.jpg', 'NO_PRESENTACION', 'APROBADO');

select public.recalculate_team_fps('53000000-0000-0000-0000-00000000000c');
select public.recalculate_team_fps('53000000-0000-0000-0000-00000000000d');

select is(
  (select fair_play_score from teams where id = '53000000-0000-0000-0000-00000000000c'),
  95::numeric,
  'Q-4: el equipo que avisó queda en 95');

select is(
  (select fair_play_score from teams where id = '53000000-0000-0000-0000-00000000000d'),
  85::numeric,
  'Q-5: el equipo que no se presentó queda en 85');

select * from finish();
rollback;
