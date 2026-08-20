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
--   A-4      `authenticated` sin is_admin escribe sin error pero no mueve la fila.
--   A-4b     …y un admin sí — control positivo de la policy.
--   A-5      `anon` no puede escribir.
--   A-6      El CHECK rechaza una versión mal formada.
--   A-7      El CHECK rechaza una update_url que no sea https.
--   A-8      El CHECK rechaza una plataforma desconocida.
--   A-9      El trigger actualiza `updated_at` — es el único rastro de cuándo
--            se accionó la palanca.
-- ============================================================

begin;
select plan(10);

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


-- ── A-4. authenticated sin is_admin no cambia nada ──────────────────────────
-- ⚠️ Ya NO usa throws_ok, y el motivo importa más que el cambio.
--
-- Desde 20260818180000_dashboard_settings_versions_write el rol
-- `authenticated` SÍ tiene GRANT UPDATE (de columna) sobre los 3 campos
-- operativos: lo necesita el gestor de versiones del dashboard, que escribe
-- con la sesión del admin en el navegador, no con service_role. Quien filtra
-- es la policy `app_versions_update_admin` — y RLS NO lanza excepción:
-- descarta las filas en silencio.
--
-- O sea que el throws_ok que había acá no afirmaba "este usuario no puede
-- escribir" sino "a este usuario le falta el GRANT". Son dos cosas distintas
-- y la segunda dejó de ser cierta el 18-ago; el test venía pasando por el
-- motivo equivocado desde antes. Es la misma clase de falso negativo que
-- documenta 012-rls-returning-contract.
--
-- La aserción correcta es sobre el EFECTO: la sentencia corre sin error y la
-- fila no se mueve.
select tests.authenticate_as_profile('aaaaaaaa-0000-0000-0000-000000000001');

update public.app_versions
   set min_required_version = '99.0.0'
 where platform = 'android';

select tests.clear_auth();

select is(
  (select min_required_version from public.app_versions where platform = 'android'),
  '1.0.0',
  'A-4: un usuario autenticado sin is_admin no puede bloquear la app para todos');


-- ── A-4b. …y un admin sí puede ──────────────────────────────────────────────
-- Control positivo, sin el cual A-4 pasaría igual si la policy bloqueara a
-- TODO el mundo — que es justo el bug que dejaría muerto el gestor de
-- versiones del dashboard sin que ningún test se enterara. Es también la
-- razón por la que la respuesta correcta a A-4 NO era revocarle el UPDATE a
-- `authenticated`: eso apaga la palanca de emergencia junto con el ataque.
select tests.authenticate_as_profile('0a000000-0000-0000-0000-000000000001');

update public.app_versions
   set min_required_version = '2.0.0'
 where platform = 'android';

select tests.clear_auth();

select is(
  (select min_required_version from public.app_versions where platform = 'android'),
  '2.0.0',
  'A-4b: un admin SÍ acciona la palanca (control positivo de la policy)');

-- Vuelta al estado por defecto para que A-6..A-9 partan de donde esperan.
update public.app_versions set min_required_version = '1.0.0' where platform = 'android';


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
