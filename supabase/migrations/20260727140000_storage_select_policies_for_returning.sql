-- ============================================================
-- storage.objects: policies SELECT acotadas al dueño — 2026-07-27
-- ------------------------------------------------------------
-- Sintoma:
--   Subir avatar/escudo/evidencia sigue fallando con
--   `new row violates row-level security policy for table "objects"`
--   incluso con las policies INSERT/UPDATE ya restauradas
--   (20260727120000) y con el path correcto (auth.uid()/archivo).
--
-- Causa — regla de PostgreSQL, no de Supabase:
--   `INSERT ... RETURNING` sobre una tabla con RLS aplica TAMBIEN las policies
--   de SELECT, porque la fila devuelta hay que poder leerla. storage-api hace
--   exactamente eso: inserta y devuelve el objeto creado. Sin ninguna policy
--   SELECT, el INSERT se completa pero el RETURNING lo rechaza y toda la
--   sentencia aborta con el error de RLS — que engañosamente apunta al INSERT.
--
--   Verificado en la base: el MISMO insert pasa sin RETURNING y falla con
--   RETURNING; agregando una policy SELECT, pasa.
--
--   Esto es lo que rompieron 20260708150337 (P0) y 20260711012142 (A4) al
--   dropear "Evidencias WO son publicas", "Avatars son publicos" y "Escudos son
--   publicos". Su objetivo era correcto —cerrar la enumeracion publica via
--   .list()— pero la nota "las policies INSERT/UPDATE quedan intactas" pasaba
--   por alto que el INSERT depende del SELECT.
--
-- Fix:
--   Reponer SELECT, pero acotado AL DUEÑO en lugar de publico. Asi:
--     - `INSERT ... RETURNING` vuelve a funcionar (cada uno lee lo que sube).
--     - La enumeracion que P0/A4 cerraron sigue cerrada: nadie puede listar el
--       contenido ajeno de un bucket.
--     - getPublicUrl() no se ve afectado: los buckets son publicos y resuelven
--       por key sin pasar por RLS.
--
-- ⚠️ Bloque tolerante: ver la nota de 20260727120000. En el stack local el rol
--   de migraciones no es dueño de storage.objects y `CREATE POLICY` abortaria
--   `supabase db reset`, tumbando el job db-tests-pgtap.
-- ============================================================

DO $storage$
BEGIN
  -- avatars — el path es `auth.uid()/archivo`, mismo criterio que el INSERT.
  EXECUTE $p$ DROP POLICY IF EXISTS "Usuarios leen su propio avatar" ON storage.objects $p$;
  EXECUTE $p$
    CREATE POLICY "Usuarios leen su propio avatar"
      ON storage.objects FOR SELECT TO authenticated
      USING (
        bucket_id = 'avatars'
        AND (storage.foldername(name))[1] = (SELECT auth.uid()::text)
      )
  $p$;

  -- shields — el path se organiza por equipo, no por uid, asi que acotamos por
  -- `owner`, que storage-api completa con el uid de quien sube.
  EXECUTE $p$ DROP POLICY IF EXISTS "Usuarios leen los escudos que subieron" ON storage.objects $p$;
  EXECUTE $p$
    CREATE POLICY "Usuarios leen los escudos que subieron"
      ON storage.objects FOR SELECT TO authenticated
      USING (bucket_id = 'shields' AND owner = (SELECT auth.uid()))
  $p$;

  -- wo_evidences — idem: solo la evidencia propia. La revision del reclamo la
  -- hace la RPC (SECURITY DEFINER), que no pasa por estas policies.
  EXECUTE $p$ DROP POLICY IF EXISTS "Usuarios leen las evidencias que subieron" ON storage.objects $p$;
  EXECUTE $p$
    CREATE POLICY "Usuarios leen las evidencias que subieron"
      ON storage.objects FOR SELECT TO authenticated
      USING (bucket_id = 'wo_evidences' AND owner = (SELECT auth.uid()))
  $p$;
EXCEPTION
  WHEN insufficient_privilege THEN
    RAISE NOTICE 'Storage omitido (sin ownership de storage.objects en el stack local)';
END
$storage$;
