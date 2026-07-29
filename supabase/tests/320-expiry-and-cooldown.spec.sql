-- ============================================================
-- 320-expiry-and-cooldown — E7 + E8 + E9 (pgTAP)
-- ============================================================
-- Cubre las tres migraciones del Bloque 8:
--
--   · 20260729120000 (E7) — el `unique_code` de invitado deja de valer para
--     siempre. `join_match_as_guest` rechaza con GUEST_CODE_EXPIRED pasada la
--     ventana `app_settings.guest_code_ttl_hours` desde la hora del partido.
--
--   · 20260729121000 (E8) — `sweep_stale_matches()` gana una cuarta rama: los
--     desafíos `ENVIADA` sin responder caducan y liberan el emparejamiento
--     entre los dos equipos, que hasta ahora quedaba congelado para siempre por
--     `uq_challenges_active_pair`.
--
--   · 20260729122000 (E9) — el cooldown de 30 días de `send_challenge` se mide
--     sobre cuándo se JUGÓ el partido, no sobre cuándo se creó la fila.
--
-- Aserciones:
--   E-1/E-2  la ventana de validez del código: ancla en `scheduled_at`, con
--            `created_at` de respaldo para el partido que nunca se coordinó.
--   E-3/E-4  la RPC rechaza el código vencido y sigue aceptando el vigente.
--   E-5/E-6  el barrido caduca el desafío viejo y no toca el reciente.
--   E-7      caducado el desafío, los dos equipos pueden volver a desafiarse
--            (el bloqueo de E8 era justamente que no podían).
--   E-8      un partido CREADO hace 40 días pero JUGADO ayer ahora dispara el
--            cooldown. Con el filtro viejo (`created_at`) pasaba de largo:
--            es el agujero exacto de E9.
--   E-9      un partido creado Y jugado hace 40 días no bloquea nada.
--
-- Equipos y partidos propios, aislados del seed. El orden importa: las
-- aserciones de E7 corren ANTES del barrido, porque el partido vencido que usa
-- E-3 es también material del que el barrido se lleva puesto.
-- ============================================================

begin;
select plan(9);

-- ── Setup (postgres) ────────────────────────────────────────────────────────
insert into teams (id, name, category, zone, preferred_format) values
  ('52000000-0000-0000-0000-00000000000a', 'EXP_A', 'HOMBRES', 'ZEXP', 'FUTBOL_5'),
  ('52000000-0000-0000-0000-00000000000b', 'EXP_B', 'HOMBRES', 'ZEXP', 'FUTBOL_5'),
  ('52000000-0000-0000-0000-00000000000c', 'EXP_C', 'HOMBRES', 'ZEXP', 'FUTBOL_5'),
  ('52000000-0000-0000-0000-00000000000d', 'EXP_D', 'HOMBRES', 'ZEXP', 'FUTBOL_5'),
  ('52000000-0000-0000-0000-00000000000e', 'EXP_E', 'HOMBRES', 'ZEXP', 'FUTBOL_5');

-- El capitán que va a enviar los desafíos. Un solo jugador compartido como
-- máximo: con 2 saltaría el anti-farming del bloque 4a y no llegaríamos a
-- probar el cooldown.
insert into team_members (team_id, profile_id, role) values
  ('52000000-0000-0000-0000-00000000000a', '33333333-3333-3333-3333-000000000001', 'CAPITAN');

-- mx1: CONFIRMADO que se jugó hace 5 días → el código ya venció (48 h).
insert into matches (id, team_a_id, team_b_id, status, match_type, format, scheduled_at, unique_code) values
  ('5c000000-0000-0000-0000-0000000000f1', '52000000-0000-0000-0000-00000000000a',
   '52000000-0000-0000-0000-00000000000b', 'CONFIRMADO', 'AMISTOSO', 'FUTBOL_5',
   now() - interval '5 days', 'EXPOLD');

-- mx2: CONFIRMADO que arranca en una hora → código vigente.
insert into matches (id, team_a_id, team_b_id, status, match_type, format, scheduled_at, unique_code) values
  ('5c000000-0000-0000-0000-0000000000f2', '52000000-0000-0000-0000-00000000000a',
   '52000000-0000-0000-0000-00000000000b', 'CONFIRMADO', 'AMISTOSO', 'FUTBOL_5',
   now() + interval '1 hour', 'EXPNEW');


-- ── E-1/E-2. La ventana de validez ──────────────────────────────────────────
select ok(
  public.match_guest_code_expires_at(
    '2026-08-01 20:00:00+00'::timestamptz,
    '2026-07-01 10:00:00+00'::timestamptz
  ) = '2026-08-03 20:00:00+00'::timestamptz,
  'E-1: el código vence 48 h después del horario pactado, no de la creación');

-- El partido que nunca se coordinó es el caso del código eterno que describe
-- E7: sin fecha, el ancla pasa a ser la creación.
select ok(
  public.match_guest_code_expires_at(
    null,
    '2026-07-01 10:00:00+00'::timestamptz
  ) = '2026-07-03 10:00:00+00'::timestamptz,
  'E-2: sin fecha pactada, la ventana se cuenta desde la creación del partido');


