-- ============================================================
-- Remove "Calibrando" — all teams visible in ranking from match 1
-- Date: 2026-03-30
-- ============================================================

-- 1. Change default so new teams start as in_ranking = true
ALTER TABLE teams ALTER COLUMN in_ranking SET DEFAULT true;

-- 2. Backfill existing teams that were hidden
UPDATE teams SET in_ranking = true WHERE in_ranking = false;

-- 3. Replace resolve_match_elo() removing the in_ranking condition
CREATE OR REPLACE FUNCTION public.resolve_match_elo()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_elo_a   integer;
  v_elo_b   integer;
  v_goals_a integer := 0;
  v_goals_b integer := 0;
  v_s_a     numeric;
  v_s_b     numeric;
  v_e_a     numeric;
  v_e_b     numeric;
  v_diff_a  integer;
  v_diff_b  integer;
  v_k       CONSTANT numeric := 40;
BEGIN
  IF NEW.match_type <> 'RANKING' THEN RETURN NEW; END IF;
  IF NEW.status NOT IN ('FINALIZADO', 'WO_A', 'WO_B') THEN RETURN NEW; END IF;
  IF OLD.status IN ('FINALIZADO', 'WO_A', 'WO_B') THEN RETURN NEW; END IF;

  SELECT elo_rating INTO v_elo_a FROM teams WHERE id = NEW.team_a_id;
  SELECT elo_rating INTO v_elo_b FROM teams WHERE id = NEW.team_b_id;
  v_elo_a := COALESCE(v_elo_a, 1000);
  v_elo_b := COALESCE(v_elo_b, 1000);

  IF NEW.status = 'WO_A' THEN
    v_s_a := 1.0; v_s_b := 0.0;
  ELSIF NEW.status = 'WO_B' THEN
    v_s_a := 0.0; v_s_b := 1.0;
  ELSE
    SELECT goals_scored INTO v_goals_a
      FROM match_results WHERE match_id = NEW.id AND team_id = NEW.team_a_id;
    SELECT goals_scored INTO v_goals_b
      FROM match_results WHERE match_id = NEW.id AND team_id = NEW.team_b_id;
    IF v_goals_a IS NULL OR v_goals_b IS NULL THEN RETURN NEW; END IF;
    IF v_goals_a > v_goals_b THEN
      v_s_a := 1.0; v_s_b := 0.0;
    ELSIF v_goals_b > v_goals_a THEN
      v_s_a := 0.0; v_s_b := 1.0;
    ELSE
      v_s_a := 0.5; v_s_b := 0.5;
    END IF;
  END IF;

  v_e_a := 1.0 / (1.0 + power(10.0, (v_elo_b - v_elo_a)::numeric / 400.0));
  v_e_b := 1.0 - v_e_a;
  v_diff_a := ROUND(LEAST(v_k, GREATEST(-v_k, v_k * (v_s_a - v_e_a))))::integer;
  v_diff_b := ROUND(LEAST(v_k, GREATEST(-v_k, v_k * (v_s_b - v_e_b))))::integer;

  -- NOTE: in_ranking removed from both UPDATEs — teams are always in ranking
  UPDATE teams SET
    elo_rating            = elo_rating + v_diff_a,
    matches_played        = matches_played + 1,
    season_wins           = season_wins   + CASE WHEN v_s_a = 1.0 THEN 1 ELSE 0 END,
    season_draws          = season_draws  + CASE WHEN v_s_a = 0.5 THEN 1 ELSE 0 END,
    season_losses         = season_losses + CASE WHEN v_s_a = 0.0 THEN 1 ELSE 0 END,
    season_goals_for      = season_goals_for     + v_goals_a,
    season_goals_against  = season_goals_against + v_goals_b
  WHERE id = NEW.team_a_id;

  UPDATE teams SET
    elo_rating            = elo_rating + v_diff_b,
    matches_played        = matches_played + 1,
    season_wins           = season_wins   + CASE WHEN v_s_b = 1.0 THEN 1 ELSE 0 END,
    season_draws          = season_draws  + CASE WHEN v_s_b = 0.5 THEN 1 ELSE 0 END,
    season_losses         = season_losses + CASE WHEN v_s_b = 0.0 THEN 1 ELSE 0 END,
    season_goals_for      = season_goals_for     + v_goals_b,
    season_goals_against  = season_goals_against + v_goals_a
  WHERE id = NEW.team_b_id;

  RETURN NEW;
END;
$$;

-- 4. Patch season_reset_elo to keep teams visible after season reset
CREATE OR REPLACE FUNCTION public.season_reset_elo()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = 'public'
AS $$
  UPDATE teams SET
    elo_rating           = ROUND(1000 + (elo_rating - 1000) * 0.5),
    in_ranking           = true,
    season_wins          = 0,
    season_draws         = 0,
    season_losses        = 0,
    season_goals_for     = 0,
    season_goals_against = 0;
$$;

REVOKE EXECUTE ON FUNCTION public.season_reset_elo() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.season_reset_elo() FROM authenticated;
