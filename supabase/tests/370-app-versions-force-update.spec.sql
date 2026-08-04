-- ============================================================
-- 370-app-versions-force-update — La palanca de emergencia (pgTAP)
-- ============================================================
-- Cubre `public.app_versions` (migración 20260804122000), la tabla que permite
-- sacar de circulación un build publicado sin esperar a que cada usuario
-- actualice cuando se le ocurra.
--
-- Es la única tabla del esquema cuyo contenido puede dejar a TODOS los usuarios
-- afuera de la app, así que las aserciones se reparten entre las dos formas de
-- romperla:
--
--   · Que no se pueda leer → nadie se entera de que hay que actualizar, y peor,
--     el chequeo corre ANTES del login, así que la lectura tiene que funcionar
--     sin sesión (A-3).
--   · Que se pueda escribir cualquier cosa → un `min_required_version` mal
--     formado hace indecidible la comparación del cliente, y uno demasiado alto
--     escrito por un usuario cualquiera bloquearía a toda la base (A-4..A-8).
--
-- Aserciones:
--   A-1      Existen las filas de las dos plataformas.
--   A-2      Nacen inertes: el mínimo no bloquea a la versión actual.
--   A-3      `anon` puede leer — es el requisito del chequeo pre-login.
--   A-4      `authenticated` no puede escribir.
--   A-5      `anon` no puede escribir.
--   A-6      El CHECK rechaza una versión mal formada.
--   A-7      El CHECK rechaza una update_url que no sea https.
--   A-8      El CHECK rechaza una plataforma desconocida.
--   A-9      El trigger actualiza `updated_at` — es el único rastro de cuándo
--            se accionó la palanca.
-- ============================================================

begin;
select plan(9);

-- ── A-1/A-2. Datos por defecto ──────────────────────────────────────────────
select results_eq(
  $$ select platform from public.app_versions order by platform $$,
  array['android', 'ios'],
  'A-1: la tabla nace con la política de las dos plataformas');

-- '1.0.0' es la versión de app.json: la tabla se despliega sin bloquear a nadie.
-- Si esto se pusiera rojo, la migración estaría sacando de circulación al build
-- vigente en el mismo momento de aplicarse.
select is_empty(
  $$ select platform from public.app_versions
     where min_required_version <> '1.0.0' $$,
  'A-2: los mínimos por defecto no bloquean a la versión publicada');


-- ── A-3. Lectura sin sesión ─────────────────────────────────────────────────
-- El chequeo de versión corre antes del login. Si esta aserción se pone roja,
-- un usuario con la sesión vencida y el build bloqueado queda en un limbo: no
-- entra a la app y tampoco se entera de que tiene que actualizar.
set local role anon;

select results_eq(
  $$ select count(*)::int from public.app_versions $$,
  array[2],
  'A-3: anon puede leer la política — el chequeo corre antes del login');

-- ── A-5. anon no escribe ────────────────────────────────────────────────────
select throws_ok(
  $$ update public.app_versions set min_required_version = '99.0.0' where platform = 'android' $$,
  null,
  null,
  'A-5: anon no puede tocar la versión mínima');

reset role;


-- ── A-4. authenticated tampoco escribe ──────────────────────────────────────
select tests.authenticate_as_profile('aaaaaaaa-0000-0000-0000-000000000001');

select throws_ok(
  $$ update public.app_versions set min_required_version = '99.0.0' where platform = 'android' $$,
  null,
  null,
  'A-4: un usuario autenticado no puede bloquear la app para todos');

select tests.clear_auth();


-- ── A-6/A-7/A-8. Las guardas de formato ─────────────────────────────────────
select throws_ok(
  $$ insert into public.app_versions (platform, min_required_version, latest_version, update_url)
     values ('android', '1..0', '1.0.0', 'https://example.com') $$,
  '23514',   -- check_violation
  null,
  'A-6: una versión mal formada no entra — haría indecidible la comparación del cliente');

select throws_ok(
  $$ update public.app_versions set update_url = 'http://inseguro.example.com'
     where platform = 'android' $$,
  '23514',
  null,
  'A-7: la url de actualización tiene que ser https');

select throws_ok(
  $$ insert into public.app_versions (platform, min_required_version, latest_version, update_url)
     values ('windows', '1.0.0', '1.0.0', 'https://example.com') $$,
  '23514',
  null,
  'A-8: sólo se admiten las plataformas conocidas');


-- ── A-9. El rastro del cambio ───────────────────────────────────────────────
update public.app_versions
   set updated_at = now() - interval '10 days'
 where platform = 'android';

update public.app_versions
   set min_required_version = '1.2.0'
 where platform = 'android';

select ok(
  (select updated_at from public.app_versions where platform = 'android')
    > now() - interval '1 minute',
  'A-9: accionar la palanca deja fecha — el trigger refresca updated_at');

select * from finish();
rollback;
