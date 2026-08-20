-- ============================================================
-- Fase 1 (pivot): integración automatizada con Instagram Graph API
-- 2026-08-19
-- ------------------------------------------------------------
-- Reemplaza la carga manual del termómetro para Instagram por un flujo
-- automatizado: el admin conecta la cuenta UNA vez (OAuth desde
-- /dashboard/social) y desde ahí un cron diario la mantiene actualizada sin
-- intervención humana. TikTok y X siguen con carga manual (`source =
-- 'manual'` en social_metrics_daily, Fase 1 original) hasta que tengan su
-- propia integración — el esquema de social_metrics_daily/social_accounts
-- ya soportaba ambas fuentes desde el principio, así que esto no rompe nada
-- de lo ya construido.
--
-- Componentes:
--   1. Columnas nuevas en social_accounts: dónde vive el token (Vault, NUNCA
--      texto plano) y su vencimiento.
--   2. Secreto compartido en Vault + verify_instagram_sync_secret(): mismo
--      patrón que push_dispatch_secret / verify_push_webhook_secret
--      (20260711032948) — la edge function no lleva un JWT de Supabase
--      (verify_jwt=false), así que valida sola contra este secreto.
--   3. admin_connect_instagram_account() / admin_disconnect_instagram_account():
--      las únicas vías de escritura del token, llamadas desde el callback de
--      OAuth del dashboard.
--   4. Cron diario que invoca la edge function `instagram-sync` (Deno,
--      fuera de esta migración) vía pg_net.
--
-- Por qué el token vive en Vault y no en una columna `text` con RLS
-- admin-only: RLS controla FILAS, no protege el valor en un dump de la base
-- ni en un backup. Vault cifra el valor en reposo con una clave propia del
-- proyecto y sólo `service_role` puede leer `vault.decrypted_secrets` — ni
-- siquiera un admin autenticado por PostgREST puede verlo, sólo la edge
-- function (que corre con `service_role`, igual que push-dispatch).
--
-- Esto NO contradice "el service_role nunca llega al navegador" (§1.2 de
-- WEB_SPECIFICATION.md): la edge function es un contexto de servidor
-- confiable, igual que un Route Handler de Vercel — el principio protege al
-- NAVEGADOR, no prohíbe service_role en el backend.
-- ============================================================


-- ════════════════════════════════════════════════════════════
-- 1. Columnas de conexión en social_accounts
-- ════════════════════════════════════════════════════════════

