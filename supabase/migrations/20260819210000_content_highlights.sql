-- ============================================================
-- Fase 2 de Marketing & Growth: destacados para el Content Factory
-- 2026-08-19
-- ------------------------------------------------------------
-- Una sola RPC que devuelve los 3 destacados de una ventana de fechas, para
-- que /api/og/[template] arme la tarjeta correspondiente sin tener que
-- hacer 3 viajes a la base por request de imagen.
--
-- Devuelve `jsonb` y no `TABLE`: no es una serie para graficar (eso son las
-- `dashboard_*`, §1.2 de WEB_SPECIFICATION.md) — es un objeto compuesto con
-- 3 sub-resultados de forma distinta entre sí, que es exactamente lo que un
-- endpoint de imagen necesita en una sola llamada.
--
-- Umbrales (ninguno de los tres puede salir "vacío" con un valor falso):
--   · MVP: sólo cuenta si mvp_id IS NOT NULL — no puede existir un grupo con
--     0 votos, así que no hace falta un HAVING explícito.
--   · Salto de ELO: sólo deltas positivos (delta > 0). Un equipo que sólo
--     perdió puntos en la ventana no tiene nada que celebrar.
--   · Goleador: HAVING SUM(goals_count) > 0, como red de seguridad aunque
--     match_goals no debería tener filas con 0 goles (es una proyección de
--     match_results.scorers, ver comentario de la tabla).
-- Sin datos que superen el umbral, la clave queda en `null` — el llamador
-- decide cómo mostrar una tarjeta sin destacado, no se inventa un cero.
--
-- Todas las consultas anclan la ventana a `matches.finished_at` (para MVP y
-- goleador) o a `elo_history.created_at` (para el salto de ELO, que ya es la
-- marca de tiempo de cuando se aplicó el cambio) — el momento en que el
-- partido efectivamente terminó y generó estadísticas, no cuando se cargó
-- el resultado (`match_results.submitted_at` puede ser de un equipo solo,
-- antes de que el partido esté FINALIZADO).
--
-- Sólo partidos asentados: FINALIZADO o resueltos por walkover (WO_A/WO_B,
-- que aplican un 3-0 con estadísticas reales — ver resolve_wo_claim). Un
-- partido EN_DISPUTA queda afuera porque su resultado puede revertirse.
-- ============================================================

CREATE OR REPLACE FUNCTION public.content_weekly_highlights(
  p_from date DEFAULT NULL,
  p_to   date DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_from       date;
  v_to         date;
  v_mvp        jsonb;
  v_elo_jump   jsonb;
  v_top_scorer jsonb;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE auth_user_id = auth.uid() AND is_admin = true
  ) THEN
    RAISE EXCEPTION 'NOT_AUTHORIZED: se requiere is_admin';
  END IF;

  -- Default "la última semana" y no "los últimos 30 días" como el resto de
  -- las dashboard_*: el nombre de la función y el uso (una tarjeta semanal)
  -- son explícitos sobre la ventana natural.
  v_to   := COALESCE(p_to, current_date);
  v_from := COALESCE(p_from, v_to - 6);

  IF v_from > v_to THEN
    RAISE EXCEPTION 'INVALID_RANGE: p_from debe ser anterior o igual a p_to';
  END IF;

  IF v_to - v_from > 366 THEN
    v_from := v_to - 366;
  END IF;

  -- ─── MVP: votos de match_results.mvp_id sumando AMBOS equipos ───────────
  -- match_results tiene hasta 2 filas por partido (UNIQUE match_id+team_id),
  -- una por cada equipo que cargó su versión — agrupar por mvp_id ya suma
  -- los votos de los dos lados sin distinguir de qué equipo vino cada uno.
  SELECT jsonb_build_object(
    'profile_id', p.id,
    'username',   p.username,
    'full_name',  p.full_name,
    'avatar_url', p.avatar_url,
    'votes',      counts.votes
  )
  INTO v_mvp
  FROM (
    SELECT mr.mvp_id, COUNT(*) AS votes
    FROM public.match_results mr
    JOIN public.matches m ON m.id = mr.match_id
    WHERE mr.mvp_id IS NOT NULL
      AND m.status IN ('FINALIZADO', 'WO_A', 'WO_B')
      AND m.finished_at::date BETWEEN v_from AND v_to
    GROUP BY mr.mvp_id
    ORDER BY COUNT(*) DESC, mr.mvp_id  -- desempate estable, no arbitrario
    LIMIT 1
  ) counts
  JOIN public.profiles p ON p.id = counts.mvp_id;

  -- ─── Mayor salto de ELO: el delta positivo más alto EN UN partido ───────
  -- No es la suma de la ventana — es el salto puntual más grande, que es la
  -- métrica que de verdad se comparte ("el equipo que voló esta semana").
  SELECT jsonb_build_object(
    'team_id',    t.id,
    'team_name',  t.name,
    'shield_url', t.shield_url,
    'delta',      eh.delta,
    'elo_before', eh.elo_before,
    'elo_after',  eh.elo_after
  )
  INTO v_elo_jump
  FROM public.elo_history eh
  JOIN public.teams t ON t.id = eh.team_id
  WHERE eh.delta > 0
    AND eh.created_at::date BETWEEN v_from AND v_to
  ORDER BY eh.delta DESC, eh.created_at DESC
  LIMIT 1;

  -- ─── Goleador: suma de match_goals.goals_count en la ventana ────────────
  SELECT jsonb_build_object(
    'profile_id', p.id,
    'username',   p.username,
    'full_name',  p.full_name,
    'avatar_url', p.avatar_url,
    'goals',      totals.goals
  )
  INTO v_top_scorer
  FROM (
    SELECT mg.player_id, SUM(mg.goals_count) AS goals
    FROM public.match_goals mg
    JOIN public.matches m ON m.id = mg.match_id
    WHERE m.finished_at::date BETWEEN v_from AND v_to
    GROUP BY mg.player_id
    HAVING SUM(mg.goals_count) > 0
    ORDER BY SUM(mg.goals_count) DESC, mg.player_id
    LIMIT 1
  ) totals
  JOIN public.profiles p ON p.id = totals.player_id;

  RETURN jsonb_build_object(
    'from',       v_from,
    'to',         v_to,
    'mvp',        v_mvp,
    'elo_jump',   v_elo_jump,
    'top_scorer', v_top_scorer
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.content_weekly_highlights(date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.content_weekly_highlights(date, date) TO authenticated;

COMMENT ON FUNCTION public.content_weekly_highlights(date, date) IS
  'Destacados de una ventana para /api/og/[template] (is_admin): MVP (votos de ambos equipos), mayor salto de ELO (delta positivo puntual) y goleador. Cada clave es null si nadie supera el umbral mínimo. Rango inclusive, NULL = últimos 7 días, topeado en 366.';
