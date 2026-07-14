-- ============================================================
-- SECURITY PATCH — 2026-03-31
-- Fixes:
--   WARN: Security Definer Views → security_invoker = true
--   WARN: Function search_path mutable → SET search_path = 'public'
--   WARN: Auth RLS Initialization Plan → (select auth.uid()) wrapper
-- ============================================================

-- ─── 1. Security Definer Views ────────────────────────────────────────────────
ALTER VIEW public.v_venues      SET (security_invoker = true);
ALTER VIEW public.v_player_stats SET (security_invoker = true);
ALTER VIEW public.v_team_ranking SET (security_invoker = true);


-- ─── 2. Function search_path fixes ────────────────────────────────────────────
-- (calculate_elo_delta, resolve_match, trg_on_result_submitted done in prior migration)

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = 'public'
AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;

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
SET search_path = 'public'
AS $$
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
$$;

CREATE OR REPLACE FUNCTION public.get_nearest_venues(
  p_lat numeric, p_lng numeric, p_limit integer DEFAULT 5
)
RETURNS TABLE(id uuid, name text, address text, zone_id uuid, lat numeric, lng numeric,
              phone text, formats team_format[], distance_km numeric)
LANGUAGE sql
STABLE
SET search_path = 'public'
AS $$
  select
    v.id, v.name, v.address, v.zone_id, v.lat, v.lng, v.phone, v.formats,
    round(
      6371 * acos(
        least(1.0,
          cos(radians(p_lat)) * cos(radians(v.lat)) *
          cos(radians(v.lng) - radians(p_lng)) +
          sin(radians(p_lat)) * sin(radians(v.lat))
        )
      )::numeric, 2
    ) as distance_km
  from venues v
  where v.is_active = true
  order by distance_km asc
  limit p_limit;
$$;

CREATE OR REPLACE FUNCTION public.is_ranking_match_allowed(
  p_team_a_id uuid, p_team_b_id uuid, p_season_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SET search_path = 'public'
AS $$
declare
  v_match_count    integer;
  v_last_match_at  timestamptz;
  v_shared_players integer;
begin
  select count(*) into v_match_count
    from matches
    where season_id = p_season_id
      and match_type = 'RANKING'
      and status in ('CONFIRMADO', 'EN_VIVO', 'FINALIZADO', 'WO_A', 'WO_B')
      and (
        (team_a_id = p_team_a_id and team_b_id = p_team_b_id)
        or (team_a_id = p_team_b_id and team_b_id = p_team_a_id)
      );

  if v_match_count >= 3 then return false; end if;

  select max(scheduled_at) into v_last_match_at
    from matches
    where match_type = 'RANKING'
      and status in ('FINALIZADO', 'WO_A', 'WO_B')
      and (
        (team_a_id = p_team_a_id and team_b_id = p_team_b_id)
        or (team_a_id = p_team_b_id and team_b_id = p_team_a_id)
      );

  if v_last_match_at is not null
     and v_last_match_at > now() - interval '30 days' then
    return false;
  end if;

  select count(*) into v_shared_players
    from team_members tm1
    join team_members tm2 on tm1.profile_id = tm2.profile_id
    where tm1.team_id = p_team_a_id and tm2.team_id = p_team_b_id;

  if v_shared_players >= 2 then return false; end if;

  return true;
end;
$$;

CREATE OR REPLACE FUNCTION public.close_season(p_season_id uuid)
RETURNS void
LANGUAGE plpgsql
SET search_path = 'public'
AS $$
declare
  v_team record;
  v_new_elo integer;
begin
  update seasons set is_active = false where id = p_season_id;
  for v_team in select id, elo_rating from teams loop
    v_new_elo := greatest(900, 1000 + round((v_team.elo_rating - 1000) * 0.5));
    update teams set
      elo_rating           = v_new_elo,
      season_wins          = 0,
      season_losses        = 0,
      season_draws         = 0,
      season_goals_for     = 0,
      season_goals_against = 0
    where id = v_team.id;
  end loop;
end;
$$;

CREATE OR REPLACE FUNCTION public.deactivate_expired_market_posts()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
begin
  update market_team_posts
  set is_active = false
  where is_active = true
    and match_date is not null
    and match_date::date < current_date;

  update market_player_posts
  set is_active = false
  where is_active = true
    and created_at < now() - interval '14 days';
end;
$$;


-- ─── 3. RLS policies: auth.uid() → (select auth.uid()) ───────────────────────
-- profiles
DROP POLICY IF EXISTS "profiles_update_own" ON profiles;
CREATE POLICY "profiles_update_own" ON profiles FOR UPDATE
  USING ((select auth.uid()) = auth_user_id);

-- cancellation_requests
DROP POLICY IF EXISTS "Team members can view cancellation requests for their matches" ON cancellation_requests;
CREATE POLICY "Team members can view cancellation requests for their matches"
  ON cancellation_requests FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM matches m
      JOIN team_members tm ON tm.team_id IN (m.team_a_id, m.team_b_id)
      JOIN profiles p ON p.id = tm.profile_id
      WHERE m.id = cancellation_requests.match_id
        AND p.auth_user_id = (SELECT auth.uid())
    )
  );

