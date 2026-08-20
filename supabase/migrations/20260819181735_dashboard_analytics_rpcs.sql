-- ============================================================
-- RPCs de Analítica ampliada para el dashboard admin
-- 2026-08-19
-- ------------------------------------------------------------
-- Continúa el patrón de 20260818170000_dashboard_growth_activity_rpcs:
-- SECURITY DEFINER con guard de is_admin adentro y agregación en Postgres
-- (§1.2 de WEB_SPECIFICATION.md). El guard se repite inline en cada
-- función en vez de factorizarse en un helper — es la forma que ya usan
-- las ~8 RPCs de dashboard/admin existentes, y una función auxiliar
-- SECURITY DEFINER sería una superficie más que auditar por una ganancia
-- de seis líneas.
--
-- Cinco RPCs:
--   1. dashboard_overview_kpis()          — top-line accionable del Resumen.
--   2. dashboard_growth_timeseries()      — altas de usuarios Y equipos, rango libre.
--   3. dashboard_activity_timeseries()    — partidos creados/agendados/finalizados.
--   4. dashboard_checkin_timeseries()     — participación y tasa de check-in.
--   5. dashboard_market_timeseries()      — uso del mercado de pases.
--   6. dashboard_retention_cohorts()      — activación por cohorte semanal.
--
-- Convención de rangos: todas las series toman (p_from, p_to) como fechas
-- inclusive. NULL cae a los últimos 30 días. El rango se topea en 366 días
-- para que un `?from=1970-01-01` en la URL no dispare un generate_series de
-- 20.000 filas.
-- ============================================================


-- ════════════════════════════════════════════════════════════
-- 1. dashboard_overview_kpis — qué requiere atención hoy
-- ════════════════════════════════════════════════════════════
-- Reemplaza en el Resumen a los tres totales crudos de
-- dashboard_growth_summary (que sigue existiendo y se sigue usando en
-- /dashboard/growth). Cada métrica "7d" viene con su par "prev_7d" para
-- que la UI pueda pintar la variación sin una segunda llamada.

