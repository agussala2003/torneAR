-- ============================================================
-- Fix: el guard `auth.role() != 'service_role'` no es NULL-safe — 2026-08-19
-- ------------------------------------------------------------
-- Segundo bug encontrado probando 20260819231500 antes de dar por buena la
-- integración (el primero fue el de session_user, misma sesión de trabajo).
--
-- `auth.role()` devuelve NULL cuando no hay ningún contexto de JWT en
-- absoluto (ej. una conexión directa sin pasar por PostgREST). En SQL,
-- `NULL != 'service_role'` es NULL, no TRUE — y `IF NULL THEN ... END IF`
-- en plpgsql toma la rama como si fuera FALSE. Resultado: el guard se
-- saltaba entero, no sólo para service_role sino para CUALQUIER caller sin
-- contexto de JWT. Confirmado en vivo: un llamado a mark_instagram_sync sin
-- ninguna impersonación (rol postgres liso, auth.role() = NULL) se ejecutó
-- en vez de rechazarse.
--
-- Las RPCs `is_admin` de este proyecto no tienen este problema porque
-- comparan una COLUMNA contra `auth.uid()` dentro de un EXISTS
-- (`auth_user_id = auth.uid()`): con `auth.uid()` NULL, la comparación no
-- matchea ninguna fila y el EXISTS da NOT EXISTS = true correctamente. Acá
-- se compara `auth.role()` directo contra un literal, que no tiene esa
-- protección implícita — hace falta `IS DISTINCT FROM`, el operador NULL-safe.
--
-- Se mantienen 20260819231000 y 20260819231500 tal como se aplicaron.
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_instagram_token(p_account_id uuid)
RETURNS TABLE (
  access_token     text,
  ig_user_id       text,
  token_expires_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'NOT_AUTHORIZED: solo service_role';
  END IF;

  RETURN QUERY
  SELECT ds.decrypted_secret, sa.external_id, sa.token_expires_at
  FROM public.social_accounts sa
  JOIN vault.decrypted_secrets ds ON ds.id = sa.access_token_secret_id
  WHERE sa.id = p_account_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_instagram_token(
  p_account_id         uuid,
  p_access_token       text,
  p_expires_in_seconds int
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_secret_id uuid;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'NOT_AUTHORIZED: solo service_role';
  END IF;

  SELECT access_token_secret_id INTO v_secret_id
  FROM public.social_accounts WHERE id = p_account_id;

  IF v_secret_id IS NULL THEN
    RAISE EXCEPTION 'NOT_CONNECTED: la cuenta no tiene un token para refrescar';
  END IF;

  PERFORM vault.update_secret(v_secret_id, p_access_token);

  UPDATE public.social_accounts
  SET token_expires_at = now() + make_interval(secs => p_expires_in_seconds)
  WHERE id = p_account_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_instagram_sync(
  p_account_id uuid,
  p_error      text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'NOT_AUTHORIZED: solo service_role';
  END IF;

  UPDATE public.social_accounts
  SET last_synced_at  = now(),
      last_sync_error = p_error
  WHERE id = p_account_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.service_snapshot_upsert(
  p_account_id  uuid,
  p_captured_at date,
  p_followers   int DEFAULT NULL,
  p_following   int DEFAULT NULL,
  p_posts       int DEFAULT NULL,
  p_reach       int DEFAULT NULL,
  p_views       int DEFAULT NULL,
  p_profile_views int DEFAULT NULL,
  p_engagements int DEFAULT NULL,
  p_raw         jsonb DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'NOT_AUTHORIZED: solo service_role';
  END IF;

  IF p_account_id IS NULL OR p_captured_at IS NULL THEN
    RAISE EXCEPTION 'INVALID_INPUT: p_account_id y p_captured_at son obligatorios';
  END IF;

  INSERT INTO public.social_metrics_daily (
    account_id, captured_at, followers, following, posts_count,
    reach, views, profile_views, engagements, source, raw
  )
  VALUES (
    p_account_id, p_captured_at, p_followers, p_following, p_posts,
    p_reach, p_views, p_profile_views, p_engagements, 'api', p_raw
  )
  ON CONFLICT (account_id, captured_at) DO UPDATE SET
    followers     = EXCLUDED.followers,
    following     = EXCLUDED.following,
    posts_count   = EXCLUDED.posts_count,
    reach         = EXCLUDED.reach,
    views         = EXCLUDED.views,
    profile_views = EXCLUDED.profile_views,
    engagements   = EXCLUDED.engagements,
    source        = 'api',
    raw           = EXCLUDED.raw;
END;
$$;
