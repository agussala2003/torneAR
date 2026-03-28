-- ============================================================
-- FASE 2: Motor de ELO — resolve_match trigger
-- Fecha: 2026-03-28
-- Reporte: docs/auditoria.md — Ítem 8
-- ============================================================
--
-- Dispara AFTER UPDATE en matches cuando el partido de RANKING
-- pasa a estado terminal (FINALIZADO, WO_A, WO_B) por primera vez.
--
-- Comportamiento:
--   • Lee los goles de match_results (o usa 0-0 para WO).
--   • Calcula ELO con la fórmula estándar, K = 40 (máximo por partido).
--   • Actualiza elo_rating, matches_played, in_ranking (≥5 partidos),
--     season_wins/draws/losses y season_goals_for/against en teams.
--
-- Función auxiliar:
--   • season_reset_elo(): aplica la fórmula de reset de temporada
--     (1000 + (rating − 1000) × 0.5) para todos los equipos.
--     Invocable manualmente por el admin al cerrar la temporada.
-- ============================================================

-- ─── 1. Función del trigger ──────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.resolve_match_elo()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_elo_a   integer;
  v_elo_b   integer;
  v_played_a integer;
  v_played_b integer;
  v_goals_a integer := 0;
  v_goals_b integer := 0;
  v_s_a     numeric;  -- outcome para equipo A: 1 / 0.5 / 0
  v_s_b     numeric;  -- outcome para equipo B: 1 / 0.5 / 0
  v_e_a     numeric;  -- probabilidad esperada equipo A
  v_e_b     numeric;  -- probabilidad esperada equipo B
  v_diff_a  integer;  -- variación ELO equipo A (redondeada)
  v_diff_b  integer;  -- variación ELO equipo B (redondeada)
  v_k       CONSTANT numeric := 40;  -- cap máximo por partido
