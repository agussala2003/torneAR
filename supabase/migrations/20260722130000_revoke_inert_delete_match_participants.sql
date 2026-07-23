-- ============================================================
-- Revocar DELETE de tabla en match_participants — 2026-07-22
-- ------------------------------------------------------------
-- Hallazgo del canario 015-schema-interactions: authenticated conservaba
-- DELETE a nivel TABLA sobre match_participants. Es un remanente de la
-- creación de la tabla (schema inicial): la migración de squad
-- 20260714201000 blindó las escrituras revocando INSERT/UPDATE de tabla y
-- re-otorgándolos por columna (todo pasa por submit_team_checkin), pero
-- nunca revocó DELETE.
--
-- El grant es INERTE hoy — no existe policy de DELETE sobre la tabla, así que
-- RLS ya bloquea cualquier borrado de authenticated. Este REVOKE no cambia
-- comportamiento: sólo alinea la matriz de privilegios con el diseño RPC-only
-- (misma postura sólo-lectura a nivel tabla que team_stints) y elimina un
-- permiso silencioso que un futuro `CREATE POLICY ... FOR DELETE` podría
-- activar por accidente. Principio de menor privilegio. Idempotente.
-- ============================================================

REVOKE DELETE ON public.match_participants FROM authenticated;
