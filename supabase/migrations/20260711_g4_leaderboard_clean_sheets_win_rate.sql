-- ============================================================
-- G4 · Leaderboard de jugadores: Vallas Invictas + Win Rate — 2026-07-11
-- ------------------------------------------------------------
-- Extiende get_player_leaderboard con dos métricas nuevas (dominio 8.2):
--   'clean_sheets' : vallas invictas — partidos FINALIZADOS donde el jugador
--                    participó y su equipo recibió 0 goles. Logro COLECTIVO:
--                    se cuenta para todos los participantes (sin filtro de
--                    posición/arquero).
--   'win_rate'     : % de victorias del jugador (entero 0–100), con umbral
--                    mínimo de 3 partidos para no premiar muestras chicas.
--
-- La firma de la función NO cambia (value sigue siendo bigint; el win rate se
-- expresa como porcentaje entero), así que se usa CREATE OR REPLACE sin DROP
-- ni regeneración de tipos. Las ramas goals/mvps/matches quedan idénticas.
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
      where m.status = 'FINALIZADO'
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
      where m.status = 'FINALIZADO'
        and mr.mvp_id is not null
        and (p_zone is null or t.zone = p_zone)
        and (p_season_id is null or m.season_id = p_season_id)
      group by p.id, p.full_name, p.username, p.avatar_url, mr.team_id, t.name, t.zone
      order by count(*) desc limit 20;

  elsif p_stat = 'clean_sheets' then
    -- Valla invicta: partido FINALIZADO con goals_against = 0 del equipo del
    -- jugador. Colectivo: cuenta para todo participante del equipo.
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
      where m.status = 'FINALIZADO'
        and mr.goals_against = 0
        and (p_zone is null or t.zone = p_zone)
        and (p_season_id is null or m.season_id = p_season_id)
      group by p.id, p.full_name, p.username, p.avatar_url, mp2.team_id, t.name, t.zone
      order by count(*) desc limit 20;

  elsif p_stat = 'win_rate' then
    -- % de victorias (entero 0–100). Umbral: mínimo 3 partidos jugados.
    return query
      with stats as (
        select
          mp2.profile_id,
          mp2.team_id,
          count(*) as played,
          count(*) filter (
            where (mp2.team_id = m.team_a_id and mr_a.goals_scored > mr_b.goals_scored)
               or (mp2.team_id = m.team_b_id and mr_b.goals_scored > mr_a.goals_scored)
          ) as wins
        from match_participants mp2
        join matches m on m.id = mp2.match_id and m.status = 'FINALIZADO'
        join match_results mr_a on mr_a.match_id = m.id and mr_a.team_id = m.team_a_id
        join match_results mr_b on mr_b.match_id = m.id and mr_b.team_id = m.team_b_id
        join teams t on t.id = mp2.team_id
        where (p_zone is null or t.zone = p_zone)
          and (p_season_id is null or m.season_id = p_season_id)
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
      where m.status = 'FINALIZADO'
        and (p_zone is null or t.zone = p_zone)
        and (p_season_id is null or m.season_id = p_season_id)
      group by p.id, p.full_name, p.username, p.avatar_url, mp2.team_id, t.name, t.zone
      order by count(*) desc limit 20;
  end if;
end;
$function$;
