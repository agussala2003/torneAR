-- ============================================================
-- RPCs de service_role para la edge function instagram-sync
-- 2026-08-19
-- ------------------------------------------------------------
-- La edge function corre con la service_role key — no hay sesión de usuario,
-- así que `auth.uid()` es NULL. Las RPCs "admin_*" de la migración anterior
-- y `social_snapshot_upsert` (Fase 1 original) gatean con
-- `auth.uid() -> profiles.is_admin`, que SIEMPRE falla para este caller: no
-- es un bypass de RLS lo que hace falta (service_role ya la bypassea sola),
-- es que el propio cuerpo de esas funciones exige una sesión que no existe.
--
-- Por eso estas 3 son RPCs nuevas y separadas, no una modificación de las
-- existentes: mismo motivo por el que Fase 1 separó `dashboard_*` (lee) de
-- `admin_*` (escribe) — acá se separa "lo dispara un admin" de "lo dispara
-- un proceso automatizado", que son superficies de autorización distintas
-- aunque terminen tocando las mismas filas.
--
-- El guard de las tres es `session_user = 'service_role'` y no
-- `current_user`: son SECURITY DEFINER, así que `current_user` DENTRO de la
-- función es el dueño de la función (postgres), no quien la llamó.
-- `session_user` sí conserva el rol real con el que Postgres autenticó al
-- caller — `service_role` cuando el request usó la service_role key.
-- ============================================================


-- ─── 1. Leer el token decodificado (sólo lo usa instagram-sync) ──────────────

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
  IF session_user != 'service_role' THEN
    RAISE EXCEPTION 'NOT_AUTHORIZED: solo service_role';
  END IF;

  RETURN QUERY
  SELECT ds.decrypted_secret, sa.external_id, sa.token_expires_at
  FROM public.social_accounts sa
  JOIN vault.decrypted_secrets ds ON ds.id = sa.access_token_secret_id
  WHERE sa.id = p_account_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_instagram_token(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_instagram_token(uuid) TO service_role;

COMMENT ON FUNCTION public.get_instagram_token(uuid) IS
  'Devuelve el token de Instagram en texto plano. SOLO service_role — nunca exponer vía un rol que un admin autenticado pueda alcanzar.';


-- ─── 2. Guardar el token refrescado ────────────────────────────────────────

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
  IF session_user != 'service_role' THEN
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

REVOKE EXECUTE ON FUNCTION public.update_instagram_token(uuid, text, int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_instagram_token(uuid, text, int) TO service_role;


-- ─── 3. Marcar el resultado del intento de sync (éxito o error) ──────────────
-- Separada del upsert de métricas: un fallo de Instagram (rate limit, token
-- vencido) tiene que quedar visible en `social_accounts` aunque no haya
-- snapshot nuevo ese día.

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
  IF session_user != 'service_role' THEN
    RAISE EXCEPTION 'NOT_AUTHORIZED: solo service_role';
  END IF;

  UPDATE public.social_accounts
  SET last_synced_at  = now(),
      last_sync_error = p_error
  WHERE id = p_account_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.mark_instagram_sync(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mark_instagram_sync(uuid, text) TO service_role;


-- ─── 4. Escribir el snapshot del día, disparado por el proceso automatizado ──
-- Misma forma y misma idempotencia que `social_snapshot_upsert` (Fase 1),
-- deliberadamente NO reutilizada: esa RPC gatea con is_admin/auth.uid(), que
-- para este caller siempre es NULL. Dos RPCs de escritura angostas y
-- explícitas sobre quién puede llamar a cada una, en vez de una sola con un
-- chequeo condicional "is_admin OR service_role" que mezclaría dos
-- superficies de autorización distintas en un solo lugar.

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
  IF session_user != 'service_role' THEN
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

REVOKE EXECUTE ON FUNCTION public.service_snapshot_upsert(uuid, date, int, int, int, int, int, int, int, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.service_snapshot_upsert(uuid, date, int, int, int, int, int, int, int, jsonb) TO service_role;

COMMENT ON FUNCTION public.service_snapshot_upsert(uuid, date, int, int, int, int, int, int, int, jsonb) IS
  'Equivalente a social_snapshot_upsert (Fase 1) pero para callers service_role en vez de admin humano. source siempre queda en "api". Usada por instagram-sync.';
