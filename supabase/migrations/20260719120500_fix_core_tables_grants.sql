-- ============================================================
-- Grants base de tablas core — 2026-07-19
-- ------------------------------------------------------------
-- Segunda entrega del hallazgo de drift del pipeline pgTAP (chore/pgtap-ci):
-- tras corregir challenges (20260719120000), el stack efímero de CI falló
-- con "permission denied for table profiles". Causa: las policies RLS se
-- evalúan con los privilegios del rol que consulta, y las policies de
-- challenges (y otras) hacen subqueries a profiles/team_members para mapear
-- auth.uid() → perfil → membresía; sin SELECT base sobre esas tablas, la
-- evaluación misma de la policy explota.
--
-- Se otorgan los permisos base a las tablas core del dominio de una vez,
-- en lugar de perseguir el drift tabla por tabla. Es seguro: las cuatro
-- tienen RLS habilitado desde 20240101000000_initial_schema.sql (líneas
-- 1021-1026) y son las policies quienes determinan visibilidad y mutación
-- reales. Idempotente: en producción/local estos grants ya existen por
-- aplicación manual (Studio) nunca exportada al repo.
-- ============================================================

GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles     TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.teams        TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.team_members TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.matches      TO authenticated;
