-- ============================================================
-- RANKING GLOBAL POR MEJOR FORMATO — 2026-08-11
-- ------------------------------------------------------------
-- La tabla global del ranking (sin filtro de formato) rankeaba a cada equipo
-- por su `preferred_format`. Eso castiga al equipo que declaró F11 al crearse
-- pero en la práctica juega —y gana— en F5: aparece con el ELO del formato que
-- casi no juega, no con el que lo representa.
--
-- A partir de acá, sin filtro de formato cada equipo compite con su MEJOR
-- versión: el formato en el que tiene el ELO más alto.
--
-- ─── Nota sobre la forma de la consulta ──────────────────────────────────────
--
-- El pedido original hablaba de `GREATEST(elo_f5, elo_f6, ..., elo_f11)`, que
-- asume que los ELO por formato son COLUMNAS de `teams`. En este schema no lo
-- son: viven en `team_rankings`, una FILA por (team_id, format) — ver
-- 20260803120000_per_format_elo_rankings.sql. El equivalente sobre filas es
-- quedarse con la de mayor `elo_score` por equipo, que es lo que hace el
-- DISTINCT ON de abajo. La semántica pedida es la misma; GREATEST sobre
-- columnas que no existen no compilaría.
--
-- El modelo por filas además evita un problema que GREATEST tendría: un equipo
-- que nunca jugó F11 no tiene fila de F11, así que no puede ganar el ranking
-- global con el 1000 de base de un formato que nunca pisó. Con columnas y
-- DEFAULT 1000 habría que excluir esos casos a mano.
--
-- ─── Qué NO cambia ───────────────────────────────────────────────────────────
--
--   · Con `p_format` explícito el comportamiento es idéntico al anterior: el
--     WHERE ya deja una sola fila por equipo y el DISTINCT ON no hace nada.
--   · La firma (nombres y tipos devueltos) queda igual, así que
--     `lib/ranking-data.ts`, la tab Ranking y la MiniRankingCard siguen
--     andando sin tocarse.
--   · `preferred_format` del resultado sigue devolviendo el formato DE LA FILA
--     rankeada (`tr.format`). Sin filtro eso ahora es el mejor formato del
--     equipo y no su preferido — que es exactamente el dato que la UI quiere
--     mostrar al lado del número.
--
-- Idempotente: se puede re-aplicar sin efectos.
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_team_ranking(
  p_zone     text          DEFAULT NULL::text,
  p_category team_category DEFAULT NULL::team_category,
  p_format   team_format   DEFAULT NULL::team_format
)
 RETURNS TABLE(rank_position bigint, team_id uuid, team_name text, shield_url text, zone text, category team_category, preferred_format team_format, elo_rating integer, fair_play_score numeric, season_wins integer, season_losses integer, season_draws integer, matches_played integer)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH best_row AS (
    -- Una fila por equipo: la de su ELO más alto entre los formatos que jugó.
    -- El desempate por `tr.format` hace la salida determinista cuando dos
    -- formatos empatan en ELO (pasa seguido en equipos nuevos, todos en 1000).
    --
    -- ⚠️ Los alias van con prefijo `b_` a propósito. En una función SQL, los
    -- nombres de columna de RETURNS TABLE se comportan como parámetros OUT y
    -- son visibles dentro del cuerpo: un alias `team_name` haría que la
    -- referencia de abajo sea ambigua y Postgres aborta con
    -- «column reference "team_name" is ambiguous» en tiempo de ejecución.
    SELECT DISTINCT ON (t.id)
      t.id              AS b_team_id,
      t.name            AS b_team_name,
      t.shield_url      AS b_shield_url,
      t.zone            AS b_zone,
      t.category        AS b_category,
      tr.format         AS b_format,
      tr.elo_score      AS b_elo_score,
      t.fair_play_score AS b_fair_play,
      tr.wins           AS b_wins,
      tr.losses         AS b_losses,
      tr.draws          AS b_draws,
      tr.matches_played AS b_matches_played
    FROM teams t
    JOIN team_rankings tr
      ON tr.team_id = t.id
    WHERE t.is_active
      AND (p_zone IS NULL OR t.zone = p_zone)
      AND (p_category IS NULL OR t.category = p_category)
      -- Con formato explícito esto ya deja una sola fila por equipo.
      AND (p_format IS NULL OR tr.format = p_format)
    ORDER BY t.id, tr.elo_score DESC, tr.format
  )
  SELECT
    row_number() over (order by b_elo_score desc, b_team_name)::bigint,
    b_team_id, b_team_name, b_shield_url, b_zone, b_category, b_format,
    b_elo_score, b_fair_play, b_wins, b_losses, b_draws, b_matches_played
  FROM best_row
  ORDER BY b_elo_score DESC, b_team_name;
$function$;

COMMENT ON FUNCTION public.get_team_ranking(text, team_category, team_format) IS
  'Tabla de posiciones. Con p_format devuelve el ranking de ESE formato; sin p_format, cada equipo compite con su mejor formato (mayor elo_score en team_rankings).';
