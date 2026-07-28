-- ============================================================
-- Realtime de notificaciones + FK que bloqueaba borrar el equipo — 2026-07-28
-- ============================================================

-- ─── 1. La burbuja de notificaciones no se actualizaba sola ─────────────────
-- components/GlobalHeader.tsx se suscribe a `postgres_changes` sobre
-- `notifications` (badge de la campana) y sobre `challenges` (badge de desafíos
-- en Ranking). Ninguna de las dos estaba en la publicación `supabase_realtime`
-- —solo estaban matches, match_results y messages—, así que Postgres nunca
-- emitía esos cambios: la suscripción se creaba, no fallaba, y jamás recibía
-- nada. El contador solo se refrescaba al montar el header.
--
-- Idempotente a propósito: `ALTER PUBLICATION ... ADD TABLE` falla si la tabla
-- ya es miembro, y esta migración tiene que poder re-aplicarse en cada
-- `supabase db reset` del stack local y del efímero de CI.
DO $pub$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'notifications'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'challenges'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.challenges';
  END IF;

  -- `messages` estaba publicada en PRODUCCIÓN pero ninguna migración la agregaba:
  -- alguien la habilitó a mano por dashboard. Detectado por
  -- supabase/tests/020-realtime-publication.spec.sql en su primera corrida contra
  -- el stack local, donde faltaba. Sin esto, el chat en vivo (app/(modals)/chat.tsx
  -- y market-chats/[id].tsx) no recibe mensajes en ningún entorno nuevo — los
  -- mensajes solo aparecerían al recargar la pantalla.
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'messages'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.messages';
  END IF;
EXCEPTION
  WHEN insufficient_privilege THEN
    RAISE NOTICE 'Publicación supabase_realtime omitida (sin ownership en el stack local)';
  WHEN undefined_object THEN
    RAISE NOTICE 'Publicación supabase_realtime inexistente en este entorno';
END
$pub$;

-- El filtro `profile_id=eq.<id>` viaja en el payload del INSERT/UPDATE, que con
-- la replica identity por defecto ya trae todas las columnas nuevas. Se deja en
-- DEFAULT a propósito: FULL duplicaría el WAL de cada escritura y acá no se
-- filtran DELETEs.

-- ─── 2. DELETE de un equipo devolvía 409 (Conflict) ─────────────────────────
-- Con la policy de DELETE ya en su lugar (20260727160000), el borrado dejó de
-- ser silencioso y afloró el problema real: `messages.sender_team_id` referencia
-- a `teams` con NO ACTION, así que cualquier equipo que haya escrito un mensaje
-- de chat queda imposible de eliminar.
--
-- `sender_team_id` es sólo atribución ("desde qué equipo se escribió") y la
-- columna ya es nullable, así que SET NULL es la semántica correcta: el mensaje
-- sobrevive, pierde la referencia al equipo borrado.
--
-- Los demás FKs en NO ACTION (matches, match_participants, match_proposals,
-- match_results, result_dispute_votes, wo_claims) se dejan COMO ESTÁN a
-- propósito: son historial deportivo compartido con el equipo rival, y
-- cascadearlos borraría partidos del otro equipo. Que un equipo con historial no
-- se pueda eliminar es la conducta deseada — el cliente ahora lo explica en vez
-- de fallar con un error críptico. Esa decisión queda fijada por el test
-- supabase/tests/011-schema-fk-rules.spec.sql.
ALTER TABLE public.messages
  DROP CONSTRAINT IF EXISTS messages_sender_team_id_fkey;

ALTER TABLE public.messages
  ADD CONSTRAINT messages_sender_team_id_fkey
  FOREIGN KEY (sender_team_id) REFERENCES public.teams(id) ON DELETE SET NULL;
