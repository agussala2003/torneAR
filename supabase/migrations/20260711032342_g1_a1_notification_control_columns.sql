-- ============================================================
-- G1/G2 · Bloque A.1 — Columnas de control de estado — 2026-07-11
-- ------------------------------------------------------------
-- Parte de la feature "Notificaciones & Automatización" (gaps G1/G2/G3).
--
--   matches.reminder_24h_sent_at : idempotencia del recordatorio 24h (G2).
--     El cron (Bloque B) marca esta columna al enviar el recordatorio, así
--     un partido nunca recibe el recordatorio dos veces aunque el job corra
--     muchas veces. timestamptz (no boolean) para registrar CUÁNDO y depurar.
--
--   notifications.pushed_at : idempotencia de la ENTREGA push (G1).
--     La edge function push-dispatch la setea al intentar el push, y saltea
--     si ya está seteada -> evita doble-push ante reintentos de pg_net.
-- ============================================================

ALTER TABLE public.matches
  ADD COLUMN IF NOT EXISTS reminder_24h_sent_at timestamptz;

ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS pushed_at timestamptz;