-- challenges
DROP POLICY IF EXISTS "challenges_select_involved" ON challenges;
CREATE POLICY "challenges_select_involved" ON challenges FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM team_members tm
      JOIN profiles p ON p.id = tm.profile_id
      WHERE tm.team_id = ANY(ARRAY[challenges.from_team_id, challenges.to_team_id])
        AND p.auth_user_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "challenges_update_cancel_by_sender" ON challenges;
CREATE POLICY "challenges_update_cancel_by_sender" ON challenges FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM team_members tm
      JOIN profiles p ON p.id = tm.profile_id
      WHERE tm.team_id = challenges.from_team_id
        AND p.auth_user_id = (SELECT auth.uid())
        AND tm.role IN ('CAPITAN', 'SUBCAPITAN')
    )
  )
  WITH CHECK (
    status = 'CANCELADA'
    AND EXISTS (
      SELECT 1 FROM team_members tm
      JOIN profiles p ON p.id = tm.profile_id
      WHERE tm.team_id = challenges.from_team_id
        AND p.auth_user_id = (SELECT auth.uid())
        AND tm.role IN ('CAPITAN', 'SUBCAPITAN')
    )
  );

DROP POLICY IF EXISTS "challenges_update_reject_by_receiver" ON challenges;
CREATE POLICY "challenges_update_reject_by_receiver" ON challenges FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM team_members tm
      JOIN profiles p ON p.id = tm.profile_id
      WHERE tm.team_id = challenges.to_team_id
        AND p.auth_user_id = (SELECT auth.uid())
        AND tm.role IN ('CAPITAN', 'SUBCAPITAN')
    )
  )
  WITH CHECK (
    status = 'RECHAZADA'
    AND EXISTS (
      SELECT 1 FROM team_members tm
      JOIN profiles p ON p.id = tm.profile_id
      WHERE tm.team_id = challenges.to_team_id
        AND p.auth_user_id = (SELECT auth.uid())
        AND tm.role IN ('CAPITAN', 'SUBCAPITAN')
    )
  );

-- conversations
DROP POLICY IF EXISTS "conversations_select_participants" ON conversations;
CREATE POLICY "conversations_select_participants" ON conversations FOR SELECT
  USING (
    (type = 'MATCH_CHAT' AND EXISTS (
      SELECT 1 FROM team_members tm
      JOIN profiles p ON p.id = tm.profile_id
      WHERE tm.team_id IN (
        SELECT team_a_id FROM matches WHERE id = conversations.match_id
        UNION
        SELECT team_b_id FROM matches WHERE id = conversations.match_id
      ) AND p.auth_user_id = (SELECT auth.uid())
    ))
    OR
    (type = 'MARKET_DM' AND (
      player_id = (SELECT id FROM profiles WHERE auth_user_id = (SELECT auth.uid()))
      OR EXISTS (
        SELECT 1 FROM team_members tm
        JOIN profiles p ON p.id = tm.profile_id
        WHERE tm.team_id = conversations.team_id
          AND p.auth_user_id = (SELECT auth.uid())
      )
    ))
  );

-- market_player_posts
DROP POLICY IF EXISTS "market_player_posts_delete_own" ON market_player_posts;
CREATE POLICY "market_player_posts_delete_own" ON market_player_posts FOR DELETE
  USING (profile_id = (SELECT id FROM profiles WHERE auth_user_id = (SELECT auth.uid())));

DROP POLICY IF EXISTS "market_player_posts_update_own" ON market_player_posts;
CREATE POLICY "market_player_posts_update_own" ON market_player_posts FOR UPDATE
  USING (profile_id = (SELECT id FROM profiles WHERE auth_user_id = (SELECT auth.uid())))
  WITH CHECK (profile_id = (SELECT id FROM profiles WHERE auth_user_id = (SELECT auth.uid())));

