-- ============================================================
-- 360-guest-match-detail-access — El invitado por código puede LEER el partido
-- ============================================================
-- Cubre la migración 20260804120000, que arregla el circuito partido en dos:
-- `join_match_as_guest` dejaba entrar al invitado (fila en `match_participants`
-- con `is_guest = true`, sin membresía) pero `get_match_detail` autorizaba sólo
-- contra `team_members`, así que la pantalla de detalle moría con
-- "No autorizado: no sos miembro de este equipo" inmediatamente después de un
-- canje exitoso.
--
-- La aserción central es G-3: el mismo usuario, el mismo partido, el mismo
-- teamId — falla antes de canjear el código y funciona después. Eso es lo que
-- prueba que la credencial que habilita la lectura es el código y no otra cosa.
--
-- Ramas verificadas:
--   G-1      RLS no era el problema: el ajeno ya podía hacer SELECT sobre
--            `matches` (matches_select_all es `using (true)`). Se fija como
--            contrato para que un futuro endurecimiento de la policy no rompa
--            al invitado por la puerta de atrás.
--   G-2      Sin canjear el código, el ajeno NO lee el detalle.
--   G-3      Canjeado el código, el MISMO usuario SÍ lee el detalle.
--   G-4      El payload que recibe es el del partido pedido (no un objeto vacío).
--   G-5      El invitado aparece en `team_roster` marcado como invitado.
--   G-6      `my_role` es NULL: entrar al partido no lo afilia al club.
--   G-7      Alcance por equipo: el invitado del equipo A no puede pedir el
--            detalle desde la vista del equipo B.
--   G-8      Alcance por partido: ser invitado del partido 1 no da lectura
--            sobre el partido 2, aunque lo jueguen los mismos equipos.
--   G-9      No regresión: el miembro del equipo sigue leyendo su partido.
--   G-10     Integración con E7 (20260729120000): con el código vencido no hay
--            canje, y sin canje no hay lectura. La caducidad sigue mandando.
--
-- Equipos y partidos propios, aislados del seed.
-- ============================================================

begin;
select plan(11);

-- ── Setup (postgres) ────────────────────────────────────────────────────────
insert into teams (id, name, category, zone, preferred_format) values
  ('62000000-0000-0000-0000-00000000000a', 'GUEST_A', 'HOMBRES', 'ZGST', 'FUTBOL_5'),
  ('62000000-0000-0000-0000-00000000000b', 'GUEST_B', 'HOMBRES', 'ZGST', 'FUTBOL_5');

-- Un miembro real del equipo A, para la aserción de no regresión (G-9).
insert into team_members (team_id, profile_id, role) values
  ('62000000-0000-0000-0000-00000000000a', '33333333-3333-3333-3333-000000000001', 'CAPITAN');

-- mx1: el partido al que entra el invitado. Vigente (arranca en una hora), así
-- que el código admite canje.
insert into matches (id, team_a_id, team_b_id, status, match_type, format, scheduled_at, unique_code) values
  ('6c000000-0000-0000-0000-0000000000f1', '62000000-0000-0000-0000-00000000000a',
   '62000000-0000-0000-0000-00000000000b', 'CONFIRMADO', 'AMISTOSO', 'FUTBOL_5',
   now() + interval '1 hour', 'GSTOK1');

-- mx2: mismos dos equipos, otro partido. Material de G-8: si el fix autorizara
-- por "sos invitado en algún lado" en vez de por (partido, equipo, perfil),
-- este partido se filtraría.
insert into matches (id, team_a_id, team_b_id, status, match_type, format, scheduled_at, unique_code) values
  ('6c000000-0000-0000-0000-0000000000f2', '62000000-0000-0000-0000-00000000000a',
   '62000000-0000-0000-0000-00000000000b', 'CONFIRMADO', 'AMISTOSO', 'FUTBOL_5',
   now() + interval '2 hours', 'GSTOK2');

-- mx3: jugado hace 5 días → código vencido por E7. Material de G-10.
insert into matches (id, team_a_id, team_b_id, status, match_type, format, scheduled_at, unique_code) values
  ('6c000000-0000-0000-0000-0000000000f3', '62000000-0000-0000-0000-00000000000a',
   '62000000-0000-0000-0000-00000000000b', 'CONFIRMADO', 'AMISTOSO', 'FUTBOL_5',
   now() - interval '5 days', 'GSTOLD');


-- ── El invitado: cap.rayos, ajeno a los dos equipos ─────────────────────────
select tests.authenticate_as_profile('aaaaaaaa-0000-0000-0000-000000000007');

