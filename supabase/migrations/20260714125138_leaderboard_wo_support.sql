-- ============================================================
-- Leaderboards: soporte de WO — 2026-07-14
-- ------------------------------------------------------------
-- Audit 360° del 13-jul-2026, hallazgo ROJO #4 (parte funcional): los
-- goleadores y el MVP cargados en un reclamo de WO (G6) y aprobados por el
-- admin (resolve_wo_claim inserta el 3-0 con scorers/mvp en match_results)
-- jamás computaban en get_player_leaderboard, porque todas las ramas
-- filtraban m.status = 'FINALIZADO'.
--
-- Cambio: cada rama pasa a status IN ('FINALIZADO','WO_A','WO_B'), con la
-- regla de dominio de que en un WO sólo computa el EQUIPO GANADOR
-- (WO_A -> team_a, WO_B -> team_b):
--   - goals / mvps ......... sólo la fila de match_results del ganador
--                            (el perdedor no tiene resultado, y si tuviera
--                            uno pre-existente queda excluido igual).
--   - clean_sheets ......... los participantes del ganador (recibió 0 en el
--                            3-0); el ausente no suma ni resta.
--   - matches (default) .... los participantes del ganador suman 1 PJ; los
--                            del ausente no (no se presentaron).
--   - win_rate ............. el WO cuenta como partido jugado y ganado para
--                            los participantes del ganador; los resultados
--                            pasan a LEFT JOIN porque el WO tiene una sola
--                            fila de match_results.
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_player_leaderboard(
  p_stat text,
  p_zone text DEFAULT NULL::text,
  p_season_id uuid DEFAULT NULL::uuid
)
RETURNS TABLE(
  rank_position bigint, profile_id uuid, full_name text, username text,
  avatar_url text, team_id uuid, team_name text, zone text, value bigint
)
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
begin
  if p_stat = 'goals' then
    return query
      select
        row_number() over (order by sum((scorer->>'goals')::integer) desc)::bigint,
        p.id, p.full_name, p.username, p.avatar_url, mr.team_id, t.name, t.zone,
        sum((scorer->>'goals')::integer)::bigint
      from match_results mr
      cross join jsonb_array_elements(mr.scorers) as scorer
      join profiles p on p.id = (scorer->>'profile_id')::uuid
      join matches m on m.id = mr.match_id
      join teams t on t.id = mr.team_id
      where ( m.status = 'FINALIZADO'
              or (m.status = 'WO_A' and mr.team_id = m.team_a_id)
              or (m.status = 'WO_B' and mr.team_id = m.team_b_id) )
        and (p_zone is null or t.zone = p_zone)
        and (p_season_id is null or m.season_id = p_season_id)
      group by p.id, p.full_name, p.username, p.avatar_url, mr.team_id, t.name, t.zone
      order by sum((scorer->>'goals')::integer) desc limit 20;

  elsif p_stat = 'mvps' then
    return query
      select
        row_number() over (order by count(*) desc)::bigint,
        p.id, p.full_name, p.username, p.avatar_url, mr.team_id, t.name, t.zone,
        count(*)::bigint
      from match_results mr
      join profiles p on p.id = mr.mvp_id
      join matches m on m.id = mr.match_id
      join teams t on t.id = mr.team_id
      where ( m.status = 'FINALIZADO'
              or (m.status = 'WO_A' and mr.team_id = m.team_a_id)
              or (m.status = 'WO_B' and mr.team_id = m.team_b_id) )
        and mr.mvp_id is not null
        and (p_zone is null or t.zone = p_zone)
        and (p_season_id is null or m.season_id = p_season_id)
      group by p.id, p.full_name, p.username, p.avatar_url, mr.team_id, t.name, t.zone
      order by count(*) desc limit 20;

  elsif p_stat = 'clean_sheets' then
    return query
      select
        row_number() over (order by count(*) desc)::bigint,
        p.id, p.full_name, p.username, p.avatar_url, mp2.team_id, t.name, t.zone,
        count(*)::bigint
      from match_participants mp2
      join profiles p on p.id = mp2.profile_id
      join matches m on m.id = mp2.match_id
      join teams t on t.id = mp2.team_id
      join match_results mr on mr.match_id = m.id and mr.team_id = mp2.team_id
      where ( m.status = 'FINALIZADO'
              or (m.status = 'WO_A' and mp2.team_id = m.team_a_id)
              or (m.status = 'WO_B' and mp2.team_id = m.team_b_id) )
        and mr.goals_against = 0
        and (p_zone is null or t.zone = p_zone)
        and (p_season_id is null or m.season_id = p_season_id)
      group by p.id, p.full_name, p.username, p.avatar_url, mp2.team_id, t.name, t.zone
      order by count(*) desc limit 20;

  elsif p_stat = 'win_rate' then
    return query
      with stats as (
        select
          mp2.profile_id,
          mp2.team_id,
          count(*) as played,
          count(*) filter (
            where (m.status = 'WO_A' and mp2.team_id = m.team_a_id)
               or (m.status = 'WO_B' and mp2.team_id = m.team_b_id)
               or (m.status = 'FINALIZADO' and mp2.team_id = m.team_a_id and mr_a.goals_scored > mr_b.goals_scored)
               or (m.status = 'FINALIZADO' and mp2.team_id = m.team_b_id and mr_b.goals_scored > mr_a.goals_scored)
          ) as wins
        from match_participants mp2
        join matches m on m.id = mp2.match_id
          and ( m.status = 'FINALIZADO'
                or (m.status = 'WO_A' and mp2.team_id = m.team_a_id)
                or (m.status = 'WO_B' and mp2.team_id = m.team_b_id) )
        left join match_results mr_a on mr_a.match_id = m.id and mr_a.team_id = m.team_a_id
        left join match_results mr_b on mr_b.match_id = m.id and mr_b.team_id = m.team_b_id
        join teams t on t.id = mp2.team_id
        where (p_zone is null or t.zone = p_zone)
          and (p_season_id is null or m.season_id = p_season_id)
          -- FINALIZADO sin ambos resultados no computa como jugado (paridad
          -- con el comportamiento previo, donde el INNER JOIN lo excluía).
          and (m.status in ('WO_A','WO_B') or (mr_a.id is not null and mr_b.id is not null))
        group by mp2.profile_id, mp2.team_id
        having count(*) >= 3
      )
      select
        row_number() over (order by round(100.0 * s.wins / s.played) desc, s.played desc)::bigint,
        p.id, p.full_name, p.username, p.avatar_url, s.team_id, t.name, t.zone,
        round(100.0 * s.wins / s.played)::bigint
      from stats s
      join profiles p on p.id = s.profile_id
      join teams t on t.id = s.team_id
      order by round(100.0 * s.wins / s.played) desc, s.played desc limit 20;

  else
    return query
      select
        row_number() over (order by count(*) desc)::bigint,
        p.id, p.full_name, p.username, p.avatar_url, mp2.team_id, t.name, t.zone,
        count(*)::bigint
      from match_participants mp2
      join profiles p on p.id = mp2.profile_id
      join matches m on m.id = mp2.match_id
      join teams t on t.id = mp2.team_id
      where ( m.status = 'FINALIZADO'
              or (m.status = 'WO_A' and mp2.team_id = m.team_a_id)
              or (m.status = 'WO_B' and mp2.team_id = m.team_b_id) )
        and (p_zone is null or t.zone = p_zone)
        and (p_season_id is null or m.season_id = p_season_id)
      group by p.id, p.full_name, p.username, p.avatar_url, mp2.team_id, t.name, t.zone
      order by count(*) desc limit 20;
  end if;
end;
$function$;
