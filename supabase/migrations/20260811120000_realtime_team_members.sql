-- ============================================================
-- C1 · Realtime de membresías — 2026-08-11
-- ------------------------------------------------------------
-- El selector de equipos seguía ofreciendo un club del que al usuario ya lo
-- habían echado. La revalidación al abrir el selector y al volver del segundo
-- plano (commit anterior) cubre el caso reportado, pero recién en el próximo
-- gesto del usuario: publicando `team_members` la expulsión llega sola.
--
-- Idempotente: se puede re-aplicar sin efectos.
-- ============================================================

-- ─── Identidad de réplica ────────────────────────────────────────────────────
-- FULL y no DEFAULT.
--
-- Con DEFAULT, un DELETE sólo emite la PK de la fila borrada. El cliente filtra
-- por `profile_id=eq.<mi-perfil>` y `profile_id` NO es la PK de esta tabla, así
-- que el evento de la expulsión —justamente el que importa— llegaría sin la
-- columna del filtro y Realtime lo descartaría. FULL hace viajar la fila vieja
-- completa. Mismo criterio que `match_results` en la migración 20260723120000.
ALTER TABLE public.team_members REPLICA IDENTITY FULL;


-- ─── Publicación ─────────────────────────────────────────────────────────────
-- El guard sobre la existencia de la publicación replica el de 20260723120000:
-- evita que un `db reset` contra un Postgres pelado (sin el bootstrap de
-- Supabase) aborte toda la cadena de migraciones.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    RAISE NOTICE 'Publicacion supabase_realtime inexistente: se omite el alta de la tabla.';
    RETURN;
  END IF;

  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.team_members;
    RAISE NOTICE 'team_members agregada a supabase_realtime.';
  EXCEPTION
    WHEN duplicate_object THEN
      RAISE NOTICE 'team_members ya estaba publicada: sin cambios.';
  END;
END $$;


-- ─── Verificación ────────────────────────────────────────────────────────────
-- SELECT tablename FROM pg_publication_tables
--  WHERE pubname = 'supabase_realtime' AND tablename = 'team_members';
--
-- SELECT relreplident FROM pg_class WHERE oid = 'public.team_members'::regclass;
--   -- 'f' = FULL, 'd' = DEFAULT