-- ── G-1. RLS nunca fue el bloqueo ───────────────────────────────────────────
-- Si esta aserción se pone roja, el fix de la RPC deja de alcanzar y hay que
-- volver a mirar las policies de `matches`.
select results_eq(
  $$ select count(*)::int from matches where id = '6c000000-0000-0000-0000-0000000000f1' $$,
  array[1],
  'G-1: RLS deja al ajeno hacer SELECT sobre matches — el bloqueo estaba en la RPC');

-- ── G-2. Antes del canje: sin acceso ────────────────────────────────────────
select throws_matching(
  $$ select public.get_match_detail(
       '6c000000-0000-0000-0000-0000000000f1', '62000000-0000-0000-0000-00000000000a') $$,
  'No autorizado',
  'G-2: sin canjear el código, un ajeno no puede leer el detalle del partido');

-- ── El canje ────────────────────────────────────────────────────────────────
select isnt(
  (select public.join_match_as_guest('GSTOK1', 'A')->>'matchId'),
  null,
  'G-0 (setup): el canje del código vigente entra por el equipo A');

-- ── G-3. Después del canje: acceso ──────────────────────────────────────────
-- La aserción del bug: mismo usuario, mismo partido, mismo teamId que G-2.
select lives_ok(
  $$ select public.get_match_detail(
       '6c000000-0000-0000-0000-0000000000f1', '62000000-0000-0000-0000-00000000000a') $$,
  'G-3: con el código canjeado, el invitado lee el detalle sin que lo frene la autorización');

-- ── G-4. El payload es el partido pedido ────────────────────────────────────
-- `lives_ok` sola no alcanza: la función podría devolver NULL sin lanzar y la
-- pantalla mostraría "Partido no encontrado", que para el usuario es el mismo
-- callejón sin salida.
select is(
  (select public.get_match_detail(
     '6c000000-0000-0000-0000-0000000000f1', '62000000-0000-0000-0000-00000000000a')->>'id'),
  '6c000000-0000-0000-0000-0000000000f1',
  'G-4: el invitado recibe el detalle del partido que pidió, no un payload vacío');

-- ── G-5. Se ve a sí mismo en el plantel ─────────────────────────────────────
select is(
  (select r->>'is_guest'
   from json_array_elements(
     public.get_match_detail(
       '6c000000-0000-0000-0000-0000000000f1', '62000000-0000-0000-0000-00000000000a')->'team_roster'
   ) r
   where r->>'profile_id' = '33333333-3333-3333-3333-000000000007'),
  'true',
  'G-5: el invitado figura en team_roster marcado como invitado');

-- ── G-6. Leer no es afiliarse ───────────────────────────────────────────────
select is(
  (select public.get_match_detail(
     '6c000000-0000-0000-0000-0000000000f1', '62000000-0000-0000-0000-00000000000a')->>'my_role'),
  null,
  'G-6: el invitado no gana rol en el club — my_role sigue en NULL');

-- ── G-7. Alcance por equipo ─────────────────────────────────────────────────
-- Entró por el lado A; el detalle desde la vista del rival no es suyo.
select throws_matching(
  $$ select public.get_match_detail(
       '6c000000-0000-0000-0000-0000000000f1', '62000000-0000-0000-0000-00000000000b') $$,
  'No autorizado',
  'G-7: el invitado del equipo A no puede pedir el detalle desde la vista del equipo B');

-- ── G-8. Alcance por partido ────────────────────────────────────────────────
select throws_matching(
  $$ select public.get_match_detail(
       '6c000000-0000-0000-0000-0000000000f2', '62000000-0000-0000-0000-00000000000a') $$,
  'No autorizado',
  'G-8: ser invitado de un partido no da lectura sobre otro partido de los mismos equipos');

-- ── G-10. La caducidad sigue mandando ───────────────────────────────────────
-- El fix amplía a quién reconoce la RPC, no de dónde sale la credencial: sin
-- canje posible no hay fila en match_participants y el acceso sigue cerrado.
select throws_matching(
  $$ select public.join_match_as_guest('GSTOLD', 'A') $$,
  'GUEST_CODE_EXPIRED',
  'G-10: con el código vencido no hay canje — y sin canje el detalle sigue cerrado');

select tests.clear_auth();


-- ── G-9. No regresión: el miembro del equipo ────────────────────────────────
select tests.authenticate_as_profile('aaaaaaaa-0000-0000-0000-000000000001');

select is(
  (select public.get_match_detail(
     '6c000000-0000-0000-0000-0000000000f1', '62000000-0000-0000-0000-00000000000a')->>'id'),
  '6c000000-0000-0000-0000-0000000000f1',
  'G-9: el capitán del equipo sigue leyendo el detalle de su partido');

select tests.clear_auth();

select * from finish();
rollback;