CREATE OR REPLACE FUNCTION public.dashboard_overview_kpis()
RETURNS TABLE (
  matches_today           bigint,
  matches_live            bigint,
  matches_upcoming_7d     bigint,
  disputes_pending        bigint,
  wo_claims_pending       bigint,
  reports_pending         bigint,
  errors_24h              bigint,
  errors_prev_24h         bigint,
  signups_7d              bigint,
  signups_prev_7d         bigint,
  matches_created_7d      bigint,
  matches_created_prev_7d bigint,
  active_teams            bigint,
  total_teams             bigint,
  checkin_rate_30d        numeric
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
    -- Partidos agendados para hoy, en cualquier estado salvo cancelado:
    -- lo que el admin necesita saber es cuántos hay en juego, no cuántos
    -- se dieron de baja.
    (SELECT COUNT(*) FROM public.matches
      WHERE scheduled_at::date = current_date
        AND status <> 'CANCELADO')::bigint,

    (SELECT COUNT(*) FROM public.matches WHERE status = 'EN_VIVO')::bigint,

    (SELECT COUNT(*) FROM public.matches
      WHERE scheduled_at >= now()
        AND scheduled_at < now() + interval '7 days'
        AND status IN ('PENDIENTE', 'CONFIRMADO'))::bigint,

    (SELECT COUNT(*) FROM public.matches WHERE status = 'EN_DISPUTA')::bigint,

    (SELECT COUNT(*) FROM public.wo_claims
      WHERE status = 'PENDIENTE_REVISION')::bigint,

    (SELECT COUNT(*) FROM public.content_reports
      WHERE status = 'PENDING')::bigint,

    (SELECT COUNT(*) FROM public.app_logs
      WHERE level = 'error'
        AND created_at >= now() - interval '24 hours')::bigint,

    -- Las 24h anteriores a esas, para la variación. Ventana cerrada por
    -- los dos lados: sin el límite superior contaría también las últimas
    -- 24h y la comparación daría siempre positiva.
    (SELECT COUNT(*) FROM public.app_logs
      WHERE level = 'error'
        AND created_at >= now() - interval '48 hours'
        AND created_at <  now() - interval '24 hours')::bigint,

    (SELECT COUNT(*) FROM public.profiles
      WHERE created_at >= now() - interval '7 days')::bigint,

    (SELECT COUNT(*) FROM public.profiles
      WHERE created_at >= now() - interval '14 days'
        AND created_at <  now() - interval '7 days')::bigint,

    (SELECT COUNT(*) FROM public.matches
      WHERE created_at >= now() - interval '7 days')::bigint,

    (SELECT COUNT(*) FROM public.matches
      WHERE created_at >= now() - interval '14 days'
        AND created_at <  now() - interval '7 days')::bigint,

    (SELECT COUNT(*) FROM public.teams WHERE is_active)::bigint,
    (SELECT COUNT(*) FROM public.teams)::bigint,

    -- Tasa de check-in: convocados que efectivamente marcaron presencia,
    -- sobre partidos de los últimos 30 días. NULLIF evita la división por
    -- cero cuando no hubo ningún partido en la ventana — devuelve NULL, y
    -- la UI distingue "no hubo partidos" de "0%", que no es lo mismo.
    (SELECT ROUND(
              COUNT(*) FILTER (WHERE mp.did_checkin)::numeric
              / NULLIF(COUNT(*), 0) * 100, 1)
       FROM public.match_participants mp
       JOIN public.matches m ON m.id = mp.match_id
      WHERE COALESCE(m.started_at, m.scheduled_at, m.created_at)
            >= now() - interval '30 days');
END;
$$;

REVOKE EXECUTE ON FUNCTION public.dashboard_overview_kpis() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dashboard_overview_kpis() TO authenticated;

COMMENT ON FUNCTION public.dashboard_overview_kpis() IS
  'KPIs accionables de /dashboard (is_admin): colas pendientes, actividad de hoy, altas y errores con su período previo para variación, y tasa de check-in a 30 días. Ver WEB_SPECIFICATION.md §3.1.';


-- ════════════════════════════════════════════════════════════
-- 2. dashboard_growth_timeseries — altas de usuarios y equipos
-- ════════════════════════════════════════════════════════════
-- Supersedes a dashboard_signups_timeseries(int), que sigue existiendo
-- para no romper un cliente desplegado a mitad de camino. Dos diferencias:
-- rango de fechas arbitrario en vez de "últimos N días", y equipos además
-- de usuarios — un alta de equipo es la señal de crecimiento que de verdad
-- importa en un producto donde nadie juega solo.

CREATE OR REPLACE FUNCTION public.dashboard_growth_timeseries(
  p_from date DEFAULT NULL,
  p_to   date DEFAULT NULL
)
RETURNS TABLE (
  day      date,
  signups  bigint,
  teams    bigint
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

  -- Tope duro del rango, no error: un filtro de fechas en la URL es
  -- entrada del usuario y no tiene por qué romper la página. Se recorta la
  -- ventana al último año y se sigue.
  IF v_to - v_from > 366 THEN
    v_from := v_to - 366;
  END IF;

  RETURN QUERY
  WITH date_series AS (
    SELECT generate_series(v_from, v_to, interval '1 day')::date AS day
  )
  SELECT
    ds.day,
    (SELECT COUNT(*) FROM public.profiles p
      WHERE p.created_at >= ds.day::timestamptz
        AND p.created_at <  (ds.day + 1)::timestamptz)::bigint,
    (SELECT COUNT(*) FROM public.teams t
      WHERE t.created_at >= ds.day::timestamptz
        AND t.created_at <  (ds.day + 1)::timestamptz)::bigint
  FROM date_series ds
  ORDER BY ds.day;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.dashboard_growth_timeseries(date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dashboard_growth_timeseries(date, date) TO authenticated;

COMMENT ON FUNCTION public.dashboard_growth_timeseries(date, date) IS
  'Serie de altas de usuarios y equipos por día para /dashboard/growth (is_admin). Rango inclusive, NULL = últimos 30 días, topeado en 366. Rellena días sin altas con 0. Supersedes dashboard_signups_timeseries(int).';

COMMENT ON FUNCTION public.dashboard_signups_timeseries(int) IS
  'OBSOLETA: superseded por dashboard_growth_timeseries(date, date), que agrega equipos y rango arbitrario. Se mantiene hasta confirmar que ningún cliente desplegado la llama; entonces se puede DROP.';


-- ════════════════════════════════════════════════════════════
-- 3. dashboard_activity_timeseries — el ciclo de vida del partido
-- ════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.dashboard_activity_timeseries(
  p_from date DEFAULT NULL,
  p_to   date DEFAULT NULL
)
RETURNS TABLE (
  day                date,
  matches_created    bigint,
  matches_scheduled  bigint,
  matches_finished   bigint
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

  -- Tres columnas y no cuatro: NO hay serie de cancelados a propósito.
  -- `matches` no tiene `cancelled_at`, así que la única fecha disponible
  -- para un CANCELADO sería `updated_at`, que cualquier escritura posterior
  -- mueve. Una serie que se corre sola con el tiempo es peor que no tenerla
  -- — el total por estado sigue estando en dashboard_matches_by_status.
  RETURN QUERY
  WITH date_series AS (
    SELECT generate_series(v_from, v_to, interval '1 day')::date AS day
  )
  SELECT
    ds.day,
    (SELECT COUNT(*) FROM public.matches m
      WHERE m.created_at >= ds.day::timestamptz
        AND m.created_at <  (ds.day + 1)::timestamptz)::bigint,
    (SELECT COUNT(*) FROM public.matches m
      WHERE m.scheduled_at >= ds.day::timestamptz
        AND m.scheduled_at <  (ds.day + 1)::timestamptz
        AND m.status <> 'CANCELADO')::bigint,
    (SELECT COUNT(*) FROM public.matches m
      WHERE m.finished_at >= ds.day::timestamptz
        AND m.finished_at <  (ds.day + 1)::timestamptz)::bigint
  FROM date_series ds
  ORDER BY ds.day;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.dashboard_activity_timeseries(date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dashboard_activity_timeseries(date, date) TO authenticated;

COMMENT ON FUNCTION public.dashboard_activity_timeseries(date, date) IS
  'Serie diaria del ciclo de vida del partido para /dashboard/activity (is_admin): creados, agendados y finalizados. Sin serie de cancelados: matches no tiene cancelled_at. Ver WEB_SPECIFICATION.md §3.4.';


-- ════════════════════════════════════════════════════════════
-- 4. dashboard_checkin_timeseries — presentismo
-- ════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.dashboard_checkin_timeseries(
  p_from date DEFAULT NULL,
  p_to   date DEFAULT NULL
)
RETURNS TABLE (
  day          date,
  participants bigint,
  checkins     bigint
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

  -- `match_participants` no tiene created_at propio, así que la fila se
  -- imputa al día del PARTIDO, no al de la convocatoria. Es además lo que
  -- interesa: la tasa de check-in es una propiedad del partido jugado.
  -- COALESCE porque scheduled_at es nullable (un partido PENDIENTE todavía
  -- no tiene fecha) y sin él esas filas desaparecerían del denominador.
  RETURN QUERY
  WITH date_series AS (
    SELECT generate_series(v_from, v_to, interval '1 day')::date AS day
  ),
  participation AS (
    SELECT
      COALESCE(m.started_at, m.scheduled_at, m.created_at)::date AS day,
      COUNT(*)::bigint AS participants,
      COUNT(*) FILTER (WHERE mp.did_checkin)::bigint AS checkins
    FROM public.match_participants mp
    JOIN public.matches m ON m.id = mp.match_id
    WHERE m.status <> 'CANCELADO'
    GROUP BY 1
  )
  SELECT
    ds.day,
    COALESCE(p.participants, 0)::bigint,
    COALESCE(p.checkins, 0)::bigint
  FROM date_series ds
  LEFT JOIN participation p ON p.day = ds.day
  ORDER BY ds.day;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.dashboard_checkin_timeseries(date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dashboard_checkin_timeseries(date, date) TO authenticated;

COMMENT ON FUNCTION public.dashboard_checkin_timeseries(date, date) IS
  'Convocados y check-ins efectivos por día de partido para /dashboard/activity (is_admin). Excluye partidos cancelados. Ver WEB_SPECIFICATION.md §3.4.';


-- ════════════════════════════════════════════════════════════
-- 5. dashboard_market_timeseries — mercado de pases
-- ════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.dashboard_market_timeseries(
  p_from date DEFAULT NULL,
  p_to   date DEFAULT NULL
)
RETURNS TABLE (
  day          date,
  player_posts bigint,
  team_posts   bigint,
  applications bigint
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

  -- Las postulaciones de los dos lados del mercado (jugador→equipo y
  -- equipo→jugador) se suman en una sola serie: para medir si el mercado
  -- se usa, lo que importa es que alguien haya respondido a un aviso, no
  -- de qué lado del mostrador estaba.
  RETURN QUERY
  WITH date_series AS (
    SELECT generate_series(v_from, v_to, interval '1 day')::date AS day
  )
  SELECT
    ds.day,
    (SELECT COUNT(*) FROM public.market_player_posts mp
      WHERE mp.created_at >= ds.day::timestamptz
        AND mp.created_at <  (ds.day + 1)::timestamptz)::bigint,
    (SELECT COUNT(*) FROM public.market_team_posts mt
      WHERE mt.created_at >= ds.day::timestamptz
        AND mt.created_at <  (ds.day + 1)::timestamptz)::bigint,
    (
      (SELECT COUNT(*) FROM public.market_player_post_applications a
        WHERE a.created_at >= ds.day::timestamptz
          AND a.created_at <  (ds.day + 1)::timestamptz)
      +
      (SELECT COUNT(*) FROM public.market_team_post_applications a
        WHERE a.created_at >= ds.day::timestamptz
          AND a.created_at <  (ds.day + 1)::timestamptz)
    )::bigint
  FROM date_series ds
  ORDER BY ds.day;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.dashboard_market_timeseries(date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dashboard_market_timeseries(date, date) TO authenticated;

COMMENT ON FUNCTION public.dashboard_market_timeseries(date, date) IS
  'Avisos publicados y postulaciones del mercado de pases por día para /dashboard/activity (is_admin). Suma las postulaciones de ambos lados del mercado. Ver WEB_SPECIFICATION.md §3.4.';


-- ════════════════════════════════════════════════════════════
-- 6. dashboard_retention_cohorts — activación por cohorte
-- ════════════════════════════════════════════════════════════
-- Qué mide, con precisión, porque "retención" se usa para cosas distintas:
-- de cada grupo de usuarios que se dio de alta en la misma semana, cuántos
-- llegaron a JUGAR un partido dentro de los 7 y de los 28 días siguientes.
-- Es activación acumulada, no retención Wn clásica (que preguntaría si el
-- usuario estuvo activo EN la semana n). A esta escala la versión clásica
-- devolvería casi puros ceros y no diría nada.
--
-- La señal de actividad es match_participants → matches y no app_logs: los
-- logs sólo tienen user_id en una fracción de las filas y de un puñado de
-- usuarios, así que una retención calculada sobre ellos mediría la
-- telemetría, no el producto.

CREATE OR REPLACE FUNCTION public.dashboard_retention_cohorts(
  p_weeks int DEFAULT 8
)
RETURNS TABLE (
  cohort_week  date,
  cohort_size  bigint,
  played_7d    bigint,
  played_28d   bigint,
  mature_7d    boolean,
  mature_28d   boolean
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

  IF p_weeks IS NULL OR p_weeks < 1 OR p_weeks > 52 THEN
    p_weeks := 8;
  END IF;

  RETURN QUERY
  WITH cohorts AS (
    SELECT
      p.id,
      p.created_at,
      date_trunc('week', p.created_at)::date AS cohort_week
    FROM public.profiles p
    WHERE p.created_at >= date_trunc('week', now()) - (p_weeks - 1) * interval '1 week'
  ),
  first_play AS (
    -- El primer partido de cada usuario. MIN sobre la fecha efectiva del
    -- partido; los cancelados no cuentan como haber jugado.
    SELECT
      mp.profile_id,
      MIN(COALESCE(m.started_at, m.scheduled_at, m.created_at)) AS played_at
    FROM public.match_participants mp
    JOIN public.matches m ON m.id = mp.match_id
    WHERE m.status <> 'CANCELADO'
    GROUP BY mp.profile_id
  )
  SELECT
    c.cohort_week,
    COUNT(*)::bigint,
    COUNT(*) FILTER (
      WHERE fp.played_at IS NOT NULL
        AND fp.played_at <= c.created_at + interval '7 days'
    )::bigint,
    COUNT(*) FILTER (
      WHERE fp.played_at IS NOT NULL
        AND fp.played_at <= c.created_at + interval '28 days'
    )::bigint,
    -- Una cohorte que todavía no cumplió la ventana tiene el numerador
    -- incompleto por definición. Se devuelve igual (sirve para ver el
    -- tamaño), pero marcada, para que la UI no la grafique como si fuera
    -- comparable con las cerradas.
    --
    -- El `+ 7` es el ancho de la propia semana de la cohorte: el que se dio
    -- de alta el último día todavía tiene su ventana abierta cuando el que
    -- se dio de alta el lunes ya la cerró. Recién cuando pasaron 7 días
    -- desde el final de la semana la cohorte entera está madura.
    (c.cohort_week + 7 + 7)  <= current_date,
    (c.cohort_week + 7 + 28) <= current_date
  FROM cohorts c
  LEFT JOIN first_play fp ON fp.profile_id = c.id
  GROUP BY c.cohort_week
  ORDER BY c.cohort_week;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.dashboard_retention_cohorts(int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dashboard_retention_cohorts(int) TO authenticated;

COMMENT ON FUNCTION public.dashboard_retention_cohorts(int) IS
  'Activación acumulada por cohorte semanal de alta para /dashboard/growth (is_admin): cuántos usuarios de cada cohorte jugaron un partido dentro de los 7 y 28 días. mature_* indica si la ventana ya cerró. Señal de actividad = match_participants, no app_logs.';