-- ── E-3/E-4. La guarda en la RPC ────────────────────────────────────────────
-- Un invitado es, por definición, alguien ajeno a los dos equipos.
select tests.authenticate_as_profile('aaaaaaaa-0000-0000-0000-000000000007');

select throws_matching(
  $$ select public.join_match_as_guest('EXPOLD', 'A') $$,
  'GUEST_CODE_EXPIRED',
  'E-3: el código de un partido de hace 5 días ya no admite invitados');

select isnt(
  (select public.join_match_as_guest('EXPNEW', 'A')->>'matchId'),
  null,
  'E-4: el código de un partido que todavía no se jugó sigue funcionando');

select tests.clear_auth();


-- ── E-5/E-6. Caducidad de desafíos (E8) ─────────────────────────────────────
insert into challenges (id, from_team_id, to_team_id, created_by, match_type, status, created_at) values
  ('5d000000-0000-0000-0000-0000000000f1', '52000000-0000-0000-0000-00000000000a',
   '52000000-0000-0000-0000-00000000000b', '33333333-3333-3333-3333-000000000001',
   'AMISTOSO', 'ENVIADA', now() - interval '20 days'),
  -- Contra EXP_E a propósito: si este desafío vivo fuera contra EXP_C, la
  -- guarda de "ya hay un desafío activo" cortaría antes que el cooldown y E-8
  -- estaría probando otra cosa.
  ('5d000000-0000-0000-0000-0000000000f2', '52000000-0000-0000-0000-00000000000a',
   '52000000-0000-0000-0000-00000000000e', '33333333-3333-3333-3333-000000000001',
   'AMISTOSO', 'ENVIADA', now() - interval '2 days');

select public.sweep_stale_matches();

select results_eq(
  $$ select status::text from challenges where id = '5d000000-0000-0000-0000-0000000000f1' $$,
  array['RECHAZADA'],
  'E-5: un desafío ENVIADA de 20 días se rechaza solo');

select results_eq(
  $$ select status::text from challenges where id = '5d000000-0000-0000-0000-0000000000f2' $$,
  array['ENVIADA'],
  'E-6: un desafío de 2 días sigue esperando respuesta');


-- ── E-7. El emparejamiento queda liberado ───────────────────────────────────
-- Éste es el daño concreto de E8: mientras el ENVIADA seguía vivo,
-- `uq_challenges_active_pair` impedía cualquier desafío nuevo entre el par.
select tests.authenticate_as_profile('aaaaaaaa-0000-0000-0000-000000000001');

select lives_ok(
  $$ select public.send_challenge(
       '52000000-0000-0000-0000-00000000000a',
       '52000000-0000-0000-0000-00000000000b',
       'AMISTOSO') $$,
  'E-7: caducado el desafío viejo, los dos equipos vuelven a poder desafiarse');

select tests.clear_auth();


-- ── E-8/E-9. Cooldown sobre la fecha de juego (E9) ──────────────────────────
-- mx3: creado hace 40 días, jugado AYER. Con el filtro viejo (created_at) este
-- partido quedaba fuera de la ventana y el cooldown no se aplicaba.
insert into matches (id, team_a_id, team_b_id, status, match_type, created_at, scheduled_at, finished_at) values
  ('5c000000-0000-0000-0000-0000000000f3', '52000000-0000-0000-0000-00000000000a',
   '52000000-0000-0000-0000-00000000000c', 'FINALIZADO', 'RANKING',
   now() - interval '40 days', now() - interval '1 day', now() - interval '1 day');

-- mx4: creado Y jugado hace 40 días. Fuera de la ventana por donde se lo mire.
insert into matches (id, team_a_id, team_b_id, status, match_type, created_at, scheduled_at, finished_at) values
  ('5c000000-0000-0000-0000-0000000000f4', '52000000-0000-0000-0000-00000000000a',
   '52000000-0000-0000-0000-00000000000d', 'FINALIZADO', 'RANKING',
   now() - interval '40 days', now() - interval '40 days', now() - interval '40 days');

select tests.authenticate_as_profile('aaaaaaaa-0000-0000-0000-000000000001');

select throws_matching(
  $$ select public.send_challenge(
       '52000000-0000-0000-0000-00000000000a',
       '52000000-0000-0000-0000-00000000000c',
       'RANKING') $$,
  'Deben pasar 30 días',
  'E-8: un partido creado hace 40 días pero jugado ayer sí dispara el cooldown');

select lives_ok(
  $$ select public.send_challenge(
       '52000000-0000-0000-0000-00000000000a',
       '52000000-0000-0000-0000-00000000000d',
       'RANKING') $$,
  'E-9: un partido jugado hace 40 días no bloquea un desafío nuevo');

select tests.clear_auth();

select * from finish();
rollback;