-- market_team_posts
DROP POLICY IF EXISTS "market_team_posts_delete_by_team_admin" ON market_team_posts;
CREATE POLICY "market_team_posts_delete_by_team_admin" ON market_team_posts FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM team_members tm
      JOIN profiles p ON p.id = tm.profile_id
      WHERE tm.team_id = market_team_posts.team_id
        AND p.auth_user_id = (SELECT auth.uid())
        AND tm.role IN ('CAPITAN', 'SUBCAPITAN')
    )
  );

DROP POLICY IF EXISTS "market_team_posts_update_by_team_admin" ON market_team_posts;
CREATE POLICY "market_team_posts_update_by_team_admin" ON market_team_posts FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM team_members tm
      JOIN profiles p ON p.id = tm.profile_id
      WHERE tm.team_id = market_team_posts.team_id
        AND p.auth_user_id = (SELECT auth.uid())
        AND tm.role IN ('CAPITAN', 'SUBCAPITAN')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM team_members tm
      JOIN profiles p ON p.id = tm.profile_id
      WHERE tm.team_id = market_team_posts.team_id
        AND p.auth_user_id = (SELECT auth.uid())
        AND tm.role IN ('CAPITAN', 'SUBCAPITAN')
    )
  );

-- match_dispute_votes
DROP POLICY IF EXISTS "dispute_votes_select_by_participant" ON match_dispute_votes;
CREATE POLICY "dispute_votes_select_by_participant" ON match_dispute_votes FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM match_participants mp
      JOIN profiles p ON p.id = mp.profile_id
      WHERE mp.match_id = match_dispute_votes.match_id
        AND p.auth_user_id = (SELECT auth.uid())
    )
  );

-- match_participants
DROP POLICY IF EXISTS "match_participants_update_own_or_team_admin" ON match_participants;
CREATE POLICY "match_participants_update_own_or_team_admin" ON match_participants FOR UPDATE
  USING (
    profile_id = (SELECT id FROM profiles WHERE auth_user_id = (SELECT auth.uid()))
    OR EXISTS (
      SELECT 1 FROM team_members tm
      JOIN profiles p ON p.id = tm.profile_id
      WHERE tm.team_id = match_participants.team_id
        AND p.auth_user_id = (SELECT auth.uid())
        AND tm.role IN ('CAPITAN', 'SUBCAPITAN')
    )
  )
  WITH CHECK (
    profile_id = (SELECT id FROM profiles WHERE auth_user_id = (SELECT auth.uid()))
    OR EXISTS (
      SELECT 1 FROM team_members tm
      JOIN profiles p ON p.id = tm.profile_id
      WHERE tm.team_id = match_participants.team_id
        AND p.auth_user_id = (SELECT auth.uid())
        AND tm.role IN ('CAPITAN', 'SUBCAPITAN')
    )
  );

-- match_proposals
DROP POLICY IF EXISTS "match_proposals_select_match_members" ON match_proposals;
CREATE POLICY "match_proposals_select_match_members" ON match_proposals FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM team_members tm
      JOIN profiles p ON p.id = tm.profile_id
      WHERE tm.team_id IN (
        SELECT team_a_id FROM matches WHERE id = match_proposals.match_id
        UNION
        SELECT team_b_id FROM matches WHERE id = match_proposals.match_id
      ) AND p.auth_user_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "match_proposals_update_by_other_team_admin" ON match_proposals;
CREATE POLICY "match_proposals_update_by_other_team_admin" ON match_proposals FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM team_members tm
      JOIN profiles p ON p.id = tm.profile_id
      WHERE tm.team_id IN (
        SELECT team_a_id FROM matches WHERE id = match_proposals.match_id
        UNION
        SELECT team_b_id FROM matches WHERE id = match_proposals.match_id
      )
        AND tm.team_id <> match_proposals.from_team_id
        AND p.auth_user_id = (SELECT auth.uid())
        AND tm.role IN ('CAPITAN', 'SUBCAPITAN')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM team_members tm
      JOIN profiles p ON p.id = tm.profile_id
      WHERE tm.team_id IN (
        SELECT team_a_id FROM matches WHERE id = match_proposals.match_id
        UNION
        SELECT team_b_id FROM matches WHERE id = match_proposals.match_id
      )
        AND tm.team_id <> match_proposals.from_team_id
        AND p.auth_user_id = (SELECT auth.uid())
        AND tm.role IN ('CAPITAN', 'SUBCAPITAN')
    )
  );

