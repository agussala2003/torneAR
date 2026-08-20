-- ============================================================
-- dashboard_logs_by_level — RPC de serie temporal para /dashboard/health
-- 2026-08-18
-- ------------------------------------------------------------
-- A diferencia de dashboard_feedback_inbox (20260818150000), esta RPC no
-- existe porque app_logs le falte una policy de SELECT — sí la tiene,
-- restringida a is_admin (app_logs_select_admin, 20260728200000). Existe
-- por lo que dice el principio de §1.2 de WEB_SPECIFICATION.md: la
-- agregación (contar por día y nivel) vive en Postgres, no en miles de
-- filas traídas al cliente para reducir en JS.
--
-- Devuelve un row por día en formato "ancho" (una columna por nivel), no
-- "largo" (day, level, count) — es el shape que un stacked bar/area chart
-- de Recharts puede consumir directo, sin pivotear en el cliente. Incluye
-- una fila por cada día del rango aunque tenga 0 logs (generate_series +
-- LEFT JOIN), para que el gráfico no tenga huecos.
-- ============================================================

CREATE OR REPLACE FUNCTION public.dashboard_logs_by_level(
  days int DEFAULT 30
)
RETURNS TABLE (
  day         date,
  info_count  bigint,
  warn_count  bigint,
  error_count bigint
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

  IF days IS NULL OR days < 1 OR days > 90 THEN
    days := 30;
  END IF;

  RETURN QUERY
  WITH date_series AS (
    SELECT generate_series(
      (current_date - (days - 1)),
      current_date,
      interval '1 day'
    )::date AS day
  )
  SELECT
    ds.day,
    COUNT(*) FILTER (WHERE l.level = 'info')  AS info_count,
    COUNT(*) FILTER (WHERE l.level = 'warn')  AS warn_count,
    COUNT(*) FILTER (WHERE l.level = 'error') AS error_count
  FROM date_series ds
  -- Rango sobre created_at (timestamptz), no `created_at::date = ds.day`:
  -- una comparación de rango puede usar app_logs_created_at_idx; castear
  -- cada fila a date para el JOIN no.
  LEFT JOIN public.app_logs l
    ON l.created_at >= ds.day::timestamptz
   AND l.created_at <  (ds.day + 1)::timestamptz
  GROUP BY ds.day
  ORDER BY ds.day;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.dashboard_logs_by_level(int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dashboard_logs_by_level(int) TO authenticated;

COMMENT ON FUNCTION public.dashboard_logs_by_level(int) IS
  'Serie temporal de app_logs por día y nivel para el gráfico de /dashboard/health (is_admin). Agregación en Postgres, no en el cliente — ver WEB_SPECIFICATION.md §1.2.';
