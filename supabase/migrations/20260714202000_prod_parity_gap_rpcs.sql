-- ============================================================
-- BRECHA DE PARIDAD CON PRODUCCIÓN (2) — RPCs de lectura — 2026-07-14
-- ------------------------------------------------------------
-- Cuatro RPCs que el frontend usa (lib/challenge-actions, lib/ranking-data,
-- lib/team-h2h-data) existen en producción desde la era pre-migraciones
-- (SQL editor, marzo-abril 2026) pero nunca entraron al repo. Detectado al
-- regenerar types/supabase.ts contra el stack local: los tipos perdían esas
-- funciones y tsc rompía. Mismo criterio que 20240101000001_prod_parity_gap.
--
-- Definiciones extraídas de prod via pg_get_functiondef (2026-07-15).
-- Todo idempotente: en prod estos objetos ya existen.
--
-- Grants: el lockdown A2 (20260711012137) corre ANTES que este archivo en el
-- replay local y no las encuentra, así que acá se replica su política:
-- sin PUBLIC/anon, sólo authenticated.
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_team_challenges_inbox(p_team_id uuid)
 RETURNS TABLE(challenge_id uuid, created_at timestamp with time zone, status text, match_type match_type, direction text, opponent_team_id uuid, opponent_team_name text, opponent_shield_url text, opponent_elo integer, creator_name text)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select c.id, c.created_at, c.status, c.match_type,
    case when c.to_team_id = p_team_id then 'RECIBIDO' else 'ENVIADO' end,
    case when c.to_team_id = p_team_id then from_t.id else to_t.id end,
    case when c.to_team_id = p_team_id then from_t.name else to_t.name end,
    case when c.to_team_id = p_team_id then from_t.shield_url else to_t.shield_url end,
    case when c.to_team_id = p_team_id then from_t.elo_rating else to_t.elo_rating end,
    p.full_name
  from challenges c join teams from_t on from_t.id = c.from_team_id join teams to_t on to_t.id = c.to_team_id join profiles p on p.id = c.created_by
  where c.from_team_id = p_team_id or c.to_team_id = p_team_id order by c.created_at desc;
$function$;

CREATE OR REPLACE FUNCTION public.get_team_h2h(p_team_a_id uuid, p_team_b_id uuid)
 RETURNS TABLE(match_id uuid, scheduled_at timestamp with time zone, match_type match_type, team_a_id uuid, team_a_name text, team_a_goals integer, team_b_id uuid, team_b_name text, team_b_goals integer, status match_status)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select
    m.id, m.scheduled_at, m.match_type, m.team_a_id, ta.name, coalesce(ra.goals_scored, 0),
    m.team_b_id, tb.name, coalesce(rb.goals_scored, 0), m.status
  from matches m
  join teams ta on ta.id = m.team_a_id join teams tb on tb.id = m.team_b_id
  left join match_results ra on ra.match_id = m.id and ra.team_id = m.team_a_id
  left join match_results rb on rb.match_id = m.id and rb.team_id = m.team_b_id
  where m.status = 'FINALIZADO' and ((m.team_a_id = p_team_a_id and m.team_b_id = p_team_b_id) or (m.team_a_id = p_team_b_id and m.team_b_id = p_team_a_id))
  order by m.scheduled_at desc limit 10;
$function$;

CREATE OR REPLACE FUNCTION public.get_team_ranking(p_zone text DEFAULT NULL::text, p_category team_category DEFAULT NULL::team_category, p_format team_format DEFAULT NULL::team_format)
 RETURNS TABLE(rank_position bigint, team_id uuid, team_name text, shield_url text, zone text, category team_category, preferred_format team_format, elo_rating integer, fair_play_score numeric, season_wins integer, season_losses integer, season_draws integer, matches_played integer)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    row_number() over (order by t.elo_rating desc)::bigint,
    t.id, t.name, t.shield_url, t.zone, t.category, t.preferred_format, t.elo_rating,
    t.fair_play_score, t.season_wins, t.season_losses, t.season_draws, t.matches_played
  FROM teams t
  WHERE (p_zone IS NULL OR t.zone = p_zone)
    AND (p_category IS NULL OR t.category = p_category)
    AND (p_format IS NULL OR t.preferred_format = p_format)
  ORDER BY t.elo_rating DESC;
$function$;

CREATE OR REPLACE FUNCTION public.search_teams(p_search text DEFAULT NULL::text, p_zone text DEFAULT NULL::text, p_category team_category DEFAULT NULL::team_category, p_format team_format DEFAULT NULL::team_format, p_min_elo integer DEFAULT 0, p_max_elo integer DEFAULT 9999)
 RETURNS TABLE(team_id uuid, team_name text, shield_url text, zone text, category team_category, preferred_format team_format, elo_rating integer, fair_play_score numeric, season_wins integer, season_losses integer, season_draws integer, matches_played integer, in_ranking boolean)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select
    t.id, t.name, t.shield_url, t.zone, t.category, t.preferred_format, t.elo_rating,
    t.fair_play_score, t.season_wins, t.season_losses, t.season_draws, t.matches_played, t.in_ranking
  from teams t
  where (p_search is null or p_search = '' or t.name ilike '%' || p_search || '%')
    and (p_zone is null or t.zone = p_zone)
    and (p_category is null or t.category = p_category)
    and (p_format is null or t.preferred_format = p_format)
    and t.elo_rating between p_min_elo and p_max_elo
  order by t.elo_rating desc limit 50;
$function$;

-- Régimen A2: sin superficie para anon/PUBLIC, sólo authenticated.
REVOKE EXECUTE ON FUNCTION public.get_team_challenges_inbox(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_team_h2h(uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_team_ranking(text, team_category, team_format) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.search_teams(text, text, team_category, team_format, integer, integer) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.get_team_challenges_inbox(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_team_h2h(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_team_ranking(text, team_category, team_format) TO authenticated;
GRANT EXECUTE ON FUNCTION public.search_teams(text, text, team_category, team_format, integer, integer) TO authenticated;
