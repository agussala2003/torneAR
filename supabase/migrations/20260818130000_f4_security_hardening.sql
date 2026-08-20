-- ============================================================
-- F4 SECURITY HARDENING — Hardening previo al Soft Launch — 2026-08-18
-- Cierra los hallazgos de get_advisors(type: security) listados en
-- docs/ROADMAP_CIERRE_Y_ESCALABILIDAD.md, sección FASE 4:
--   ERROR: v_team_ranking es SECURITY DEFINER (aplica los permisos del
--          creador, no los del consultante — bypasea RLS)
--   WARN:  open_team_stint(), close_team_stint() y
--          validate_match_proposal_schedule() son ejecutables por anon vía
--          /rest/v1/rpc/… — son funciones de TRIGGER, nadie debería
--          invocarlas directo.
--
-- Lo que NO toca esta migración (por diseño, ver el criterio de aceptación
-- de FASE 4): las ~35 funciones SECURITY DEFINER ejecutables por
-- `authenticated` — es el patrón deliberado del proyecto (todas las RPCs de
-- negocio son SECURITY DEFINER + su propia autorización interna), no un
-- hallazgo a corregir.
-- ============================================================

-- ─── 1. v_team_ranking — reponer security_invoker ────────────────────────────
-- Esto YA se había corregido una vez: 20260401015725_security_performance_patch
-- puso `security_invoker = true` en esta misma vista. Lo que pasó después es
-- el motivo de que el advisor vuelva a marcarla hoy:
--
--   20260728170000_e3_team_soft_deactivation.sql redefinió la vista con
--   `CREATE OR REPLACE VIEW ... AS SELECT …` para excluir equipos inactivos
--   (`is_active`). Motivo legítimo — pero `CREATE OR REPLACE VIEW` sin un
--   `WITH (security_invoker = true)` en el propio statement NO conserva las
--   reloptions de la vista anterior: las resetea al default (false). La
--   migración de julio nunca tocó permisos a propósito, así que nadie lo
--   notó — quedó revertido en silencio durante tres semanas hasta que el
--   advisor lo volvió a marcar.
--
-- `ALTER VIEW` (y no otro `CREATE OR REPLACE VIEW`) porque sólo cambia la
-- reloption, no toca la definición de la consulta — cero riesgo de divergir
-- por accidente del SELECT que e3 dejó vigente.
--
-- ⚠️ Si `v_team_ranking` se vuelve a redefinir con `CREATE OR REPLACE VIEW`
-- en el futuro (agregar una columna, cambiar el filtro, lo que sea): hay que
-- repetir este ALTER VIEW después, o incluir `WITH (security_invoker = true)`
-- en ese mismo CREATE OR REPLACE. Si no, esto se revierte otra vez.
ALTER VIEW public.v_team_ranking SET (security_invoker = true);


-- ─── 2. Funciones de trigger — bloquear invocación directa por RPC ──────────
-- Las tres son `RETURNS trigger` (no RPCs de negocio): Postgres las ejecuta
-- por el propio mecanismo de triggers al margen de los privilegios EXECUTE
-- del rol que disparó el INSERT/UPDATE — revocar EXECUTE no rompe ningún
-- trigger, sólo cierra la puerta de invocarlas a mano vía
-- POST /rest/v1/rpc/<nombre>.
--
-- open_team_stint() y close_team_stint() ya tenían un
-- `REVOKE ... FROM PUBLIC` desde 20260715100100_transfer_history_engine.sql
-- — no incluía `anon, authenticated` por nombre, sólo PUBLIC (de donde ambos
-- roles heredan por default, y ninguna migración les otorgó EXECUTE directo
-- aparte). Si el advisor las sigue marcando es casi seguro un reporte
-- desactualizado; de cualquier forma repetir el REVOKE acá es inofensivo
-- (revocar un privilegio ya ausente es no-op) y deja los tres nombrados
-- explícitamente, sin depender de la herencia de PUBLIC para razonar sobre
-- quién puede llamarlas.
--
-- validate_match_proposal_schedule() nunca había tenido un REVOKE: es el
-- único de los tres donde este cambio es realmente nuevo.
REVOKE EXECUTE ON FUNCTION public.open_team_stint() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.close_team_stint() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.validate_match_proposal_schedule() FROM PUBLIC, anon, authenticated;
