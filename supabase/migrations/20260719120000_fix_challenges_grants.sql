-- ============================================================
-- Grants base de challenges — 2026-07-19
-- ------------------------------------------------------------
-- Hallazgo del pipeline pgTAP (chore/pgtap-ci, caso P1-6): el rol
-- authenticated no tenía GRANTs sobre public.challenges en el schema de
-- migraciones puras. En producción y en local los permisos existían por
-- aplicación manual (Studio) nunca exportada al repo, por eso el drift
-- recién apareció cuando el stack efímero de CI construyó la base desde
-- cero: cualquier UPDATE con WHERE (o RETURNING) exige SELECT y fallaba
-- con "permission denied for table challenges".
--
-- La autorización fila-a-fila sigue siendo responsabilidad de las policies
-- RLS de challenges (habilitado en 20240101000000_initial_schema.sql);
-- estos grants son sólo la capa base estándar de Supabase. Idempotente:
-- re-otorgar un grant ya existente es un no-op, así que aplicarla en
-- producción/local no cambia nada.
-- ============================================================

GRANT SELECT, INSERT, UPDATE, DELETE ON public.challenges TO authenticated;
