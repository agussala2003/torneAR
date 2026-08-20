-- ============================================================
-- Content Factory · expansión a 5 plantillas — 2026-08-20
-- ------------------------------------------------------------
-- `content_weekly_highlights` ya devolvía `mvp`, `elo_jump` y `top_scorer`
-- (20260819210000). Esta migración NO cambia la firma —sigue siendo
-- (p_from date, p_to date)— y agrega dos claves nuevas al mismo jsonb:
--
--   · `epic_match`   → "El Partidazo": el partido asentado con más goles
--                       combinados de la ventana.
--   · `zone_leaders` → "Líderes de Zona": el Top 5 de una zona.
--
-- Se mantiene la firma a propósito y no se agrega `p_zone`: un tercer
-- parámetro con DEFAULT crearía una SOBRECARGA
-- `content_weekly_highlights(date, date, text)` conviviendo con la de dos
-- argumentos, y PostgREST resuelve las sobrecargas por el conjunto de
-- claves del body — un terreno donde un typo en el llamador deja de ser un
-- error y pasa a ser "llamó a la otra función". El día que el dashboard
-- quiera elegir la zona a mano, el camino es DROP + CREATE con la firma
-- nueva en una migración propia, no un DEFAULT encima de ésta.
--
-- ── Por qué `top_scorer` también se toca ────────────────────────────────
-- Ya existía en el jsonb pero NINGUNA plantilla lo consumía todavía, así
-- que no hay tarjeta en producción que dependa de su forma actual. Se
-- aprovecha para dos cosas: subir el umbral a 2 goles (un "Goleador de la
-- Semana" con 1 gol no es un destacado, es el primero del desempate) y
-- sumar `matches`, que es lo que le da contexto al número en la tarjeta
-- ("7 goles en 3 partidos").
--
-- ── Umbrales mínimos (§ el llamador nunca recibe un destacado inventado) ─
--   · top_scorer:   >= 2 goles en la ventana.
--   · epic_match:   >= 5 goles combinados.
--   · zone_leaders: la zona tiene que tener >= 3 equipos activos rankeados.
-- Si el umbral no se supera, la clave sale `null` y `/api/og/[template]`
-- dibuja la tarjeta de "sin destacado" en vez de un cero.
--
-- ── Ventana y estados ───────────────────────────────────────────────────
-- Mismos criterios que las tres consultas que ya estaban: `finished_at`
-- como ancla temporal (no `submitted_at`, que puede ser de un solo equipo
-- antes de que el partido esté cerrado) y sólo partidos asentados
-- (FINALIZADO / WO_A / WO_B). Un EN_DISPUTA puede revertirse.
--
-- Idempotente: CREATE OR REPLACE, se puede re-aplicar sin efectos.
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
  -- Umbrales mínimos, arriba y con nombre para que se lean de un vistazo en
  -- vez de quedar como números sueltos adentro de un HAVING.
  c_min_scorer_goals  constant integer := 2;
  c_min_epic_goals    constant integer := 5;
  c_zone_leaders_size constant integer := 5;
  c_min_zone_teams    constant integer := 3;

  v_from         date;
  v_to           date;
  v_mvp          jsonb;
  v_elo_jump     jsonb;
  v_top_scorer   jsonb;
  v_epic_match   jsonb;
  v_zone_leaders jsonb;
  v_zone         text;
  v_zone_matches integer;
  v_zone_teams   jsonb;
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

  -- ─── Goleador de la semana: suma de match_goals.goals_count ─────────────
  -- `match_goals` y no `match_results.scorers`: es exactamente el caso de uso
  -- que motivó la proyección (20260819120000) — un GROUP BY con índice en vez
  -- de desarmar jsonb de toda la tabla de resultados.
  --
  -- El JOIN a `matches` acá SÍ filtra por status (la versión anterior sólo
  -- filtraba por fecha): `match_goals` se proyecta apenas un capitán carga
  -- su `scorers`, o sea que existe también para partidos EN_DISPUTA cuyo
  -- resultado todavía puede revertirse. Sin el filtro, el goleador de la
  -- semana podía salir de goles que después dejaban de existir.
  --
  -- `matches` (COUNT DISTINCT) va en el jsonb para que la tarjeta pueda
  -- decir "7 goles en 3 partidos" — sin eso, 7 goles no se distinguen de un
  -- solo partido irrepetible.
  SELECT jsonb_build_object(
    'profile_id', p.id,
    'username',   p.username,
    'full_name',  p.full_name,
    'avatar_url', p.avatar_url,
    'goals',      totals.goals,
    'matches',    totals.matches
  )
  INTO v_top_scorer
  FROM (
    SELECT
      mg.player_id,
      SUM(mg.goals_count)::int          AS goals,
      COUNT(DISTINCT mg.match_id)::int  AS matches
    FROM public.match_goals mg
    JOIN public.matches m ON m.id = mg.match_id
    WHERE m.status IN ('FINALIZADO', 'WO_A', 'WO_B')
      AND m.finished_at::date BETWEEN v_from AND v_to
    GROUP BY mg.player_id
    HAVING SUM(mg.goals_count) >= c_min_scorer_goals
    ORDER BY SUM(mg.goals_count) DESC, COUNT(DISTINCT mg.match_id) ASC, mg.player_id
    LIMIT 1
  ) totals
  JOIN public.profiles p ON p.id = totals.player_id;

  -- ─── El Partidazo: más goles combinados de la ventana ───────────────────
  -- El total sale de UNA fila de match_results, no de sumar las dos: cada
  -- fila ya trae los dos lados (`goals_scored + goals_against`). Sumar las
  -- dos filas contaría cada gol dos veces, y exigir que las dos existan
  -- dejaría afuera los WO (donde carga un solo equipo).
  --
  -- `MAX(...)` y no `MIN`/promedio: si los dos capitanes cargaron números
  -- distintos el partido nunca llega a FINALIZADO (queda EN_DISPUTA y el
  -- WHERE lo excluye), así que en la práctica las dos filas coinciden y el
  -- MAX es sólo la forma de colapsar N filas a un valor sin asumir cuántas
  -- hay.
  SELECT jsonb_build_object(
    'match_id',    m.id,
    'played_at',   m.finished_at,
    'match_type',  m.match_type,
    'format',      m.format,
    'total_goals', top.total_goals,
    'team_a', jsonb_build_object(
      'team_id',    ta.id,
      'team_name',  ta.name,
      'shield_url', ta.shield_url,
      'goals',      sc.goals_a
    ),
    'team_b', jsonb_build_object(
      'team_id',    tb.id,
      'team_name',  tb.name,
      'shield_url', tb.shield_url,
      'goals',      sc.goals_b
    )
  )
  INTO v_epic_match
  FROM (
    SELECT
      mr.match_id,
      MAX(mr.goals_scored + mr.goals_against)::int AS total_goals
    FROM public.match_results mr
    JOIN public.matches m2 ON m2.id = mr.match_id
    WHERE m2.status IN ('FINALIZADO', 'WO_A', 'WO_B')
      AND m2.finished_at::date BETWEEN v_from AND v_to
    GROUP BY mr.match_id
    HAVING MAX(mr.goals_scored + mr.goals_against) >= c_min_epic_goals
    ORDER BY MAX(mr.goals_scored + mr.goals_against) DESC, mr.match_id
    LIMIT 1
  ) top
  JOIN public.matches m  ON m.id  = top.match_id
  JOIN public.teams   ta ON ta.id = m.team_a_id
  JOIN public.teams   tb ON tb.id = m.team_b_id
  -- Los goles POR equipo salen de una sola fila también, reorientados al
  -- lado A/B del partido: `goals_scored` es "los del equipo que cargó la
  -- fila", que puede ser cualquiera de los dos.
  CROSS JOIN LATERAL (
    SELECT
      CASE WHEN mr.team_id = m.team_a_id THEN mr.goals_scored  ELSE mr.goals_against END AS goals_a,
      CASE WHEN mr.team_id = m.team_a_id THEN mr.goals_against ELSE mr.goals_scored  END AS goals_b
    FROM public.match_results mr
    WHERE mr.match_id = m.id
    ORDER BY (mr.goals_scored + mr.goals_against) DESC, mr.team_id
    LIMIT 1
  ) sc;

  -- ─── Líderes de Zona ────────────────────────────────────────────────────
  -- La zona NO es un parámetro (ver el encabezado): se elige la que más
  -- partidos asentados tuvo en la ventana. Es la lectura editorial que da
  -- una historia contable —"la zona que más jugó esta semana, y así quedó
  -- su tabla"— sin sumar un selector a la UI.
  --
  -- Cada partido aporta a la zona de SUS DOS equipos (el LATERAL con
  -- VALUES): en un cruce inter-zona ambas jugaron ese partido. Un equipo
  -- sin zona no existe —`teams.zone` es NOT NULL— así que no hace falta
  -- filtrar nulls.
  SELECT z.zone, z.played
  INTO v_zone, v_zone_matches
  FROM (
    SELECT t.zone AS zone, COUNT(*)::int AS played
    FROM public.matches m
    CROSS JOIN LATERAL (VALUES (m.team_a_id), (m.team_b_id)) AS s(team_id)
    JOIN public.teams t ON t.id = s.team_id
    WHERE m.status IN ('FINALIZADO', 'WO_A', 'WO_B')
      AND m.finished_at::date BETWEEN v_from AND v_to
    GROUP BY t.zone
    ORDER BY COUNT(*) DESC, t.zone  -- desempate estable
    LIMIT 1
  ) z;

  IF v_zone IS NOT NULL THEN
    -- La tabla es la FOTO ACTUAL del ranking de esa zona, no un recorte de
    -- la ventana: `team_rankings` es acumulado y no hay histórico por fecha
    -- del que sacar "cómo estaba la tabla el lunes". La ventana define QUÉ
    -- zona se muestra, no cómo se ordena.
    --
    -- El JOIN por `t.preferred_format` espeja a `get_team_ranking(p_format
    -- => NULL)` (20260803120000): una fila por equipo, la de su formato
    -- principal. Mezclar ELOs de formatos distintos en una misma tabla no
    -- significaría nada.
    SELECT jsonb_agg(
             jsonb_build_object(
               'position',   lead.position,
               'team_id',    lead.id,
               'team_name',  lead.name,
               'shield_url', lead.shield_url,
               'elo',        lead.elo_score,
               'wins',       lead.wins,
               'draws',      lead.draws,
               'losses',     lead.losses
             )
             ORDER BY lead.position
           )
    INTO v_zone_teams
    FROM (
      SELECT
        row_number() OVER (ORDER BY tr.elo_score DESC, t.name ASC)::int AS position,
        t.id, t.name, t.shield_url, tr.elo_score, tr.wins, tr.draws, tr.losses
      FROM public.teams t
      JOIN public.team_rankings tr
        ON tr.team_id = t.id
       AND tr.format  = t.preferred_format
      WHERE t.is_active
        AND t.zone = v_zone
      ORDER BY tr.elo_score DESC, t.name ASC
      LIMIT c_zone_leaders_size
    ) lead;

    -- Un "Top 5" con dos equipos no es un ranking, es una lista. Por debajo
    -- del umbral la clave sale null como cualquier otro destacado que no
    -- llega.
    IF v_zone_teams IS NOT NULL
       AND jsonb_array_length(v_zone_teams) >= c_min_zone_teams
    THEN
      v_zone_leaders := jsonb_build_object(
        'zone',            v_zone,
        'matches_played',  v_zone_matches,
        'teams',           v_zone_teams
      );
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'from',         v_from,
    'to',           v_to,
    'mvp',          v_mvp,
    'elo_jump',     v_elo_jump,
    'top_scorer',   v_top_scorer,
    'epic_match',   v_epic_match,
    'zone_leaders', v_zone_leaders
  );
