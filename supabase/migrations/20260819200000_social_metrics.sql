-- ============================================================
-- Fase 1 de Marketing & Growth: termómetro de redes sociales
-- 2026-08-19
-- ------------------------------------------------------------
-- Dos tablas nuevas para trackear el crecimiento de las cuentas oficiales
-- (Instagram, TikTok, X) semana a semana. Arranca con carga manual desde
-- /dashboard/social; el día que se conecte una API real (Fase 3 del roadmap
-- de la épica), el conector escribe por la misma RPC de upsert y el esquema
-- no cambia.
--
-- Decisiones de diseño (ver conversación de la épica):
--   · Se guardan valores absolutos por día, no deltas. Un delta guardado es
--     mentira en cuanto hay un hueco en la carga; el delta se calcula en SQL
--     o en el cliente a partir de dos absolutos.
--   · UNIQUE (account_id, captured_at) + upsert: correr la carga dos veces
--     el mismo día actualiza la fila en vez de duplicarla.
--   · `source` distingue 'manual' de 'api' — necesario para saber, el día
--     que se conecte una API, si un valor puede pisarse con confianza.
--   · Columnas tipadas para lo que Recharts y las RPCs necesitan; `raw jsonb`
--     al lado para lo que una API futura devuelva y hoy no sabemos modelar.
--   · Todas las métricas son nullable: no todas las redes exponen las mismas
--     (X no tiene profile_views, por ejemplo). NULL = dato no disponible,
--     nunca se confunde con 0.
--
-- Mismo modelo de acceso que el resto de las tablas de administración
-- (app_logs, content_reports): SELECT sólo para profiles.is_admin, sin
-- policies de escritura — todo mutación pasa por social_snapshot_upsert
-- (SECURITY DEFINER).
--
-- Idempotente.
-- ============================================================


-- ════════════════════════════════════════════════════════════
-- 1. Tablas
-- ════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.social_accounts (
  id           uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  platform     text NOT NULL CHECK (platform IN ('instagram', 'tiktok', 'x')),
  handle       text NOT NULL,
  display_name text NOT NULL,
  is_active    boolean NOT NULL DEFAULT true,
  -- ID de la cuenta en la API de la plataforma (Instagram Business Account ID,
  -- TikTok open_id, etc.). Nullable: no hace falta hasta que exista un
  -- conector real; la carga manual no lo necesita.
  external_id  text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (platform, handle)
);

COMMENT ON TABLE public.social_accounts IS
  'Cuentas oficiales de torneAR en redes sociales (una fila por cuenta). SELECT solo para profiles.is_admin.';

CREATE TABLE IF NOT EXISTS public.social_metrics_daily (
  id            uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  account_id    uuid NOT NULL REFERENCES public.social_accounts(id) ON DELETE CASCADE,
  captured_at   date NOT NULL,
  followers     int,
  following     int,
  posts_count   int,
  reach         int,
  views         int,
  profile_views int,
  engagements   int,
  source        text NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'api')),
  -- Lo que la API haya devuelto, sin normalizar. Guarda lo que hoy no
  -- sabemos que vamos a necesitar sin forzar una migración para agregarlo.
  raw           jsonb,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (account_id, captured_at)
);

COMMENT ON TABLE public.social_metrics_daily IS
  'Snapshot diario de métricas por cuenta social (valores absolutos, no deltas). SELECT solo para profiles.is_admin; escritura únicamente vía social_snapshot_upsert.';

-- La serie del gráfico siempre pide "una cuenta, un rango de fechas
-- ordenado" — mismo criterio que app_logs_created_at_idx.
CREATE INDEX IF NOT EXISTS social_metrics_daily_account_captured_idx
  ON public.social_metrics_daily (account_id, captured_at DESC);


-- ════════════════════════════════════════════════════════════
-- 2. RLS
-- ════════════════════════════════════════════════════════════

ALTER TABLE public.social_accounts     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.social_metrics_daily ENABLE ROW LEVEL SECURITY;