DROP POLICY IF EXISTS "match_proposals_cancel_by_sender" ON match_proposals;
CREATE POLICY "match_proposals_cancel_by_sender" ON match_proposals FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM team_members tm
      JOIN profiles p ON p.id = tm.profile_id
      WHERE tm.team_id = match_proposals.from_team_id
        AND p.auth_user_id = (SELECT auth.uid())
        AND tm.role IN ('CAPITAN', 'SUBCAPITAN')
    )
  )
  WITH CHECK (
    status = 'RECHAZADA'
    AND EXISTS (
      SELECT 1 FROM team_members tm
      JOIN profiles p ON p.id = tm.profile_id
      WHERE tm.team_id = match_proposals.from_team_id
        AND p.auth_user_id = (SELECT auth.uid())
        AND tm.role IN ('CAPITAN', 'SUBCAPITAN')
    )
  );

-- match_results
DROP POLICY IF EXISTS "match_results_update_by_loader_or_admin" ON match_results;
CREATE POLICY "match_results_update_by_loader_or_admin" ON match_results FOR UPDATE
  USING (
    submitted_by = (SELECT id FROM profiles WHERE auth_user_id = (SELECT auth.uid()))
    OR EXISTS (
      SELECT 1 FROM team_members tm
      JOIN profiles p ON p.id = tm.profile_id
      WHERE tm.team_id = match_results.team_id
        AND p.auth_user_id = (SELECT auth.uid())
        AND tm.role IN ('CAPITAN', 'SUBCAPITAN')
    )
  )
  WITH CHECK (
    submitted_by = (SELECT id FROM profiles WHERE auth_user_id = (SELECT auth.uid()))
    OR EXISTS (
      SELECT 1 FROM team_members tm
      JOIN profiles p ON p.id = tm.profile_id
      WHERE tm.team_id = match_results.team_id
        AND p.auth_user_id = (SELECT auth.uid())
        AND tm.role IN ('CAPITAN', 'SUBCAPITAN')
    )
  );

-- messages
DROP POLICY IF EXISTS "messages_conversation_members" ON messages;
CREATE POLICY "messages_conversation_members" ON messages FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM conversations c
      WHERE c.id = messages.conversation_id
        AND (
          (c.type = 'MARKET_DM' AND c.player_id = (SELECT id FROM profiles WHERE auth_user_id = (SELECT auth.uid())))
          OR (c.type = 'MARKET_DM' AND EXISTS (
            SELECT 1 FROM team_members tm
            JOIN profiles p ON p.id = tm.profile_id
            WHERE tm.team_id = c.team_id AND p.auth_user_id = (SELECT auth.uid())
          ))
          OR (c.type = 'MATCH_CHAT' AND EXISTS (
            SELECT 1 FROM team_members tm
            JOIN profiles p ON p.id = tm.profile_id
            WHERE tm.team_id IN (
              SELECT team_a_id FROM matches WHERE id = c.match_id
              UNION
              SELECT team_b_id FROM matches WHERE id = c.match_id
            ) AND p.auth_user_id = (SELECT auth.uid())
          ))
        )
    )
  );

-- notifications
DROP POLICY IF EXISTS "notifications_own" ON notifications;
CREATE POLICY "notifications_own" ON notifications FOR ALL
  USING (profile_id = (SELECT id FROM profiles WHERE auth_user_id = (SELECT auth.uid())));

-- result_dispute_votes
DROP POLICY IF EXISTS "result_dispute_votes_select_participants" ON result_dispute_votes;
CREATE POLICY "result_dispute_votes_select_participants" ON result_dispute_votes FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM team_members tm
      JOIN profiles p ON p.id = tm.profile_id
      WHERE tm.team_id IN (
        SELECT team_a_id FROM matches WHERE id = result_dispute_votes.match_id
        UNION
        SELECT team_b_id FROM matches WHERE id = result_dispute_votes.match_id
      ) AND p.auth_user_id = (SELECT auth.uid())
    )
  );

