-- ============================================================
-- Restaurar las policies de INSERT/UPDATE sobre storage.objects — 2026-07-27
-- ------------------------------------------------------------
-- Sintoma:
--   Subir un avatar falla con `StorageApiError: new row violates row-level
--   security policy`. Lo mismo aplica a escudos de equipo y evidencias de WO:
--   los tres pasan por storage.objects.
--
-- Causa:
--   `storage.objects` tiene RLS habilitado (relrowsecurity = true) y CERO
--   policies. Sin ninguna policy permisiva, RLS deniega absolutamente todo.
--
--   Las policies se declararon en 20240101000000_initial_schema.sql dentro de un
--   bloque `DO $storage$ ... EXCEPTION WHEN insufficient_privilege`. En PL/pgSQL
--   el handler revierte TODO el trabajo del bloque, asi que si el rol de
--   migraciones no era dueño de storage.objects, las siete policies se perdian
--   en silencio dejando solo un NOTICE. Los buckets si existen (se crearon por
--   dashboard), lo que enmascaro el problema.
--
--   Despues, 20260708150337 (P0) y 20260711012142 (A4) dropearon las policies
--   SELECT de wo_evidences / avatars / shields a proposito, para cerrar el
--   listado publico via .list(). Esa decision se RESPETA: esta migracion no las
--   recrea. Los buckets son publicos, asi que getPublicUrl() sigue resolviendo
--   cada objeto por su key sin necesidad de policy SELECT.
--
-- Alcance:
--   Solo INSERT/UPDATE, que es lo unico que la app necesita (.upload()).
--   Identicas a las del schema inicial.
--
-- ⚠️ Bloque tolerante, igual que 20240101000000_initial_schema.sql:
--   En el stack LOCAL / efimero de CI el rol de migraciones NO es dueño de
--   storage.objects, y `CREATE POLICY` exige ownership. Sin este wrapper,
--   `supabase db reset` aborta y se cae entero el job db-tests-pgtap. En
--   produccion el rol si es dueño, asi que ahi se aplica normalmente.
--   (`DROP POLICY IF EXISTS` sobre una policy inexistente no chequea ownership,
--   por eso las migraciones P0/A4 nunca rompieron el stack local.)
-- ============================================================

DO $storage$
BEGIN
  -- avatars — cada usuario escribe unicamente dentro de su carpeta auth.uid()/.
  -- Coincide con el path que arma lib/profile-edit-data.ts: `${user.id}/avatar-*`.
  EXECUTE $p$ DROP POLICY IF EXISTS "Usuarios suben su propio avatar" ON storage.objects $p$;
  EXECUTE $p$
    CREATE POLICY "Usuarios suben su propio avatar"
      ON storage.objects FOR INSERT TO authenticated
      WITH CHECK (
        bucket_id = 'avatars'
        AND (storage.foldername(name))[1] = (SELECT auth.uid()::text)
      )
  $p$;

  -- UPDATE hace falta porque el upload usa `upsert: true`.
  EXECUTE $p$ DROP POLICY IF EXISTS "Usuarios actualizan su propio avatar" ON storage.objects $p$;
  EXECUTE $p$
    CREATE POLICY "Usuarios actualizan su propio avatar"
      ON storage.objects FOR UPDATE TO authenticated
      USING (
        bucket_id = 'avatars'
        AND (storage.foldername(name))[1] = (SELECT auth.uid()::text)
      )
      WITH CHECK (
        bucket_id = 'avatars'
        AND (storage.foldername(name))[1] = (SELECT auth.uid()::text)
      )
  $p$;

  -- shields — el path se arma por teamId, no por uid, y quien puede editar el
  -- escudo ya se valida en la RPC/tabla `teams`. Se mantiene el criterio original.
  EXECUTE $p$ DROP POLICY IF EXISTS "Usuarios autenticados suben escudos" ON storage.objects $p$;
  EXECUTE $p$
    CREATE POLICY "Usuarios autenticados suben escudos"
      ON storage.objects FOR INSERT TO authenticated
      WITH CHECK (bucket_id = 'shields')
  $p$;

  EXECUTE $p$ DROP POLICY IF EXISTS "Usuarios autenticados actualizan escudos" ON storage.objects $p$;
  EXECUTE $p$
    CREATE POLICY "Usuarios autenticados actualizan escudos"
      ON storage.objects FOR UPDATE TO authenticated
      USING (bucket_id = 'shields')
      WITH CHECK (bucket_id = 'shields')
  $p$;

  -- wo_evidences — la evidencia se sube al reclamar un WO; la autorizacion real
  -- la hace la RPC claim_wo.
  EXECUTE $p$ DROP POLICY IF EXISTS "Usuarios autenticados suben evidencias" ON storage.objects $p$;
  EXECUTE $p$
    CREATE POLICY "Usuarios autenticados suben evidencias"
      ON storage.objects FOR INSERT TO authenticated
      WITH CHECK (bucket_id = 'wo_evidences')
  $p$;
EXCEPTION
  WHEN insufficient_privilege THEN
    RAISE NOTICE 'Storage omitido (sin ownership de storage.objects en el stack local)';
END
$storage$;