-- Sin este GRANT, PostgREST corta con "permission denied for table" antes de
-- que RLS llegue a evaluarse (mismo drift que 20260719120500).
GRANT SELECT ON public.social_accounts      TO authenticated;
GRANT SELECT ON public.social_metrics_daily TO authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.social_accounts      FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.social_metrics_daily FROM anon, authenticated;
REVOKE ALL ON public.social_accounts      FROM anon;
REVOKE ALL ON public.social_metrics_daily FROM anon;

DROP POLICY IF EXISTS "social_accounts_select_admin" ON public.social_accounts;
CREATE POLICY "social_accounts_select_admin"
  ON public.social_accounts FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.auth_user_id = (SELECT auth.uid())
        AND p.is_admin = true
    )
  );

DROP POLICY IF EXISTS "social_metrics_daily_select_admin" ON public.social_metrics_daily;
CREATE POLICY "social_metrics_daily_select_admin"
  ON public.social_metrics_daily FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.auth_user_id = (SELECT auth.uid())
        AND p.is_admin = true
    )
  );


-- ════════════════════════════════════════════════════════════
-- 3. social_snapshot_upsert — carga de un snapshot diario
-- ════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.social_snapshot_upsert(
  p_account_id    uuid,
  p_captured_at   date,
  p_followers     int  DEFAULT NULL,
  p_following     int  DEFAULT NULL,
  p_posts         int  DEFAULT NULL,
  p_reach         int  DEFAULT NULL,
  p_views         int  DEFAULT NULL,
  p_profile_views int  DEFAULT NULL,
  p_engagements   int  DEFAULT NULL,
  p_source        text DEFAULT 'manual'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE auth_user_id = auth.uid() AND is_admin = true
  ) THEN
    RAISE EXCEPTION 'NOT_AUTHORIZED: se requiere is_admin';
  END IF;

  IF p_account_id IS NULL OR p_captured_at IS NULL THEN
    RAISE EXCEPTION 'INVALID_INPUT: p_account_id y p_captured_at son obligatorios';
  END IF;

  -- Cargar "la semana que viene" por error de tipeo no debería ser posible:
  -- el snapshot es un hecho pasado, nunca una proyección.
  IF p_captured_at > current_date THEN
    RAISE EXCEPTION 'INVALID_DATE: p_captured_at no puede ser una fecha futura';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.social_accounts WHERE id = p_account_id) THEN
    RAISE EXCEPTION 'ACCOUNT_NOT_FOUND: la cuenta no existe';
  END IF;

  IF p_source IS NULL OR p_source NOT IN ('manual', 'api') THEN
    p_source := 'manual';
  END IF;

  -- Negativos no tienen sentido para ninguna de estas métricas y sólo
  -- pueden venir de un error de tipeo — mejor rechazarlo acá que dejar que
  -- el gráfico dibuje una caída imposible.
  IF p_followers     < 0 OR p_following   < 0 OR p_posts       < 0 OR
     p_reach         < 0 OR p_views       < 0 OR p_profile_views < 0 OR
     p_engagements   < 0 THEN
    RAISE EXCEPTION 'INVALID_INPUT: las métricas no pueden ser negativas';
  END IF;

  INSERT INTO public.social_metrics_daily (
    account_id, captured_at, followers, following, posts_count,
    reach, views, profile_views, engagements, source
  )
  VALUES (
    p_account_id, p_captured_at, p_followers, p_following, p_posts,
    p_reach, p_views, p_profile_views, p_engagements, p_source
  )
  ON CONFLICT (account_id, captured_at) DO UPDATE SET
    followers     = EXCLUDED.followers,
    following     = EXCLUDED.following,
    posts_count   = EXCLUDED.posts_count,
    reach         = EXCLUDED.reach,
    views         = EXCLUDED.views,
    profile_views = EXCLUDED.profile_views,
    engagements   = EXCLUDED.engagements,
    source        = EXCLUDED.source;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.social_snapshot_upsert(uuid, date, int, int, int, int, int, int, int, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.social_snapshot_upsert(uuid, date, int, int, int, int, int, int, int, text) TO authenticated;

COMMENT ON FUNCTION public.social_snapshot_upsert(uuid, date, int, int, int, int, int, int, int, text) IS
  'Carga o actualiza el snapshot de una cuenta social para un día dado (is_admin). Idempotente vía UNIQUE(account_id, captured_at) + ON CONFLICT.';


-- ════════════════════════════════════════════════════════════
-- 4. dashboard_social_timeseries — serie para el gráfico
-- ════════════════════════════════════════════════════════════
-- Misma convención que dashboard_growth_timeseries / dashboard_logs_timeseries:
-- (p_from, p_to) inclusive, NULL = últimos 30 días, tope de 366 días.
--
-- A diferencia de esas dos, acá el LEFT JOIN no lleva COALESCE a 0: un día
-- sin carga tiene que llegar como NULL. Interpolar o rellenar con cero
-- dibujaría una caída de seguidores que nunca pasó — el hueco es el dato.

CREATE OR REPLACE FUNCTION public.dashboard_social_timeseries(
  p_platform text,
  p_from     date DEFAULT NULL,
  p_to       date DEFAULT NULL
)
RETURNS TABLE (
  day           date,
  followers     int,
  following     int,
  posts_count   int,
  reach         int,
  views         int,
  profile_views int,
  engagements   int
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_from       date;
  v_to         date;
  v_account_id uuid;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE auth_user_id = auth.uid() AND is_admin = true
  ) THEN
    RAISE EXCEPTION 'NOT_AUTHORIZED: se requiere is_admin';
  END IF;

  IF p_platform IS NULL OR p_platform NOT IN ('instagram', 'tiktok', 'x') THEN
    RAISE EXCEPTION 'INVALID_PLATFORM: p_platform debe ser instagram, tiktok o x';
  END IF;

  v_to   := COALESCE(p_to, current_date);
  v_from := COALESCE(p_from, v_to - 29);

  IF v_from > v_to THEN
    RAISE EXCEPTION 'INVALID_RANGE: p_from debe ser anterior o igual a p_to';
  END IF;

  IF v_to - v_from > 366 THEN
    v_from := v_to - 366;
  END IF;

  -- Una cuenta activa por plataforma. Si hubiera más de una (hoy no las hay),
  -- se toma la más nueva en vez de fallar: un panel con datos parciales es
  -- mejor que un panel roto.
  SELECT id INTO v_account_id
  FROM public.social_accounts
  WHERE platform = p_platform AND is_active = true
  ORDER BY created_at DESC
  LIMIT 1;

  -- Sin cuenta configurada para la plataforma: serie vacía, no error. El
  -- cliente lo distingue de "cuenta configurada pero sin snapshots todavía"
  -- por la ausencia total de filas vs. filas con todas las métricas en NULL.
  IF v_account_id IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH date_series AS (
    SELECT generate_series(v_from, v_to, interval '1 day')::date AS day
  )
  SELECT
    ds.day,
    m.followers,
    m.following,
    m.posts_count,
    m.reach,
    m.views,
    m.profile_views,
    m.engagements
  FROM date_series ds
  LEFT JOIN public.social_metrics_daily m
    ON m.account_id = v_account_id AND m.captured_at = ds.day
  ORDER BY ds.day;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.dashboard_social_timeseries(text, date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dashboard_social_timeseries(text, date, date) TO authenticated;

COMMENT ON FUNCTION public.dashboard_social_timeseries(text, date, date) IS
  'Serie diaria de métricas de una plataforma social para /dashboard/social (is_admin). Rango inclusive, NULL = últimos 30 días, topeado en 366. Los días sin snapshot llegan con métricas en NULL, no en 0.';


-- ════════════════════════════════════════════════════════════
-- 5. Semillero — las 3 cuentas oficiales
-- ════════════════════════════════════════════════════════════
-- Handles placeholder: reemplazar por los reales con un UPDATE puntual antes
-- de usar el panel en serio. ON CONFLICT DO NOTHING para que reaplicar la
-- migración no las duplique ni pise un handle ya corregido a mano.

INSERT INTO public.social_accounts (platform, handle, display_name) VALUES
  ('instagram', 'tornear.ar', 'torneAR'),
  ('tiktok',    'tornear.ar', 'torneAR'),
  ('x',         'tornear_ar', 'torneAR')
ON CONFLICT (platform, handle) DO NOTHING;
