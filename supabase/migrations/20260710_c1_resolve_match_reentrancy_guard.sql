-- ============================================================
-- C1 — resolve_match: guarda anti-reentrada + revoke de EXECUTE — 2026-07-10
-- ------------------------------------------------------------
-- Hallazgo (audit 2026-07-10, bloque CRÍTICO):
--   public.resolve_match(uuid) es SECURITY DEFINER, era ejecutable por
--   `anon` y `authenticated` vía POST /rest/v1/rpc/resolve_match, y NO
--   validaba el estado del partido antes de mutar. Como no hay guarda de
--   reentrada, llamarla repetidamente sobre un partido ya FINALIZADO
--   volvía a sumar season_wins / matches_played / goles / elo_rating e
--   insertaba filas duplicadas en elo_history -> manipulación del ranking.
--
-- Fix:
--   1. Recrear la función con:
--        - guarda de "match no encontrado" (v_match.id is null)
--        - guarda anti-reentrada: retorna sin hacer nada si el partido ya
--          está en un estado terminal (FINALIZADO/WO_A/WO_B/CANCELADO).
--   2. Revocar EXECUTE a PUBLIC/anon/authenticated. La función SÓLO debe
--      ejecutarse desde el trigger interno trg_on_result_submitted(), que
--      corre como SECURITY DEFINER (owner) y no depende de estos grants.
--
-- El cuerpo lógico se preserva idéntico al de
-- 20260331_elo_history_security_definer.sql; sólo se agregan las 2 guardas.
-- ============================================================

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

  -- Guarda: partido inexistente.
  if v_match.id is null then
    return;
  end if;

  -- Guarda anti-reentrada: nunca reprocesar un partido en estado terminal.
  -- Sin esto, una segunda llamada volvía a acumular stats/ELO (double count).
  if v_match.status in ('FINALIZADO', 'WO_A', 'WO_B', 'CANCELADO') then
    return;
  end if;

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

-- Cerrar la superficie REST: sólo el trigger interno (owner) debe ejecutarla.
REVOKE EXECUTE ON FUNCTION public.resolve_match(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.resolve_match(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.resolve_match(uuid) FROM authenticated;
