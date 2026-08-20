-- ============================================================
-- Fix: `is_admin` ambiguo en dashboard_users_list
-- 2026-08-19
-- ------------------------------------------------------------
-- `is_admin` es a la vez una columna de `public.profiles` y un parámetro de
-- salida de esta función (está en el `RETURNS TABLE`). Dentro del cuerpo
-- plpgsql, una referencia sin calificar es ambigua y Postgres aborta con
--
--     42702: column reference "is_admin" is ambiguous
--
-- Lo traicionero es CUÁNDO falla: `CREATE FUNCTION` no valida el cuerpo, así
-- que la función se creó sin una queja y el error recién apareció al
-- ejecutarla. Por eso esta migración va separada de la que la creó
-- (20260819191657) en vez de corregirla en su lugar: las dos se aplicaron a
-- producción en ese orden, y un archivo de migración registra lo que pasó, no
-- lo que hubiera estado bien.
--
-- Dos cambios:
--   a) el guard usa el alias `gp.` — era el único lugar donde `is_admin`
--      estaba suelto;
--   b) el CTE `filtered` renombra sus columnas con prefijo `u_`, para que
--      ninguna vuelva a colisionar con un parámetro de salida si mañana se
--      agrega uno.
-- ============================================================

CREATE OR REPLACE FUNCTION public.dashboard_users_list(
  p_search text DEFAULT NULL,
  p_status text DEFAULT 'all',
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
    SELECT 1 FROM public.profiles gp
    WHERE gp.auth_user_id = auth.uid() AND gp.is_admin = true
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
      p.username        AS u_username,
      p.full_name       AS u_full_name,
      p.zone            AS u_zone,
      p.avatar_url      AS u_avatar_url,
      p.created_at      AS u_created_at,
      p.is_admin        AS u_is_admin,
      au.banned_until   AS u_banned_until,
      (au.banned_until IS NOT NULL AND au.banned_until > now()) AS u_suspended,
      ref.username      AS u_referrer
    FROM public.profiles p
    LEFT JOIN auth.users au ON au.id = p.auth_user_id
    LEFT JOIN public.profiles ref ON ref.id = p.referred_by
    WHERE
      (v_search IS NULL
        OR p.username  ILIKE v_search
        OR p.full_name ILIKE v_search)
      AND (
        p_status = 'all'
        OR (p_status = 'admin'     AND p.is_admin)
        OR (p_status = 'suspended' AND au.banned_until IS NOT NULL AND au.banned_until > now())
        OR (p_status = 'active'    AND (au.banned_until IS NULL OR au.banned_until <= now()))
      )
  )
  SELECT
    f.id,
    f.u_username,
    f.u_full_name,
    f.u_zone,
    f.u_avatar_url,
    f.u_created_at,
    f.u_is_admin,
    f.u_suspended,
    f.u_banned_until,
    (SELECT COUNT(*) FROM public.team_members tm WHERE tm.profile_id = f.id)::bigint,
    (SELECT COUNT(*) FROM public.match_participants mp WHERE mp.profile_id = f.id)::bigint,
    f.u_referrer,
    COUNT(*) OVER ()::bigint
  FROM filtered f
  ORDER BY f.u_created_at DESC
  LIMIT p_limit OFFSET p_offset;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.dashboard_users_list(text, text, int, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dashboard_users_list(text, text, int, int) TO authenticated;
