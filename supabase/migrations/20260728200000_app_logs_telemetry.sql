-- ============================================================
-- app_logs: telemetria de errores silenciosos — 2026-07-28
-- ------------------------------------------------------------
-- Contexto (Beta):
--   Hoy un error que no revienta la UI no deja rastro: el usuario ve una
--   pantalla vacia o una accion que "no hace nada" y nosotros nos enteramos
--   solo si lo reporta. Esta tabla es el sumidero al que lib/logger.ts manda
--   info / warn / error desde el cliente, incluyendo las excepciones globales
--   y los unhandled promise rejections.
--
-- Modelo de acceso (deliberadamente asimetrico):
--   · INSERT  — anon + authenticated. Los errores mas valiosos son justamente
--     los de la pantalla de login y los del arranque, donde todavia no hay
--     sesion. Si el logueo exigiera auth, perderiamos esa ventana entera.
--   · SELECT  — solo admins de la liga (profiles.is_admin), que lo consumen
--     desde app/admin/logs.tsx.
--   · UPDATE / DELETE — sin policy: nadie los puede ejecutar via PostgREST.
--     El log es append-only; la retencion se maneja fuera de la app.
--
-- Anti-spoofing de user_id:
--   El cliente es quien manda `user_id`, asi que el WITH CHECK exige que sea
--   NULL o el propio auth.uid(). Sin eso, cualquiera podria ensuciar la
--   telemetria atribuyendole errores inventados a otro usuario, y el panel de
--   admin nos mentiria justo cuando mas lo necesitamos.
--
-- Idempotente: se puede re-aplicar sin efectos.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.app_logs (
  -- `extensions.uuid_generate_v4()` y no `gen_random_uuid()`: es la convencion
  -- del schema (las extensiones viven en `extensions`, no en `public`).
  id         uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  level      text NOT NULL CHECK (level IN ('info', 'warn', 'error')),
  message    text NOT NULL,
  details    jsonb,
  user_id    uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- El panel siempre lee "los ultimos N", con o sin filtro de nivel. Estos dos
-- indices cubren las dos unicas formas de la query.
CREATE INDEX IF NOT EXISTS app_logs_created_at_idx       ON public.app_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS app_logs_level_created_at_idx ON public.app_logs (level, created_at DESC);
CREATE INDEX IF NOT EXISTS app_logs_user_id_idx          ON public.app_logs (user_id);

ALTER TABLE public.app_logs ENABLE ROW LEVEL SECURITY;

-- Grants base. Sin estos, RLS ni llega a evaluarse: PostgREST corta antes con
-- "permission denied for table app_logs" (mismo drift que arreglo
-- 20260719120500_fix_core_tables_grants.sql).
GRANT INSERT ON public.app_logs TO anon, authenticated;
GRANT SELECT ON public.app_logs TO authenticated;
REVOKE UPDATE, DELETE ON public.app_logs FROM anon, authenticated;

-- ─── INSERT: cualquiera puede escribir, nadie puede firmar por otro ──────────
DROP POLICY IF EXISTS "app_logs_insert_anon" ON public.app_logs;
CREATE POLICY "app_logs_insert_anon"
  ON public.app_logs FOR INSERT TO anon
  WITH CHECK (user_id IS NULL);

DROP POLICY IF EXISTS "app_logs_insert_authenticated" ON public.app_logs;
CREATE POLICY "app_logs_insert_authenticated"
  ON public.app_logs FOR INSERT TO authenticated
  WITH CHECK (user_id IS NULL OR user_id = (SELECT auth.uid()));

-- ─── SELECT: solo administradores de la liga ────────────────────────────────
DROP POLICY IF EXISTS "app_logs_select_admin" ON public.app_logs;
CREATE POLICY "app_logs_select_admin"
  ON public.app_logs FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.auth_user_id = (SELECT auth.uid())
        AND p.is_admin = true
    )
  );

COMMENT ON TABLE public.app_logs IS
  'Telemetria de cliente (append-only). INSERT abierto a anon/authenticated, SELECT solo para profiles.is_admin.';
