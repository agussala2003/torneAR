-- ============================================================
-- Limpieza + módulo de Usuarios + panel de Viralidad
-- 2026-08-19
-- ------------------------------------------------------------
--   1. pg_trgm + índice GIN sobre app_logs.message (búsqueda del explorador).
--   2. DROP de las dos RPCs superseded que ya nadie llama.
--   3. dashboard_referral_summary() / dashboard_top_referrers() — Viralidad.
--   4. dashboard_users_list() — listado paginado para Gestión de usuarios.
--   5. admin_set_admin_flag() — otorgar/revocar is_admin desde la UI.
-- ============================================================


-- ════════════════════════════════════════════════════════════
-- 1. Búsqueda indexada en el explorador de logs
-- ════════════════════════════════════════════════════════════
-- El explorador filtra con `message ILIKE '%texto%'`. Un patrón con comodín
-- a la izquierda no puede usar un btree, así que hasta acá era seq-scan.
-- El índice GIN de trigramas sí lo cubre.
--
-- La extensión va al schema `extensions`, que es la convención de Supabase
-- (no `public`, para no mezclar objetos de extensión con el schema expuesto
-- por PostgREST).

CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;

CREATE INDEX IF NOT EXISTS app_logs_message_trgm_idx
  ON public.app_logs USING gin (message extensions.gin_trgm_ops);


-- ════════════════════════════════════════════════════════════
-- 2. Baja de las RPCs superseded
-- ════════════════════════════════════════════════════════════
-- dashboard_signups_timeseries(int) → dashboard_growth_timeseries(date,date)
-- dashboard_logs_by_level(int)      → dashboard_logs_timeseries(date,date)
--
-- Se dropean ahora y no antes porque el reemplazo ya está desplegado y
-- verificado: ningún archivo del dashboard las referencia. Eran las dos
-- únicas RPCs `dashboard_*` sin consumidor.

DROP FUNCTION IF EXISTS public.dashboard_signups_timeseries(int);
DROP FUNCTION IF EXISTS public.dashboard_logs_by_level(int);


-- ════════════════════════════════════════════════════════════
-- 3. Viralidad
-- ════════════════════════════════════════════════════════════
-- El panel existía como empty-state estático porque hoy hay 0 filas con
-- `referred_by`. Estas RPCs lo dejan listo para cuando las haya: mientras
-- el sistema de referidos no se use devuelven ceros, que es un dato real y
-- no un placeholder.

CREATE OR REPLACE FUNCTION public.dashboard_referral_summary()
RETURNS TABLE (
  total_profiles   bigint,
  referred_count   bigint,
  referrer_count   bigint,
  ambassador_count bigint,
  referral_rate    numeric
)
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

  RETURN QUERY
  SELECT
    (SELECT COUNT(*) FROM public.profiles)::bigint,
    (SELECT COUNT(*) FROM public.profiles WHERE referred_by IS NOT NULL)::bigint,
    -- Cuántas personas distintas trajeron al menos a alguien. No es lo mismo
    -- que `referred_count`: un solo embajador muy activo infla el primero y
    -- deja este en 1, y esa diferencia es justamente lo que dice si el canal
    -- se sostiene solo o depende de una persona.
    (SELECT COUNT(DISTINCT referred_by) FROM public.profiles WHERE referred_by IS NOT NULL)::bigint,
    (SELECT COUNT(*) FROM public.profile_badges pb
       JOIN public.badges b ON b.id = pb.badge_id
      WHERE b.slug = 'embajador')::bigint,
    -- NULL y no 0 cuando no hay perfiles: sin base, la tasa no existe.
    (SELECT ROUND(
              COUNT(*) FILTER (WHERE referred_by IS NOT NULL)::numeric
              / NULLIF(COUNT(*), 0) * 100, 1)
       FROM public.profiles);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.dashboard_referral_summary() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dashboard_referral_summary() TO authenticated;

COMMENT ON FUNCTION public.dashboard_referral_summary() IS
  'Top-line de /dashboard/viral (is_admin): perfiles referidos, referidores distintos, embajadores y tasa de referidos. Ver WEB_SPECIFICATION.md 3.2.';