ALTER TABLE public.social_accounts
  ADD COLUMN IF NOT EXISTS access_token_secret_id uuid REFERENCES vault.secrets(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS token_expires_at        timestamptz,
  ADD COLUMN IF NOT EXISTS last_synced_at          timestamptz,
  ADD COLUMN IF NOT EXISTS last_sync_error         text;

COMMENT ON COLUMN public.social_accounts.access_token_secret_id IS
  'Puntero a vault.secrets — el token en sí NUNCA se lee por PostgREST, sólo la edge function instagram-sync (service_role) vía vault.decrypted_secrets.';
COMMENT ON COLUMN public.social_accounts.token_expires_at IS
  'Vencimiento del token de larga duración de Instagram (60 días desde el último exchange/refresh). instagram-sync lo refresca solo si vence en menos de 7 días.';


-- ════════════════════════════════════════════════════════════
-- 2. Secreto compartido cron -> instagram-sync
-- ════════════════════════════════════════════════════════════
-- Mismo patrón que push_dispatch_secret: se crea con un placeholder y el
-- valor real se reemplaza fuera de esta migración (SQL Editor o Vault UI
-- del dashboard de Supabase) — NUNCA se versiona el secreto real en Git.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM vault.secrets WHERE name = 'instagram_sync_secret') THEN
    PERFORM vault.create_secret(
      '<REEMPLAZAR_EN_VAULT_ANTES_DE_USAR>',
      'instagram_sync_secret',
      'Secreto compartido entre el cron job y la edge function instagram-sync (header x-sync-secret)'
    );
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.verify_instagram_sync_secret(p_candidate text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_secret text;
BEGIN
  SELECT decrypted_secret INTO v_secret
  FROM vault.decrypted_secrets
  WHERE name = 'instagram_sync_secret';

  IF v_secret IS NULL OR p_candidate IS NULL THEN
    RETURN false;
  END IF;

  RETURN p_candidate = v_secret;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.verify_instagram_sync_secret(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.verify_instagram_sync_secret(text) TO service_role;


-- ════════════════════════════════════════════════════════════
-- 3. Conectar / desconectar la cuenta (llamadas desde el OAuth callback)
-- ════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.admin_connect_instagram_account(
  p_account_id        uuid,
  p_ig_user_id        text,
  p_username          text,
  p_access_token      text,
  p_expires_in_seconds int
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_platform      text;
  v_existing_id   uuid;
  v_secret_id     uuid;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE auth_user_id = auth.uid() AND is_admin = true
  ) THEN
    RAISE EXCEPTION 'NOT_AUTHORIZED: se requiere is_admin';
  END IF;

  SELECT platform, access_token_secret_id INTO v_platform, v_existing_id
  FROM public.social_accounts WHERE id = p_account_id;

  IF v_platform IS NULL THEN
    RAISE EXCEPTION 'ACCOUNT_NOT_FOUND: la cuenta no existe';
  END IF;

  IF v_platform != 'instagram' THEN
    RAISE EXCEPTION 'INVALID_PLATFORM: esta RPC solo conecta cuentas de instagram';
  END IF;

  IF p_access_token IS NULL OR btrim(p_access_token) = '' THEN
    RAISE EXCEPTION 'INVALID_INPUT: p_access_token es obligatorio';
  END IF;

  -- Reconectar reusa el mismo secreto (UPDATE) en vez de crear uno nuevo
  -- cada vez: evita acumular filas huérfanas en vault.secrets cada vez que
  -- el token vence y el admin tiene que volver a autorizar.
  IF v_existing_id IS NOT NULL THEN
    PERFORM vault.update_secret(v_existing_id, p_access_token);
    v_secret_id := v_existing_id;
  ELSE
    v_secret_id := vault.create_secret(
      p_access_token,
      'instagram_token_' || p_account_id::text,
      'Token de larga duración de Instagram Graph API para social_accounts.id = ' || p_account_id::text
    );
  END IF;

  UPDATE public.social_accounts
  SET
    external_id             = p_ig_user_id,
    handle                  = COALESCE(NULLIF(btrim(p_username), ''), handle),
    access_token_secret_id  = v_secret_id,
    token_expires_at        = now() + make_interval(secs => p_expires_in_seconds),
    last_sync_error         = NULL,
    is_active               = true
  WHERE id = p_account_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_connect_instagram_account(uuid, text, text, text, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_connect_instagram_account(uuid, text, text, text, int) TO authenticated;

COMMENT ON FUNCTION public.admin_connect_instagram_account(uuid, text, text, text, int) IS
  'Guarda el token de larga duración de Instagram en Vault y vincula la cuenta (is_admin). Llamada desde el callback de OAuth del dashboard, nunca desde el cliente directamente.';


CREATE OR REPLACE FUNCTION public.admin_disconnect_instagram_account(p_account_id uuid)
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

  IF NOT EXISTS (SELECT 1 FROM public.social_accounts WHERE id = p_account_id) THEN
    RAISE EXCEPTION 'ACCOUNT_NOT_FOUND: la cuenta no existe';
  END IF;

  -- No borra la fila de vault.secrets: ON DELETE SET NULL de la FK ya deja
  -- el token inaccesible desde acá, y borrar el secreto en sí no aporta
  -- nada — nadie más lo referencia y no vale la pena el riesgo de una
  -- operación DELETE extra en un flujo de desconexión.
  UPDATE public.social_accounts
  SET
    access_token_secret_id = NULL,
    token_expires_at       = NULL,
    last_synced_at         = NULL,
    last_sync_error        = NULL
  WHERE id = p_account_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_disconnect_instagram_account(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_disconnect_instagram_account(uuid) TO authenticated;

COMMENT ON FUNCTION public.admin_disconnect_instagram_account(uuid) IS
  'Desvincula el token de Instagram de una cuenta (is_admin). El histórico en social_metrics_daily no se toca.';


-- ════════════════════════════════════════════════════════════
-- 4. Cron diario -> instagram-sync (edge function)
-- ════════════════════════════════════════════════════════════
-- pg_cron corre como el rol que aplica la migración (postgres), que sí
-- puede leer vault.decrypted_secrets — a diferencia de una función
-- SECURITY DEFINER de un rol menor, acá no hace falta ningún wrapper.

SELECT cron.schedule(
  'instagram-daily-sync',
  '0 9 * * *',  -- 09:00 UTC todos los días
  $$
  SELECT net.http_post(
    url     := 'https://yusfykqimalghmmhlfdn.supabase.co/functions/v1/instagram-sync',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-sync-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'instagram_sync_secret')
    ),
    body    := '{}'::jsonb
  );
  $$
);
