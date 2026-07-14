-- ─── RPC: confirm_match_proposal ─────────────────────────────────────────────
-- Marks proposal ACEPTADA and updates match to CONFIRMADO with proposal fields.
-- SECURITY DEFINER because matches has no UPDATE policy from client.

create or replace function confirm_match_proposal(p_proposal_id uuid, p_match_id uuid)
returns void
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_proposal match_proposals%rowtype;
begin
  select * into v_proposal from match_proposals where id = p_proposal_id;
  if not found then raise exception 'Proposal not found: %', p_proposal_id; end if;
  if v_proposal.status <> 'PENDIENTE' then
    raise exception 'Proposal is no longer pending (status: %)', v_proposal.status;
  end if;

  update match_proposals set status = 'ACEPTADA' where id = p_proposal_id;

  update matches set
    status           = 'CONFIRMADO',
    scheduled_at     = v_proposal.scheduled_at,
    format           = v_proposal.format,
    duration_minutes = v_proposal.duration_minutes,
    location         = v_proposal.location,
    venue_id         = v_proposal.venue_id,
    signal_amount    = v_proposal.signal_amount,
    total_cost       = v_proposal.total_cost
  where id = p_match_id;
end;
$$;

grant execute on function confirm_match_proposal(uuid, uuid) to authenticated;


-- ─── RPC: checkin_team ────────────────────────────────────────────────────────
-- Stamps team's arrival, upserts participant as result-loader, flips match to
-- EN_VIVO once both teams have checked in.
-- SECURITY DEFINER because matches has no UPDATE policy from client.

create or replace function checkin_team(p_match_id uuid, p_team_id uuid)
returns void
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_match      matches%rowtype;
  v_profile_id uuid;
begin
  select * into v_match from matches where id = p_match_id;
  if not found then raise exception 'Match not found: %', p_match_id; end if;

  -- Identify the calling user's profile
  select id into v_profile_id from profiles where auth_user_id = auth.uid();
  if v_profile_id is null then raise exception 'Profile not found for current user'; end if;

  -- Stamp the correct team's check-in time
  if v_match.team_a_id = p_team_id then
    update matches set checkin_team_a_at = now() where id = p_match_id;
  else
    update matches set checkin_team_b_at = now() where id = p_match_id;
  end if;

  -- Upsert participant: this person is the result-loader for their team
  insert into match_participants
    (match_id, profile_id, team_id, is_result_loader, did_checkin, checkin_at)
  values
    (p_match_id, v_profile_id, p_team_id, true, true, now())
  on conflict (match_id, profile_id)
  do update set
    did_checkin      = true,
    checkin_at       = now(),
    is_result_loader = true;

  -- Re-fetch to see if both teams have now checked in
  select * into v_match from matches where id = p_match_id;
  if v_match.checkin_team_a_at is not null
     and v_match.checkin_team_b_at is not null
     and v_match.status = 'CONFIRMADO'
  then
    update matches set status = 'EN_VIVO', started_at = now() where id = p_match_id;
  end if;
end;
$$;

grant execute on function checkin_team(uuid, uuid) to authenticated;


-- ─── RPC: request_match_cancellation ─────────────────────────────────────────
-- Inserts a cancellation_request and immediately cancels the match.
-- SECURITY DEFINER because cancellation_requests has no INSERT policy and
-- matches has no UPDATE policy from client.

create or replace function request_match_cancellation(
  p_match_id uuid,
  p_team_id  uuid,
  p_reason   text,
  p_notes    text default null
)
returns void
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_match   matches%rowtype;
  v_is_late boolean := false;
begin
  select * into v_match from matches where id = p_match_id;
  if not found then raise exception 'Match not found: %', p_match_id; end if;

  if v_match.scheduled_at is not null then
    v_is_late := (v_match.scheduled_at - now()) < interval '24 hours';
  end if;

  insert into cancellation_requests
    (match_id, requested_by_team_id, reason, notes, is_late)
  values
    (p_match_id, p_team_id, p_reason, p_notes, v_is_late);

  update matches set status = 'CANCELADO' where id = p_match_id;
end;
$$;

grant execute on function request_match_cancellation(uuid, uuid, text, text) to authenticated;
