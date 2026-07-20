-- ============================================================
-- 000-setup — Bootstrap de la infraestructura pgTAP
-- ============================================================
-- Primer archivo que ejecuta `supabase test db` (pg_prove corre en orden
-- alfabético). Deja lista la base LOCAL/efímera de CI para el resto de las
-- suites:
--   1. Extensión pgtap (schema extensions).
--   2. Schema `tests` con los helpers de autenticación simulada.
--   3. Smoke test: verifica la tubería completa (CLI → pg_prove → pgTAP).
--
-- ⚠️ SEGURIDAD: este archivo NO es una migración y JAMÁS debe convertirse en
-- una. Todo lo que crea vive únicamente en la base local (supabase start) o
-- en el stack efímero de CI. Producción nunca lo ejecuta y pgtap debe
-- permanecer deshabilitado allí.
--
-- Los CREATE de esta sección quedan fuera del bloque transaccional a
-- propósito: deben persistir en la base local para que los archivos
-- siguientes (100-*, 200-*, ...) puedan usarlos. Son idempotentes.
-- ============================================================

create extension if not exists pgtap with schema extensions;

create schema if not exists tests;

-- Los helpers deben poder invocarse DESPUÉS de cambiar el rol de la sesión
-- (p. ej. clear_auth() corriendo como authenticated), así que los roles de
-- la API necesitan USAGE sobre el schema.
grant usage on schema tests to anon, authenticated, service_role;

-- ------------------------------------------------------------
-- tests.authenticate_as_profile(p_auth_user_id uuid)
-- ------------------------------------------------------------
-- Simula una sesión de PostgREST para el usuario de auth.users indicado:
--   - setea request.jwt.claims con sub + role (lo que leen auth.uid() y
--     auth.role() dentro de RPCs y policies), y
--   - cambia el rol de la transacción a `authenticated`, para que RLS se
--     aplique también en accesos directos a tablas (como postgres/superuser
--     las policies se bypasean y el test daría falso verde).
-- Ambos set_config usan is_local = true: el efecto muere con la transacción
-- del archivo de test (rollback automático).
--
-- Identidades canónicas del seed (supabase/seed.sql):
--   capitán Leones : auth aaaaaaaa-0000-0000-0000-000000000001
--   capitán Tigres : auth aaaaaaaa-0000-0000-0000-000000000004
--   capitán Rayos  : auth aaaaaaaa-0000-0000-0000-000000000007
-- ------------------------------------------------------------
create or replace function tests.authenticate_as_profile(p_auth_user_id uuid)
returns void
language plpgsql
as $$
begin
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', p_auth_user_id, 'role', 'authenticated')::text,
    true
  );
  perform set_config('role', 'authenticated', true);
end;
$$;

-- ------------------------------------------------------------
-- tests.clear_auth()
-- ------------------------------------------------------------
-- Limpia los claims y restaura el rol original de la sesión (postgres),
-- volviendo al contexto privilegiado para las fases de setup/verificación
-- de un test. Para simular un usuario ANÓNIMO de la API no uses esto:
-- setea rol `anon` explícitamente (futuro helper si hace falta).
-- ------------------------------------------------------------
create or replace function tests.clear_auth()
returns void
language plpgsql
as $$
begin
  perform set_config('request.jwt.claims', null, true);
  perform set_config('role', 'none', true);
end;
$$;

-- ============================================================
-- Smoke test — si esto está verde, la infraestructura funciona
-- ============================================================
begin;
select plan(3);

select ok(true, 'pgTAP operativo: extensión instalada y pg_prove conectado');

select has_function(
  'tests', 'authenticate_as_profile', array['uuid'],
  'helper tests.authenticate_as_profile(uuid) disponible'
);

select has_function(
  'tests', 'clear_auth', array[]::text[],
  'helper tests.clear_auth() disponible'
);

select * from finish();
rollback;
