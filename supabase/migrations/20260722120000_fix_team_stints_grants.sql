-- ============================================================
-- Grant de lectura de team_stints — 2026-07-22
-- ------------------------------------------------------------
-- Hallazgo del canario estructural 010-schema.spec.sql en CI: `authenticated`
-- no podía leer team_stints en el schema de migraciones puras ("Missing
-- privileges: SELECT"). A diferencia de las otras tablas core, team_stints
-- nunca recibió un GRANT explícito: su SELECT dependía de los DEFAULT
-- PRIVILEGES de Supabase, que difieren entre versiones del CLI —
-- v2.83.0 (local) los incluía con SELECT, `latest` (CI) no. Por eso el test
-- pasaba en local y fallaba en CI (mismo patrón de drift entre entornos que
-- venimos cerrando: la verdad la define el stack efímero de migraciones puras).
--
-- El ledger de trayectoria se ESCRIBE sólo vía triggers SECURITY DEFINER
-- (open/close_team_stint), así que authenticated no necesita INSERT/UPDATE/
-- DELETE — sólo SELECT para que el DAL (get_player_career y las vistas de
-- perfil) pueda leer la historia. Se otorga exactamente eso, nada más.
-- Idempotente: re-otorgar un SELECT ya presente (p.ej. en local) es no-op.
-- ============================================================

GRANT SELECT ON public.team_stints TO authenticated;
