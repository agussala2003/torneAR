-- ============================================================
-- Grants base de tablas de comunicación/interacción (RLS) — 2026-07-22
-- ------------------------------------------------------------
-- Predicción confirmada al migrar rls_performance_regression a pgTAP
-- (260-rls-performance.spec.sql): ni team_join_requests, ni messages, ni
-- conversations tenían GRANT alguno para authenticated en las migraciones
-- puras (verificado por grep). Su acceso en producción/local venía del mismo
-- drift manual (GRANT ALL vía Studio) nunca exportado al repo; en el stack
-- efímero de CI (migraciones puras) el default de Supabase NO otorga DML a
-- authenticated (lo probó el caso team_stints), así que:
--   · P3 — UPDATE team_join_requests → permission denied
--   · P5 — INSERT messages (+ subquery de la policy a conversations) → idem
--
-- Estas tablas SON de escritura directa del rol de la app (el DAL crea
-- solicitudes de unión, envía mensajes y abre conversaciones de mercado como
-- authenticated), así que el grant faltaba de verdad. La autorización
-- fila-a-fila sigue en manos de las policies RLS (todas con RLS habilitado);
-- estos son sólo los privilegios base. Idempotente: no-op donde ya existen
-- por el drift (producción/local).
-- ============================================================

GRANT SELECT, INSERT, UPDATE, DELETE ON public.team_join_requests TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.messages           TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.conversations      TO authenticated;
