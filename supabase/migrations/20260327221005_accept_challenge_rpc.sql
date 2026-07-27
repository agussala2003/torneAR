-- ─── RPC: accept_challenge ────────────────────────────────────────────────────
-- Atomically: creates match + MATCH_CHAT conversation, marks challenge ACEPTADA.
-- SECURITY DEFINER because matches/conversations have no INSERT policy from client.

create or replace function accept_challenge(p_challenge_id uuid)
returns json
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_challenge    record;
  v_season_id    uuid;
  v_match_id     uuid;
  v_conv_id      uuid;
begin
  -- 1. Fetch the challenge
  select from_team_id, to_team_id, match_type, status
  into v_challenge
  from challenges
  where id = p_challenge_id;

  if not found then
    raise exception 'Challenge not found: %', p_challenge_id;
  end if;

  if v_challenge.status <> 'ENVIADA' then
    raise exception 'Challenge is no longer open (status: %)', v_challenge.status;
  end if;

  -- 2. Active season (nullable — OK if none)
  select id into v_season_id
  from seasons
  where is_active = true
  limit 1;

  -- 3. Create the match (PENDIENTE, teams from challenge)
  insert into matches (
    challenge_id,
    team_a_id,
    team_b_id,
    match_type,
    season_id,
    status
  ) values (
    p_challenge_id,
    v_challenge.from_team_id,
    v_challenge.to_team_id,
    coalesce(v_challenge.match_type, 'AMISTOSO'),
    v_season_id,
    'PENDIENTE'
  )
  returning id into v_match_id;

  -- 4. Create the match chat conversation
  insert into conversations (type, match_id)
  values ('MATCH_CHAT', v_match_id)
  returning id into v_conv_id;

  -- 5. Mark challenge as ACEPTADA
  update challenges
  set status = 'ACEPTADA', updated_at = now()
  where id = p_challenge_id;

  return json_build_object(
    'matchId',        v_match_id,
    'conversationId', v_conv_id
  );
end;
$$;

grant execute on function accept_challenge(uuid) to authenticated;