CREATE OR REPLACE FUNCTION public.dashboard_top_referrers(
  p_limit int DEFAULT 10
)
RETURNS TABLE (
  profile_id     uuid,
  username       text,
  full_name      text,
  referred_count bigint,
  is_ambassador  boolean
)
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

  IF p_limit IS NULL OR p_limit < 1 OR p_limit > 100 THEN
    p_limit := 10;
  END IF;

  RETURN QUERY
  SELECT
    r.id,
    r.username,
    r.full_name,
    COUNT(p.id)::bigint,
    EXISTS (
      SELECT 1 FROM public.profile_badges pb
        JOIN public.badges b ON b.id = pb.badge_id
       WHERE pb.profile_id = r.id AND b.slug = 'embajador'
    )
  FROM public.profiles p
  JOIN public.profiles r ON r.id = p.referred_by
  WHERE p.referred_by IS NOT NULL
  GROUP BY r.id, r.username, r.full_name
  ORDER BY COUNT(p.id) DESC, r.username
  LIMIT p_limit;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.dashboard_top_referrers(int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dashboard_top_referrers(int) TO authenticated;

COMMENT ON FUNCTION public.dashboard_top_referrers(int) IS
  'Ranking de embajadores para /dashboard/viral (is_admin). Vacio mientras no haya referidos.';


-- ════════════════════════════════════════════════════════════
-- 4. Listado de usuarios
-- ════════════════════════════════════════════════════════════
-- Existe como RPC y no como query directa por dos razones que se suman:
-- el estado de suspensión vive en `auth.users.banned_until`, que PostgREST
-- no expone; y los conteos de equipos y partidos son agregaciones que por
-- §1.2 de WEB_SPECIFICATION.md van en Postgres, no en N+1 desde Next.
--
-- `total_count` viaja repetido en cada fila (window function sobre el set
-- filtrado, antes del LIMIT). Es el precio de devolver página y total en un
-- solo viaje; la alternativa era una segunda RPC de conteo que tendría que
-- repetir exactamente los mismos filtros y podría desincronizarse.
--
-- NO devuelve `auth_user_id`, `date_of_birth` ni `expo_push_token`: el
-- dashboard no los necesita y la migración 20260819100000 los sacó a
-- propósito del alcance de lectura.

CREATE OR REPLACE FUNCTION public.dashboard_users_list(
  p_search text DEFAULT NULL,
  p_status text DEFAULT 'all',   -- all | active | suspended | admin
  p_limit  int  DEFAULT 25,
  p_offset int  DEFAULT 0
)
RETURNS TABLE (
  profile_id      uuid,
  username        text,
  full_name       text,
  zone            text,
  avatar_url      text,
  created_at      timestamptz,
  is_admin        boolean,
  is_suspended    boolean,
  banned_until    timestamptz,
  teams_count     bigint,
  matches_count   bigint,
  referred_by_username text,
  total_count     bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_search text;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE auth_user_id = auth.uid() AND is_admin = true
  ) THEN
    RAISE EXCEPTION 'NOT_AUTHORIZED: se requiere is_admin';
  END IF;

  IF p_limit IS NULL OR p_limit < 1 OR p_limit > 100 THEN
    p_limit := 25;
  END IF;

  IF p_offset IS NULL OR p_offset < 0 THEN
    p_offset := 0;
  END IF;

  IF p_status IS NULL OR p_status NOT IN ('all', 'active', 'suspended', 'admin') THEN
    p_status := 'all';
  END IF;

  -- Los comodines de LIKE que venga tipeando el admin se neutralizan acá:
  -- buscar "100%" tiene que buscar ese texto, no todo lo que empieza con 100.
  v_search := NULLIF(TRIM(COALESCE(p_search, '')), '');
  IF v_search IS NOT NULL THEN
    v_search := '%' || REPLACE(REPLACE(REPLACE(v_search, '\', '\\'), '%', '\%'), '_', '\_') || '%';
  END IF;

  RETURN QUERY
  WITH filtered AS (
    SELECT
      p.id,
      p.username,
      p.full_name,
      p.zone,
      p.avatar_url,
      p.created_at,
      p.is_admin,
      u.banned_until,
      (u.banned_until IS NOT NULL AND u.banned_until > now()) AS suspended,
      ref.username AS referrer_username
    FROM public.profiles p
    LEFT JOIN auth.users u ON u.id = p.auth_user_id
    LEFT JOIN public.profiles ref ON ref.id = p.referred_by
    WHERE
      (v_search IS NULL
        OR p.username  ILIKE v_search
        OR p.full_name ILIKE v_search)
      AND (
        p_status = 'all'
        OR (p_status = 'admin'     AND p.is_admin)
        OR (p_status = 'suspended' AND u.banned_until IS NOT NULL AND u.banned_until > now())
        OR (p_status = 'active'    AND (u.banned_until IS NULL OR u.banned_until <= now()))
      )
  )
  SELECT
    f.id,
    f.username,
    f.full_name,
    f.zone,
    f.avatar_url,
    f.created_at,
    f.is_admin,
    f.suspended,
    f.banned_until,
    (SELECT COUNT(*) FROM public.team_members tm WHERE tm.profile_id = f.id)::bigint,
    (SELECT COUNT(*) FROM public.match_participants mp WHERE mp.profile_id = f.id)::bigint,
    f.referrer_username,
    COUNT(*) OVER ()::bigint
  FROM filtered f
  ORDER BY f.created_at DESC
  LIMIT p_limit OFFSET p_offset;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.dashboard_users_list(text, text, int, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dashboard_users_list(text, text, int, int) TO authenticated;

COMMENT ON FUNCTION public.dashboard_users_list(text, text, int, int) IS
  'Listado paginado de usuarios para /dashboard/users (is_admin): identidad, estado de suspension (auth.users), conteos de equipos y partidos, y quien lo refirio. total_count viaja repetido por fila (window function pre-LIMIT).';


-- ════════════════════════════════════════════════════════════
-- 5. Otorgar / revocar is_admin
-- ════════════════════════════════════════════════════════════
-- Cierra el punto de Hito 7+ de WEB_SPECIFICATION.md y el riesgo de bus
-- factor: hasta ahora crear un segundo admin exigía SQL a mano.
--
-- Tres guardas, todas server-side, porque esto es escalación de privilegios:
--   a) quien llama tiene que ser admin;
--   b) nadie puede cambiarse el flag a sí mismo — ni darse ni sacarse. Sacarse
--      el flag es la forma más fácil de quedar afuera del dashboard sin poder
--      volver a entrar;
--   c) no se puede revocar al último admin que queda.

CREATE OR REPLACE FUNCTION public.admin_set_admin_flag(
  p_profile_id uuid,
  p_is_admin   boolean
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_caller_profile_id uuid;
  v_target_is_admin   boolean;
  v_admin_count       int;
BEGIN
  SELECT id INTO v_caller_profile_id
  FROM public.profiles
  WHERE auth_user_id = auth.uid() AND is_admin = true;

  IF v_caller_profile_id IS NULL THEN
    RAISE EXCEPTION 'NOT_AUTHORIZED: se requiere is_admin';
  END IF;

  IF p_profile_id IS NULL OR p_is_admin IS NULL THEN
    RAISE EXCEPTION 'INVALID_INPUT: p_profile_id y p_is_admin son obligatorios';
  END IF;

  IF p_profile_id = v_caller_profile_id THEN
    RAISE EXCEPTION 'CANNOT_CHANGE_SELF: un admin no puede cambiar su propio flag';
  END IF;

  SELECT is_admin INTO v_target_is_admin
  FROM public.profiles WHERE id = p_profile_id;

  IF v_target_is_admin IS NULL THEN
    RAISE EXCEPTION 'PROFILE_NOT_FOUND: el perfil no existe';
  END IF;

  -- Sin cambio real: se sale sin escribir, para no ensuciar updated_at ni
  -- generar un log de auditoría de algo que no pasó.
  IF v_target_is_admin = p_is_admin THEN
    RETURN;
  END IF;

  IF p_is_admin = false THEN
    SELECT COUNT(*) INTO v_admin_count FROM public.profiles WHERE is_admin = true;
    IF v_admin_count <= 1 THEN
      RAISE EXCEPTION 'LAST_ADMIN: no se puede revocar al ultimo administrador';
    END IF;
  END IF;

  UPDATE public.profiles SET is_admin = p_is_admin WHERE id = p_profile_id;

  INSERT INTO public.app_logs (level, message, details, user_id)
  VALUES (
    'warn',
    CASE WHEN p_is_admin THEN 'Se otorgo is_admin' ELSE 'Se revoco is_admin' END,
    jsonb_build_object(
      'scope', 'admin.set_admin_flag',
      'target_profile_id', p_profile_id,
      'granted', p_is_admin,
      'by_profile_id', v_caller_profile_id
    ),
    auth.uid()
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_set_admin_flag(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_admin_flag(uuid, boolean) TO authenticated;

COMMENT ON FUNCTION public.admin_set_admin_flag(uuid, boolean) IS
  'Otorga o revoca profiles.is_admin (is_admin). Guardas: no sobre uno mismo, no al ultimo admin. Deja rastro en app_logs con nivel warn.';