END;
$$;

-- CREATE OR REPLACE conserva los grants existentes; se re-declaran igual
-- para que este archivo siga siendo válido si algún día se aplica sobre una
-- base donde la función no existía (mismo criterio que 20260819210000).
REVOKE EXECUTE ON FUNCTION public.content_weekly_highlights(date, date) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.content_weekly_highlights(date, date) TO authenticated;

COMMENT ON FUNCTION public.content_weekly_highlights(date, date) IS
  'Destacados de una ventana para /api/og/[template] (is_admin): mvp (votos de ambos equipos), elo_jump (delta positivo puntual), top_scorer (>= 2 goles), epic_match (>= 5 goles combinados) y zone_leaders (Top 5 de la zona con más partidos en la ventana, mínimo 3 equipos). Cada clave es null si nadie supera el umbral. Rango inclusive, NULL = últimos 7 días, topeado en 366.';


-- ════════════════════════════════════════════════════════════
-- Índice de apoyo para la ventana temporal
-- ════════════════════════════════════════════════════════════
-- Las cinco consultas de arriba filtran por `status IN (...)` +
-- `finished_at` en un rango. Sin este índice cada tarjeta hace un seq scan
-- de `matches` — barato hoy, no dentro de dos temporadas.
--
-- Parcial por los tres estados asentados: es exactamente el subconjunto que
-- la RPC mira, y deja fuera del índice a los PENDIENTE/CONFIRMADO, que son
-- la mayoría de las filas vivas y no se consultan nunca por esta vía.
CREATE INDEX IF NOT EXISTS matches_finished_settled_idx
  ON public.matches (finished_at DESC)
  WHERE status IN ('FINALIZADO', 'WO_A', 'WO_B');
