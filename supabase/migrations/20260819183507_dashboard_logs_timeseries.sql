-- ============================================================
-- dashboard_logs_timeseries — serie de logs con rango de fechas
-- 2026-08-19
-- ------------------------------------------------------------
-- Supersedes a dashboard_logs_by_level(int), que sólo sabe expresar
-- "últimos N días" anclados a hoy y topea en 90. El explorador de logs
-- ahora tiene filtro de rango (7d/30d/90d/YTD/personalizado) compartido con
-- el resto de los paneles, y un rango personalizado que termina en el
-- pasado es justamente lo que la firma vieja no puede pedir.
--
-- Misma convención que las demás series de 20260819181735: (p_from, p_to)
-- inclusive, NULL = últimos 30 días, tope de 366 días. Mismo formato
-- "ancho" (una columna por nivel) que consume el stacked bar de Recharts
-- sin pivotear en el cliente, y una fila por día aunque no haya logs.
--
-- La RPC existe por §1.2 de WEB_SPECIFICATION.md (la agregación vive en
-- Postgres), no por falta de permisos: app_logs sí tiene policy de SELECT
-- para admin (app_logs_select_admin), y la tabla paginada del explorador
-- la usa directo.
-- ============================================================

CREATE OR REPLACE FUNCTION public.dashboard_logs_timeseries(
  p_from date DEFAULT NULL,
  p_to   date DEFAULT NULL
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
  WITH date_series AS (
    SELECT generate_series(v_from, v_to, interval '1 day')::date AS day
  )
  SELECT
    ds.day,
    COUNT(l.id) FILTER (WHERE l.level = 'info')::bigint,
    COUNT(l.id) FILTER (WHERE l.level = 'warn')::bigint,
    COUNT(l.id) FILTER (WHERE l.level = 'error')::bigint
  FROM date_series ds
  LEFT JOIN public.app_logs l
    ON l.created_at >= ds.day::timestamptz
   AND l.created_at <  (ds.day + 1)::timestamptz
  GROUP BY ds.day
  ORDER BY ds.day;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.dashboard_logs_timeseries(date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dashboard_logs_timeseries(date, date) TO authenticated;

COMMENT ON FUNCTION public.dashboard_logs_timeseries(date, date) IS
  'Serie diaria de logs por nivel para /dashboard/health (is_admin). Rango inclusive, NULL = ultimos 30 dias, topeado en 366. Supersedes dashboard_logs_by_level(int).';

COMMENT ON FUNCTION public.dashboard_logs_by_level(int) IS
  'OBSOLETA: superseded por dashboard_logs_timeseries(date, date), que acepta rango arbitrario en vez de "ultimos N dias" anclados a hoy. Se mantiene hasta confirmar que ningun cliente desplegado la llama; entonces se puede DROP.';
