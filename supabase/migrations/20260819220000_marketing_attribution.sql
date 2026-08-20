-- ============================================================
-- Fase 3 de Marketing & Growth: atribución de campañas
-- 2026-08-19
-- ------------------------------------------------------------
-- Objetivo: poder decir "esta alta vino de esta tarjeta de Instagram" y no
-- sólo "esta alta vino de este referente" (que ya existía, ver
-- 20260817180000_referral_system.sql).
--
-- Tabla nueva (`profile_attributions`) y NO columnas en `profiles`, a
-- propósito: `profiles` ya es una tabla ancha con grants por columna
-- cuidadosamente recortados (20260819100000) y `SELECT *` deniega la query
-- entera si se pide una columna no otorgada — sumar 3 columnas de marketing
-- ahí obliga a revisar ese recorte cada vez. La atribución además tiene un
-- ciclo de vida distinto: se escribe una sola vez al alta y no la lee nunca
-- el cliente, sólo el dashboard admin.
--
-- `referred_by` SIGUE viviendo en `profiles` — no se mueve. Esta migración
-- no lo toca; `dashboard_referral_summary`, `dashboard_top_referrers` y
-- `UsersTable` no cambian.
--
-- La escritura reutiliza `set_referral`, extendida con 3 parámetros UTM
-- opcionales, en vez de crear una RPC aparte: es el mismo momento del
-- onboarding, el mismo "de dónde vino este usuario", y evita un segundo
-- viaje a la red en el caso común (el link de una tarjeta del Content
-- Factory trae username Y utm en la misma URL). La firma cambia de
-- `set_referral(text)` a `set_referral(text, text, text, text)`; se dropea
-- la vieja explícitamente para no dejar dos overloads conviviendo.
-- ============================================================

-- ─── 1. Tabla ────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.profile_attributions (
  profile_id   uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  utm_source   text,
  utm_medium   text,
  utm_campaign text,
  created_at   timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.profile_attributions IS
  'Atribución de marketing (UTM) de cada perfil, escrita una sola vez al onboarding vía set_referral. SELECT solo para profiles.is_admin; el cliente nunca la lee.';

ALTER TABLE public.profile_attributions ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON public.profile_attributions TO authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.profile_attributions FROM anon, authenticated;
REVOKE ALL ON public.profile_attributions FROM anon;

DROP POLICY IF EXISTS "profile_attributions_select_admin" ON public.profile_attributions;
CREATE POLICY "profile_attributions_select_admin"
  ON public.profile_attributions FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.auth_user_id = (SELECT auth.uid())
        AND p.is_admin = true
    )
  );

-- ─── 2. set_referral, extendida con UTM ───────────────────────────────────────
-- Misma función, misma idempotencia para referred_by (sin tocar esa lógica),
-- más un bloque nuevo e INDEPENDIENTE para la atribución: un link sin
-- username pero con utm (ej. un bio-link genérico a futuro) tiene que poder
-- registrar de dónde vino igual, así que el bloque de atribución corre
-- ANTES del posible RETURN por "sin username" de más abajo.
--
-- La atribución es write-once igual que referred_by (ON CONFLICT DO
-- NOTHING): la campaña que cuenta es la del primer link que se tocó, no la
-- del último `set_referral` que corra antes de terminar el onboarding.

DROP FUNCTION IF EXISTS public.set_referral(text);

