-- ============================================================
-- A4 — Quitar el listado público de los buckets avatars y shields — 2026-07-10
-- ------------------------------------------------------------
-- Hallazgo (audit 2026-07-10, bloque ALTO):
--   Los buckets públicos `avatars` y `shields` tenían una policy SELECT amplia
--   sobre storage.objects (roles = public, sin filtro por owner), que permitía
--   enumerar (.list()) todo su contenido vía la Storage API.
--
-- Fix:
--   Dropear ambas policies. Como los buckets son públicos, getPublicUrl() sigue
--   resolviendo cada objeto por su key sin necesidad de policy SELECT — la app
--   sólo usa .upload() (policies INSERT/UPDATE, intactas) y getPublicUrl()
--   (verificado en lib/supabase-storage.ts, lib/team-manage-data.ts y
--   components/profile/ProfileHeader.tsx: no hay ningún .list()).
--   Mismo patrón que el P0 aplicó a `wo_evidences`.
-- ============================================================

DROP POLICY IF EXISTS "Avatars son publicos" ON storage.objects;
DROP POLICY IF EXISTS "Escudos son publicos" ON storage.objects;
