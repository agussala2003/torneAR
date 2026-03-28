-- ─── Add reason column to wo_claims if not exists ────────────────────────────
alter table wo_claims add column if not exists reason text;

-- ─── RPC: get_match_detail ───────────────────────────────────────────────────
create or replace function get_match_detail(p_match_id uuid, p_team_id uuid)
returns json
language sql
security definer
stable
as $$
  select json_build_object(
    'id',                 m.id,
    'status',             m.status,
    'match_type',         m.match_type,
    'format',             m.format,
    'scheduled_at',       m.scheduled_at,
    'duration_minutes',   m.duration_minutes,
    'location',           m.location,
    'venue_id',           m.venue_id,
    'venue_name',         v.name,
    'venue_address',      v.address,
    'venue_lat',          v.lat,
    'venue_lng',          v.lng,
    'signal_amount',      m.signal_amount,
    'total_cost',         m.total_cost,
    'unique_code',        m.unique_code,
    'started_at',         m.started_at,
    'finished_at',        m.finished_at,
    'checkin_team_a_at',  m.checkin_team_a_at,
    'checkin_team_b_at',  m.checkin_team_b_at,
    'team_a', json_build_object(
      'id',          ta.id,
      'name',        ta.name,
      'shield_url',  ta.shield_url,
      'elo_rating',  ta.elo_rating
    ),
    'team_b', json_build_object(
      'id',          tb.id,
      'name',        tb.name,
      'shield_url',  tb.shield_url,
      'elo_rating',  tb.elo_rating
    ),
    'my_team_id', p_team_id,
    'my_role', (
      select tm.role
      from team_members tm
      join profiles pr on pr.id = tm.profile_id
      where tm.team_id = p_team_id
        and pr.auth_user_id = auth.uid()
      limit 1
    ),
    -- is_result_loader: true if participant flag set OR user is captain/subcaptain
    'is_result_loader', (
      exists (
        select 1
        from match_participants mp
        join profiles pr on pr.id = mp.profile_id
        where mp.match_id = m.id
          and mp.team_id  = p_team_id
          and mp.is_result_loader = true
          and pr.auth_user_id = auth.uid()
      )
      or
      exists (
        select 1
        from team_members tm
        join profiles pr on pr.id = tm.profile_id
        where tm.team_id = p_team_id
          and pr.auth_user_id = auth.uid()
          and tm.role in ('CAPITAN', 'SUBCAPITAN')
      )
    ),
    'active_proposal', (
      select json_build_object(
        'id',                p.id,
        'match_id',          p.match_id,
        'from_team_id',      p.from_team_id,
        'proposed_by_name',  pr2.full_name,
        'format',            p.format,
        'match_type',        p.match_type,
        'scheduled_at',      p.scheduled_at,
        'duration_minutes',  p.duration_minutes,
        'location',          p.location,
        'venue_id',          p.venue_id,
        'venue_name',        pv.name,
        'venue_address',     pv.address,
        'venue_lat',         pv.lat,
        'venue_lng',         pv.lng,
        'signal_amount',     p.signal_amount,
        'total_cost',        p.total_cost,
        'status',            p.status,
        'created_at',        p.created_at
      )
      from match_proposals p
      join profiles pr2 on pr2.id = p.proposed_by
      left join venues pv on pv.id = p.venue_id
      where p.match_id = m.id
        and p.status = 'PENDIENTE'
      order by p.created_at desc
      limit 1
    ),
    'my_result', (
      select json_build_object(
        'team_id',       r.team_id,
        'goals_scored',  r.goals_scored,
        'goals_against', r.goals_against,
        'submitted_at',  r.submitted_at,
        'scorers', (
          select coalesce(json_agg(
            json_build_object(
              'profile_id', sc->>'profile_id',
              'full_name',  sprof.full_name,
              'goals',      (sc->>'goals')::int
            )
          ), '[]'::json)
          from jsonb_array_elements(r.scorers) as sc
          join profiles sprof on sprof.id = (sc->>'profile_id')::uuid
        ),
        'mvp', case when r.mvp_id is not null then json_build_object(
          'id',         mvppr.id,
          'full_name',  mvppr.full_name,
          'username',   mvppr.username,
          'avatar_url', mvppr.avatar_url
        ) else null end
      )
      from match_results r
      left join profiles mvppr on mvppr.id = r.mvp_id
      where r.match_id = m.id
        and r.team_id = p_team_id
      limit 1
    ),
    'opponent_result', (
      select json_build_object(
        'team_id',       r.team_id,
        'goals_scored',  r.goals_scored,
        'goals_against', r.goals_against,
        'submitted_at',  r.submitted_at,
        'scorers', (
          select coalesce(json_agg(
            json_build_object(
              'profile_id', sc->>'profile_id',
              'full_name',  sprof.full_name,
              'goals',      (sc->>'goals')::int
            )
          ), '[]'::json)
          from jsonb_array_elements(r.scorers) as sc
          join profiles sprof on sprof.id = (sc->>'profile_id')::uuid
        ),
        'mvp', case when r.mvp_id is not null then json_build_object(
          'id',         mvppr.id,
          'full_name',  mvppr.full_name,
          'username',   mvppr.username,
          'avatar_url', mvppr.avatar_url
        ) else null end
      )
      from match_results r
      left join profiles mvppr on mvppr.id = r.mvp_id
      where r.match_id = m.id
        and r.team_id <> p_team_id
      limit 1
    ),
    'participants', (
      select coalesce(json_agg(
        json_build_object(
          'profile_id',       mp.profile_id,
          'full_name',        ppr.full_name,
          'username',         ppr.username,
          'avatar_url',       ppr.avatar_url,
          'team_id',          mp.team_id,
          'is_guest',         mp.is_guest,
          'did_checkin',      mp.did_checkin,
          'checkin_at',       mp.checkin_at,
          'is_result_loader', mp.is_result_loader
        )
      ), '[]'::json)
      from match_participants mp
      join profiles ppr on ppr.id = mp.profile_id
      where mp.match_id = m.id
    ),
    'conversation_id', (
      select c.id
      from conversations c
      where c.match_id = m.id
        and c.type = 'MATCH_CHAT'
      limit 1
    ),
    'wo_claim', (
      select json_build_object(
        'id',               wc.id,
        'claiming_team_id', wc.claiming_team_id,
        'reason',           wc.reason,
        'photo_url',        wc.photo_url,
        'status',           wc.status,
        'admin_notes',      wc.admin_notes,
        'created_at',       wc.created_at
      )
      from wo_claims wc
      where wc.match_id = m.id
      limit 1
    ),
    'cancellation_request', (
      select json_build_object(
        'id',                    cr.id,
        'requested_by_team_id',  cr.requested_by_team_id,
        'reason',                cr.reason,
        'notes',                 cr.notes,
        'status',                cr.status,
        'created_at',            cr.created_at,
        'is_late',               cr.is_late
      )
      from cancellation_requests cr
      where cr.match_id = m.id
        and cr.status = 'PENDIENTE'
      order by cr.created_at desc
      limit 1
    )
  )
  from matches m
  join teams ta on ta.id = m.team_a_id
  join teams tb on tb.id = m.team_b_id
  left join venues v on v.id = m.venue_id
  where m.id = p_match_id
    and (m.team_a_id = p_team_id or m.team_b_id = p_team_id)
$$;

grant execute on function get_match_detail(uuid, uuid) to authenticated;
