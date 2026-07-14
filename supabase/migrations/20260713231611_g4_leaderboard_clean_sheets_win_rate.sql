-- ============================================================
-- G4 · Leaderboards: Vallas Invictas + Win Rate — 2026-07-13
-- ------------------------------------------------------------
-- ⚠️ RECONCILIACIÓN (2026-07-14): esta migración fue aplicada directamente en
-- producción como la versión remota 20260713231611
-- (g4_leaderboard_clean_sheets_win_rate) sin archivo local. Este archivo es
-- la descarga literal de supabase_migrations.schema_migrations para que el
-- repo vuelva a ser la fuente de la verdad. NO editar: el estado vigente de
-- la función lo define 20260714_leaderboard_wo_support.sql.
--
-- Contenido original (commit 6aeaa23, G4): agrega las ramas clean_sheets
-- (valla invicta colectiva) y win_rate (% de victorias, umbral 3 partidos)
-- a get_player_leaderboard.
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