-- team_join_requests
DROP POLICY IF EXISTS "team_join_requests_delete_own_pending" ON team_join_requests;
CREATE POLICY "team_join_requests_delete_own_pending" ON team_join_requests FOR DELETE
  USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = team_join_requests.profile_id AND p.auth_user_id = (SELECT auth.uid()))
    AND status = 'PENDIENTE'
  );

DROP POLICY IF EXISTS "team_join_requests_select_own_or_team_admin" ON team_join_requests;
CREATE POLICY "team_join_requests_select_own_or_team_admin" ON team_join_requests FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = team_join_requests.profile_id AND p.auth_user_id = (SELECT auth.uid()))
    OR EXISTS (
      SELECT 1 FROM team_members tm
      JOIN profiles p ON p.id = tm.profile_id
      WHERE tm.team_id = team_join_requests.team_id
        AND p.auth_user_id = (SELECT auth.uid())
        AND tm.role IN ('CAPITAN', 'SUBCAPITAN')
    )
  );

DROP POLICY IF EXISTS "team_join_requests_update_by_team_admin" ON team_join_requests;
CREATE POLICY "team_join_requests_update_by_team_admin" ON team_join_requests FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM team_members tm
      JOIN profiles p ON p.id = tm.profile_id
      WHERE tm.team_id = team_join_requests.team_id
        AND p.auth_user_id = (SELECT auth.uid())
        AND tm.role IN ('CAPITAN', 'SUBCAPITAN')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM team_members tm
      JOIN profiles p ON p.id = tm.profile_id
      WHERE tm.team_id = team_join_requests.team_id
        AND p.auth_user_id = (SELECT auth.uid())
        AND tm.role IN ('CAPITAN', 'SUBCAPITAN')
    )
    AND status IN ('PENDIENTE', 'ACEPTADA', 'RECHAZADA')
  );

DROP POLICY IF EXISTS "team_join_requests_update_own_to_pending" ON team_join_requests;
CREATE POLICY "team_join_requests_update_own_to_pending" ON team_join_requests FOR UPDATE
  USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = team_join_requests.profile_id AND p.auth_user_id = (SELECT auth.uid()))
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = team_join_requests.profile_id AND p.auth_user_id = (SELECT auth.uid()))
    AND status = 'PENDIENTE'
  );

-- team_members
DROP POLICY IF EXISTS "team_members_delete_by_team_admin" ON team_members;
CREATE POLICY "team_members_delete_by_team_admin" ON team_members FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM team_members tm_admin
      JOIN profiles p_admin ON p_admin.id = tm_admin.profile_id
      WHERE tm_admin.team_id = team_members.team_id
        AND p_admin.auth_user_id = (SELECT auth.uid())
        AND tm_admin.role IN ('CAPITAN', 'SUBCAPITAN')
    )
  );

DROP POLICY IF EXISTS "team_members_update_by_team_admin" ON team_members;
CREATE POLICY "team_members_update_by_team_admin" ON team_members FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM team_members tm_admin
      JOIN profiles p_admin ON p_admin.id = tm_admin.profile_id
      WHERE tm_admin.team_id = team_members.team_id
        AND p_admin.auth_user_id = (SELECT auth.uid())
        AND tm_admin.role IN ('CAPITAN', 'SUBCAPITAN')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM team_members tm_admin
      JOIN profiles p_admin ON p_admin.id = tm_admin.profile_id
      WHERE tm_admin.team_id = team_members.team_id
        AND p_admin.auth_user_id = (SELECT auth.uid())
        AND tm_admin.role IN ('CAPITAN', 'SUBCAPITAN')
    )
  );

-- teams
DROP POLICY IF EXISTS "teams_update_by_captain" ON teams;
CREATE POLICY "teams_update_by_captain" ON teams FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM team_members tm
      JOIN profiles p ON p.id = tm.profile_id
      WHERE tm.team_id = teams.id
        AND p.auth_user_id = (SELECT auth.uid())
        AND tm.role IN ('CAPITAN', 'SUBCAPITAN')
    )
  );

-- wo_claims
DROP POLICY IF EXISTS "wo_claims_select_match_members" ON wo_claims;
CREATE POLICY "wo_claims_select_match_members" ON wo_claims FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM team_members tm
      JOIN profiles p ON p.id = tm.profile_id
      WHERE tm.team_id IN (
        SELECT team_a_id FROM matches WHERE id = wo_claims.match_id
        UNION
        SELECT team_b_id FROM matches WHERE id = wo_claims.match_id
      ) AND p.auth_user_id = (SELECT auth.uid())
    )
  );
