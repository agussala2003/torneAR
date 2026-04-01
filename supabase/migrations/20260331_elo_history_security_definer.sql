-- Fix 42501: trg_on_result_submitted and resolve_match were not SECURITY DEFINER,
-- causing INSERT into elo_history to fail with RLS violation.
-- Also fixes linter WARN: mutable search_path for all three functions.

CREATE OR REPLACE FUNCTION public.calculate_elo_delta(winner_elo integer, loser_elo integer)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
declare
  k            constant integer := 30;
  max_delta    constant integer := 40;
  expected_win numeric;
  raw_delta    integer;
begin
  expected_win := 1.0 / (1.0 + power(10.0, (loser_elo - winner_elo) / 400.0));
  raw_delta := round(k * (1 - expected_win));
  return least(raw_delta, max_delta);
end;
$$;

CREATE OR REPLACE FUNCTION public.resolve_match(p_match_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
declare
  v_match        matches%rowtype;
  v_result_a     match_results%rowtype;
  v_result_b     match_results%rowtype;
  v_elo_delta    integer;
  v_winner_id    uuid;
  v_loser_id     uuid;
begin
  select * into v_match from matches where id = p_match_id;

  select * into v_result_a from match_results
    where match_id = p_match_id and team_id = v_match.team_a_id;
  select * into v_result_b from match_results
    where match_id = p_match_id and team_id = v_match.team_b_id;

  if v_result_a is null or v_result_b is null then
    return;
  end if;

  if v_result_a.goals_scored <> v_result_b.goals_against
     or v_result_b.goals_scored <> v_result_a.goals_against then
    update matches set status = 'EN_DISPUTA' where id = p_match_id;
    return;
  end if;

  update matches
    set status = 'FINALIZADO', finished_at = now()
    where id = p_match_id;

  update teams set
    season_goals_for     = season_goals_for + v_result_a.goals_scored,
    season_goals_against = season_goals_against + v_result_a.goals_against,
    matches_played       = matches_played + 1,
    season_wins   = season_wins   + case when v_result_a.goals_scored > v_result_a.goals_against then 1 else 0 end,
    season_losses = season_losses + case when v_result_a.goals_scored < v_result_a.goals_against then 1 else 0 end,
    season_draws  = season_draws  + case when v_result_a.goals_scored = v_result_a.goals_against then 1 else 0 end
  where id = v_match.team_a_id;

  update teams set
    season_goals_for     = season_goals_for + v_result_b.goals_scored,
    season_goals_against = season_goals_against + v_result_b.goals_against,
    matches_played       = matches_played + 1,
    season_wins   = season_wins   + case when v_result_b.goals_scored > v_result_b.goals_against then 1 else 0 end,
    season_losses = season_losses + case when v_result_b.goals_scored < v_result_b.goals_against then 1 else 0 end,
    season_draws  = season_draws  + case when v_result_b.goals_scored = v_result_b.goals_against then 1 else 0 end
  where id = v_match.team_b_id;

  if v_match.match_type = 'RANKING' then
    update teams set in_ranking = true
      where id in (v_match.team_a_id, v_match.team_b_id)
        and matches_played >= 5;
  end if;

  if v_match.match_type = 'RANKING' then
    if v_result_a.goals_scored > v_result_b.goals_scored then
      v_winner_id := v_match.team_a_id;
      v_loser_id  := v_match.team_b_id;
    elsif v_result_b.goals_scored > v_result_a.goals_scored then
      v_winner_id := v_match.team_b_id;
      v_loser_id  := v_match.team_a_id;
    else
      v_elo_delta := calculate_elo_delta(
        (select elo_rating from teams where id = v_match.team_a_id),
        (select elo_rating from teams where id = v_match.team_b_id)
      ) / 2;
      insert into elo_history (team_id, season_id, match_id, elo_before, elo_after, delta)
        select v_match.team_a_id, v_match.season_id, p_match_id,
               elo_rating, elo_rating + v_elo_delta, v_elo_delta
          from teams where id = v_match.team_a_id;
      update teams set elo_rating = elo_rating + v_elo_delta where id = v_match.team_a_id;

      insert into elo_history (team_id, season_id, match_id, elo_before, elo_after, delta)
        select v_match.team_b_id, v_match.season_id, p_match_id,
               elo_rating, elo_rating + v_elo_delta, v_elo_delta
          from teams where id = v_match.team_b_id;
      update teams set elo_rating = elo_rating + v_elo_delta where id = v_match.team_b_id;
      return;
    end if;

    v_elo_delta := calculate_elo_delta(
      (select elo_rating from teams where id = v_winner_id),
      (select elo_rating from teams where id = v_loser_id)
    );

    insert into elo_history (team_id, season_id, match_id, elo_before, elo_after, delta)
      select v_winner_id, v_match.season_id, p_match_id,
             elo_rating, elo_rating + v_elo_delta, v_elo_delta
        from teams where id = v_winner_id;
    update teams set elo_rating = elo_rating + v_elo_delta where id = v_winner_id;

    insert into elo_history (team_id, season_id, match_id, elo_before, elo_after, delta)
      select v_loser_id, v_match.season_id, p_match_id,
             elo_rating, elo_rating - v_elo_delta, -v_elo_delta
        from teams where id = v_loser_id;
    update teams set elo_rating = elo_rating - v_elo_delta where id = v_loser_id;
  end if;
end;
$$;

CREATE OR REPLACE FUNCTION public.trg_on_result_submitted()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
begin
  perform resolve_match(new.match_id);
  return new;
end;
$$;