BEGIN
  -- ── Guardia 1: solo partidos de RANKING ─────────────────────────────────────
  IF NEW.match_type <> 'RANKING' THEN
    RETURN NEW;
  END IF;

  -- ── Guardia 2: solo transición a estado terminal, una sola vez ───────────────
  IF NEW.status NOT IN ('FINALIZADO', 'WO_A', 'WO_B') THEN
    RETURN NEW;
  END IF;
  IF OLD.status IN ('FINALIZADO', 'WO_A', 'WO_B') THEN
    RETURN NEW;  -- idempotencia: no recalcular si ya estaba en estado terminal
  END IF;

  -- ── Cargar ELO y partidos actuales de ambos equipos ─────────────────────────
  SELECT elo_rating, matches_played
    INTO v_elo_a, v_played_a
    FROM teams WHERE id = NEW.team_a_id;

  SELECT elo_rating, matches_played
    INTO v_elo_b, v_played_b
    FROM teams WHERE id = NEW.team_b_id;

  -- Fallback a 1000 si algún valor fuera NULL (defensivo)
  v_elo_a := COALESCE(v_elo_a, 1000);
  v_elo_b := COALESCE(v_elo_b, 1000);

  -- ── Determinar resultado del partido ─────────────────────────────────────────
  IF NEW.status = 'WO_A' THEN
    -- Equipo A gana por walkover (sin goles reales)
    v_s_a := 1.0;
    v_s_b := 0.0;

  ELSIF NEW.status = 'WO_B' THEN
    -- Equipo B gana por walkover (sin goles reales)
    v_s_a := 0.0;
    v_s_b := 1.0;

  ELSE
    -- FINALIZADO: leer goles de match_results
    SELECT goals_scored INTO v_goals_a
      FROM match_results WHERE match_id = NEW.id AND team_id = NEW.team_a_id;
    SELECT goals_scored INTO v_goals_b
      FROM match_results WHERE match_id = NEW.id AND team_id = NEW.team_b_id;

    -- Si los resultados aún no fueron cargados, no aplicar ELO todavía.
    -- El trigger volverá a dispararse cuando el status se actualice desde
    -- submit_match_result / load_match_result.
    IF v_goals_a IS NULL OR v_goals_b IS NULL THEN
      RETURN NEW;
    END IF;

    IF v_goals_a > v_goals_b THEN
      v_s_a := 1.0; v_s_b := 0.0;
    ELSIF v_goals_b > v_goals_a THEN
      v_s_a := 0.0; v_s_b := 1.0;
    ELSE
      v_s_a := 0.5; v_s_b := 0.5;
    END IF;
  END IF;

  -- ── Fórmula ELO ──────────────────────────────────────────────────────────────
  -- E_A = 1 / (1 + 10 ^ ((Elo_B − Elo_A) / 400))
  v_e_a := 1.0 / (1.0 + power(10.0, (v_elo_b - v_elo_a)::numeric / 400.0));
  v_e_b := 1.0 - v_e_a;

  -- Diff = K × (S − E), capped a ±K (40 pts)
  v_diff_a := ROUND(LEAST(v_k, GREATEST(-v_k, v_k * (v_s_a - v_e_a))))::integer;
  v_diff_b := ROUND(LEAST(v_k, GREATEST(-v_k, v_k * (v_s_b - v_e_b))))::integer;

  -- ── Actualizar equipo A ───────────────────────────────────────────────────────
  UPDATE teams SET
    elo_rating            = elo_rating + v_diff_a,
    matches_played        = matches_played + 1,
    in_ranking            = (matches_played + 1) >= 5,
    season_wins           = season_wins   + CASE WHEN v_s_a = 1.0 THEN 1 ELSE 0 END,
    season_draws          = season_draws  + CASE WHEN v_s_a = 0.5 THEN 1 ELSE 0 END,
    season_losses         = season_losses + CASE WHEN v_s_a = 0.0 THEN 1 ELSE 0 END,
    season_goals_for      = season_goals_for     + v_goals_a,
    season_goals_against  = season_goals_against + v_goals_b
  WHERE id = NEW.team_a_id;

  -- ── Actualizar equipo B ───────────────────────────────────────────────────────
  UPDATE teams SET
    elo_rating            = elo_rating + v_diff_b,
    matches_played        = matches_played + 1,
    in_ranking            = (matches_played + 1) >= 5,
    season_wins           = season_wins   + CASE WHEN v_s_b = 1.0 THEN 1 ELSE 0 END,
    season_draws          = season_draws  + CASE WHEN v_s_b = 0.5 THEN 1 ELSE 0 END,
    season_losses         = season_losses + CASE WHEN v_s_b = 0.0 THEN 1 ELSE 0 END,
    season_goals_for      = season_goals_for     + v_goals_b,
    season_goals_against  = season_goals_against + v_goals_a
  WHERE id = NEW.team_b_id;

  RETURN NEW;
END;
$$;

-- ─── 2. Trigger ──────────────────────────────────────────────────────────────

DROP TRIGGER IF EXISTS resolve_match ON public.matches;

CREATE TRIGGER resolve_match
  AFTER UPDATE ON public.matches
  FOR EACH ROW
  EXECUTE FUNCTION public.resolve_match_elo();

-- ─── 3. Función auxiliar: reset de temporada ─────────────────────────────────
-- Invocada manualmente por un admin (o por un cron job) al cerrar la temporada.
-- Fórmula: new_elo = 1000 + (current_elo − 1000) × 0.5
-- Resetea también los contadores de temporada y deja in_ranking en false.
-- Los partidos históricos (matches_played) NO se resetean.

CREATE OR REPLACE FUNCTION public.season_reset_elo()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = 'public'
AS $$
  UPDATE teams SET
    elo_rating           = ROUND(1000 + (elo_rating - 1000) * 0.5),
    in_ranking           = false,
    season_wins          = 0,
    season_draws         = 0,
    season_losses        = 0,
    season_goals_for     = 0,
    season_goals_against = 0;
$$;

-- Solo los admins/service-role pueden invocar el reset
REVOKE EXECUTE ON FUNCTION public.season_reset_elo() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.season_reset_elo() FROM authenticated;