CREATE OR REPLACE FUNCTION public.set_referral(
  p_referred_by_username text,
  p_utm_source   text DEFAULT NULL,
  p_utm_medium   text DEFAULT NULL,
  p_utm_campaign text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_caller_id     uuid;
  v_referrer_id   uuid;
  v_already_set   boolean;
  v_utm_source    text;
  v_utm_medium    text;
  v_utm_campaign  text;
BEGIN
  SELECT id INTO v_caller_id FROM profiles WHERE auth_user_id = auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'PROFILE_NOT_FOUND: perfil no encontrado para el usuario actual';
  END IF;

  -- ── Atribución de marketing (independiente del referido) ────────────────
  v_utm_source   := NULLIF(btrim(COALESCE(p_utm_source, '')), '');
  v_utm_medium   := NULLIF(btrim(COALESCE(p_utm_medium, '')), '');
  v_utm_campaign := NULLIF(btrim(COALESCE(p_utm_campaign, '')), '');

  IF v_utm_source IS NOT NULL OR v_utm_medium IS NOT NULL OR v_utm_campaign IS NOT NULL THEN
    INSERT INTO profile_attributions (profile_id, utm_source, utm_medium, utm_campaign)
    VALUES (v_caller_id, v_utm_source, v_utm_medium, v_utm_campaign)
    ON CONFLICT (profile_id) DO NOTHING;
  END IF;

  -- ── Referido (lógica original, sin cambios) ──────────────────────────────
  -- Sin código: no-op silencioso, no es un error.
  IF p_referred_by_username IS NULL OR btrim(p_referred_by_username) = '' THEN
    RETURN;
  END IF;

  SELECT id INTO v_referrer_id
  FROM profiles
  WHERE lower(username) = lower(btrim(p_referred_by_username));

  -- Username inexistente o auto-referido: no-op silencioso.
  IF v_referrer_id IS NULL OR v_referrer_id = v_caller_id THEN
    RETURN;
  END IF;

  -- Idempotente: la primera asignación gana, un segundo llamado no pisa la
  -- anterior (protege contra un usuario que reabre el link de otro referente
  -- después de haber completado el onboarding con uno distinto).
  SELECT (referred_by IS NOT NULL) INTO v_already_set
  FROM profiles WHERE id = v_caller_id;

  IF v_already_set THEN
    RETURN;
  END IF;

  UPDATE profiles SET referred_by = v_referrer_id WHERE id = v_caller_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.set_referral(text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_referral(text, text, text, text) TO authenticated;

COMMENT ON FUNCTION public.set_referral(text, text, text, text) IS
  'Asigna profiles.referred_by (idempotente, primera asignación gana) y registra profile_attributions (idempotente, write-once) en la misma llamada. Ambos bloques son independientes: un username inválido no impide guardar el UTM, y viceversa. No-op silencioso ante cualquier dato inválido — nunca bloquea el onboarding. Reemplaza a set_referral(text).';

-- ─── 3. dashboard_attribution_stats — breakdown para /dashboard/growth ────────
-- Agrupa por (utm_source, utm_campaign) — no sólo por source — para que el
-- dashboard pueda mostrar tanto "de dónde" (agregando por canal en JS) como
-- "qué campaña dentro de ese canal" sin una segunda RPC. Los altas sin fila
-- en profile_attributions caen en el bucket 'organico': no tener UTM es un
-- dato real (nadie los mandó desde una campaña), no una ausencia a ocultar.

CREATE OR REPLACE FUNCTION public.dashboard_attribution_stats(
  p_from date DEFAULT NULL,
  p_to   date DEFAULT NULL
)
RETURNS TABLE (
  utm_source   text,
  utm_campaign text,
  signups      bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_from date;
  v_to   date;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE auth_user_id = auth.uid() AND is_admin = true
  ) THEN
    RAISE EXCEPTION 'NOT_AUTHORIZED: se requiere is_admin';
  END IF;

  v_to   := COALESCE(p_to, current_date);
  v_from := COALESCE(p_from, v_to - 29);

  IF v_from > v_to THEN
    RAISE EXCEPTION 'INVALID_RANGE: p_from debe ser anterior o igual a p_to';
  END IF;

  IF v_to - v_from > 366 THEN
    v_from := v_to - 366;
  END IF;

  RETURN QUERY
  SELECT
    COALESCE(pa.utm_source, 'organico'),
    pa.utm_campaign,
    COUNT(*)::bigint
  FROM public.profiles p
  LEFT JOIN public.profile_attributions pa ON pa.profile_id = p.id
  WHERE p.created_at::date BETWEEN v_from AND v_to
  GROUP BY COALESCE(pa.utm_source, 'organico'), pa.utm_campaign
  ORDER BY COUNT(*) DESC, COALESCE(pa.utm_source, 'organico');
END;
$$;

REVOKE EXECUTE ON FUNCTION public.dashboard_attribution_stats(date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dashboard_attribution_stats(date, date) TO authenticated;

COMMENT ON FUNCTION public.dashboard_attribution_stats(date, date) IS
  'Altas agrupadas por utm_source + utm_campaign para /dashboard/growth (is_admin). Sin atribución = "organico". Rango inclusive sobre profiles.created_at, NULL = últimos 30 días, topeado en 366.';
