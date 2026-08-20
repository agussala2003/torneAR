-- ============================================================
-- RPCs de Crecimiento y Actividad para el dashboard admin (Hito 5)
-- 2026-08-18
-- ------------------------------------------------------------
-- Mismo patrón que dashboard_feedback_inbox (20260818150000) y
-- dashboard_logs_by_level (20260818160000): SECURITY DEFINER con guard de
-- is_admin adentro, agregación en Postgres (§1.2 de
-- WEB_SPECIFICATION.md) — nunca miles de filas de profiles/matches
-- traídas al cliente para contar en JS.
--
-- Tres RPCs, cada una con su sección:
--   1. dashboard_growth_summary()       — top-line de §3.1.
--   2. dashboard_signups_timeseries()   — serie temporal de §3.1.
--   3. dashboard_matches_by_status()    — distribución de §3.4.
-- ============================================================


-- ════════════════════════════════════════════════════════════
-- 1. dashboard_growth_summary — totales históricos
-- ════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.dashboard_growth_summary()
RETURNS TABLE (
  profiles_count bigint,
  teams_count    bigint,
  matches_count  bigint
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

  -- Tres subqueries independientes, no un COUNT(*) con JOINs: profiles,
  -- teams y matches no tienen relación 1:1 entre sí, así que un JOIN
  -- multiplicaría filas y arruinaría los conteos. "Total histórico" incluye
  -- perfiles anonimizados por delete_own_account() a propósito — la fila
  -- sigue existiendo, sigue siendo un alta histórica real.
  RETURN QUERY
  SELECT
    (SELECT COUNT(*) FROM public.profiles) AS profiles_count,
    (SELECT COUNT(*) FROM public.teams)    AS teams_count,
    (SELECT COUNT(*) FROM public.matches)  AS matches_count;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.dashboard_growth_summary() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dashboard_growth_summary() TO authenticated;

COMMENT ON FUNCTION public.dashboard_growth_summary() IS
  'Top-line de /dashboard y /dashboard/growth (is_admin): totales históricos de profiles, teams y matches. Ver WEB_SPECIFICATION.md §3.1.';


-- ════════════════════════════════════════════════════════════
-- 2. dashboard_signups_timeseries — altas por día
-- ════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.dashboard_signups_timeseries(
  days int DEFAULT 30
)
RETURNS TABLE (
  day     date,
  signups bigint
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

  -- Tope más alto que dashboard_logs_by_level (365 vs 90): una tendencia de
  -- altas tiene sentido de producto mirada a un año; el volumen de
  -- profiles es bajo comparado con app_logs, así que el rango más largo no
  -- pesa.
  IF days IS NULL OR days < 1 OR days > 365 THEN
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
    COUNT(p.id) AS signups
  FROM date_series ds
  LEFT JOIN public.profiles p
    ON p.created_at >= ds.day::timestamptz
   AND p.created_at <  (ds.day + 1)::timestamptz
  GROUP BY ds.day
  ORDER BY ds.day;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.dashboard_signups_timeseries(int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dashboard_signups_timeseries(int) TO authenticated;

COMMENT ON FUNCTION public.dashboard_signups_timeseries(int) IS
  'Serie temporal de altas para el gráfico de /dashboard/growth (is_admin). Rellena días sin altas con 0 (generate_series + LEFT JOIN), igual criterio que dashboard_logs_by_level. Ver WEB_SPECIFICATION.md §3.1.';


-- ════════════════════════════════════════════════════════════
-- 3. dashboard_matches_by_status — distribución de partidos
-- ════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.dashboard_matches_by_status()
RETURNS TABLE (
  status        public.match_status,
  matches_count bigint
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

  -- unnest(enum_range(...)) en vez de `GROUP BY m.status` a secas: así el
  -- resultado siempre trae los 8 valores reales del enum (PENDIENTE,
  -- CONFIRMADO, EN_VIVO, FINALIZADO, EN_DISPUTA, WO_A, WO_B, CANCELADO —
  -- no el set desactualizado que tenía CLAUDE.md, ver WEB_SPECIFICATION.md
  -- §3.4), en su orden de declaración y con 0 en vez de ausentes para los
  -- estados sin partidos. Mismo criterio "sin huecos" que las dos RPCs de
  -- arriba.
  RETURN QUERY
  SELECT
    s.status,
    COUNT(m.id) AS matches_count
  FROM unnest(enum_range(NULL::public.match_status)) AS s(status)
  LEFT JOIN public.matches m ON m.status = s.status
  GROUP BY s.status
  ORDER BY s.status;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.dashboard_matches_by_status() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dashboard_matches_by_status() TO authenticated;

COMMENT ON FUNCTION public.dashboard_matches_by_status() IS
  'Distribución de partidos por status para /dashboard/activity (is_admin). Incluye los 8 valores del enum match_status con 0 para los que no tienen partidos. Ver WEB_SPECIFICATION.md §3.4.';
