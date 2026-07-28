-- ============================================================
-- Realtime de match_proposals — 2026-07-28
-- ------------------------------------------------------------
-- Síntoma QA: al proponer/aceptar detalles de un partido, la otra punta no se
-- entera hasta salir y volver a entrar a la pantalla.
--
-- Causa raíz: hooks/useMatchRealtime.ts sólo escuchaba `matches` y
-- `match_results`. Una propuesta nueva es un INSERT en `match_proposals` que NO
-- toca `matches` (el partido sigue PENDIENTE hasta que alguien acepta), así que
-- no había ningún evento que disparara el refetch. El rival veía "Sin propuesta
-- activa" con una propuesta esperándolo.
--
-- Mismo fallo silencioso que documenta 020-realtime-publication.spec.sql: la
-- suscripción se crea, el canal pasa a SUBSCRIBED, y Postgres simplemente nunca
-- emite nada para una tabla que no está publicada.
--
-- Idempotente: `ALTER PUBLICATION ... ADD TABLE` lanza duplicate_object si la
-- tabla ya es miembro, y esta migración tiene que sobrevivir a cada
-- `supabase db reset` del stack local y del efímero de CI.
-- ============================================================

DO $pub$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'match_proposals'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.match_proposals';
  END IF;
EXCEPTION
  WHEN insufficient_privilege THEN
    RAISE NOTICE 'Publicación supabase_realtime omitida (sin ownership en el stack local)';
  WHEN undefined_object THEN
    RAISE NOTICE 'Publicación supabase_realtime inexistente en este entorno';
END
$pub$;

-- REPLICA IDENTITY queda en DEFAULT: el filtro del cliente es
-- `match_id=eq.<uuid>` sobre INSERT/UPDATE, y esos payloads ya traen todas las
-- columnas nuevas. FULL duplicaría el WAL de cada escritura sin ganar nada —
-- acá no se filtran DELETEs (una propuesta se cancela con UPDATE de status, no
-- se borra).
