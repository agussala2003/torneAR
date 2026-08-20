-- ============================================================
-- Fix: el guard de las RPCs de service_role usaba session_user, que no
-- sirve — 2026-08-19
-- ------------------------------------------------------------
-- Bug encontrado probando 20260819231000 antes de dar por buena la
-- integración: adentro de una función SECURITY DEFINER, tanto
-- `session_user` COMO `current_user` pasan a ser el dueño de la función
-- (postgres) durante la ejecución — no el rol con el que Postgres autenticó
-- el request. Confirmado con una función de debug:
--
--   fuera de la función:  session_user=postgres, current_user=service_role
--   DENTRO de la función: session_user=postgres, current_user=postgres
--
-- Con el guard original, las 4 RPCs habrían rechazado TODOS los llamados,
-- incluidos los legítimos de la edge function — habría quedado roto en
-- producción sin ningún error visible hasta el primer sync real.
--
-- `auth.role()` sí funciona: lee `request.jwt.claims` (un GUC de sesión),
-- que no lo toca el cambio de usuario de SECURITY DEFINER — mismo mecanismo
-- que `auth.uid()`, que ya usan todas las RPCs `is_admin` de este proyecto.
-- Confirmado con la misma función de debug: `auth.role()` devolvió
-- 'service_role' tanto adentro como afuera.
--
-- Se mantiene 20260819231000 tal como se aplicó (las migraciones registran
-- historia, no intención — mismo criterio que 20260819191750).
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
  IF auth.role() != 'service_role' THEN
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
  IF auth.role() != 'service_role' THEN
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
  IF auth.role() != 'service_role' THEN
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
  IF auth.role() != 'service_role' THEN
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
