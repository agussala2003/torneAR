-- ============================================================
-- dashboard_feedback_inbox — RPC de lectura para el dashboard admin
-- 2026-08-18
-- ------------------------------------------------------------
-- `app_feedback` no tiene ninguna policy de SELECT, ni siquiera para admin
-- (ver 20260818140000_store_debt_account_reports_feedback.sql, comentario
-- final de la tabla: "sin SELECT vía PostgREST — se consume desde el
-- Dashboard de Supabase (service_role) o, a futuro, desde una policy
-- is_admin dedicada"). Esta RPC es esa vía dedicada: SECURITY DEFINER con
-- su propio chequeo de is_admin, en vez de una policy de RLS nueva —
-- mantiene la superficie de lectura de app_feedback auditable en un solo
-- lugar (WEB_SPECIFICATION.md §3.3, "Hallazgo de arquitectura importante").
-- ============================================================

CREATE OR REPLACE FUNCTION public.dashboard_feedback_inbox(
  limit_val  int DEFAULT 50,
  offset_val int DEFAULT 0
)
RETURNS TABLE (
  id          uuid,
  message     text,
  created_at  timestamptz,
  profile_id  uuid,
  full_name   text,
  username    text,
  avatar_url  text
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

  -- Clamps defensivos: esta función queda GRANT a `authenticated` (hace
  -- falta para que el cliente de sesión del dashboard la pueda invocar vía
  -- PostgREST); el chequeo de arriba ya bloquea a cualquier no-admin antes
  -- de llegar acá, pero un admin real pasando un valor fuera de rango por
  -- accidente no debería poder pedir de más.
  IF limit_val IS NULL OR limit_val < 1 OR limit_val > 200 THEN
    limit_val := 50;
  END IF;
  IF offset_val IS NULL OR offset_val < 0 THEN
    offset_val := 0;
  END IF;

  RETURN QUERY
  SELECT
    f.id,
    f.message,
    f.created_at,
    p.id,
    p.full_name,
    p.username,
    p.avatar_url
  FROM public.app_feedback f
  JOIN public.profiles p ON p.id = f.profile_id
  ORDER BY f.created_at DESC
  LIMIT limit_val
  OFFSET offset_val;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.dashboard_feedback_inbox(int, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dashboard_feedback_inbox(int, int) TO authenticated;

COMMENT ON FUNCTION public.dashboard_feedback_inbox(int, int) IS
  'Bandeja de feedback para /dashboard/moderation/feedback (is_admin). app_feedback no tiene policy de SELECT (ver 20260818140000) — este RPC SECURITY DEFINER es el único camino de lectura fuera del Dashboard de Supabase. Ver WEB_SPECIFICATION.md §3.3.';
