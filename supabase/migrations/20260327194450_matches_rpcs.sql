-- ─── cancellation_requests table (stub for future use) ───────────────────────
create table if not exists cancellation_requests (
  id                  uuid primary key default gen_random_uuid(),
  match_id            uuid not null references matches(id) on delete cascade,
  requested_by_team_id uuid not null references teams(id) on delete cascade,
  reason              text not null,
  notes               text,
  status              text not null default 'PENDIENTE' check (status in ('PENDIENTE','ACEPTADA','RECHAZADA')),
  is_late             boolean not null default false,
  created_at          timestamptz not null default now()
);

alter table cancellation_requests enable row level security;

create policy "Team members can view cancellation requests for their matches"
  on cancellation_requests for select
  using (
    exists (
      select 1 from matches m
      join team_members tm on tm.team_id in (m.team_a_id, m.team_b_id)
      where m.id = cancellation_requests.match_id
        and tm.profile_id = auth.uid()
    )
  );

-- ─── RPC: get_my_matches ──────────────────────────────────────────────────────
create or replace function get_my_matches(p_team_id uuid)
returns table (
  id                    uuid,
  status                match_status,
  match_type            match_type,
  scheduled_at          timestamptz,
  format                team_format,
  venue_id              uuid,
  venue_name            text,
  location              text,
  signal_amount         numeric,
  total_cost            numeric,
  unique_code           text,
  started_at            timestamptz,
  finished_at           timestamptz,
  checkin_team_a_at     timestamptz,
  checkin_team_b_at     timestamptz,
  team_a_id             uuid,
  team_a_name           text,
  team_a_shield_url     text,
  team_a_elo            integer,
  team_b_id             uuid,
  team_b_name           text,
  team_b_shield_url     text,
  team_b_elo            integer,
  result_team_a         integer,
  result_team_b         integer,
  proposal_id           uuid,
  proposal_from_team_id uuid,
  proposal_scheduled_at timestamptz,
  proposal_format       team_format,
  proposal_location     text,
  proposal_status       proposal_status,
  has_pending_cancellation boolean
)
language sql
security definer
stable
as $$
  select
    m.id,
    m.status,
    m.match_type,
    m.scheduled_at,
    m.format,
    m.venue_id,
    v.name                                       as venue_name,
    m.location,
    m.signal_amount,
    m.total_cost,
    m.unique_code,
    m.started_at,
    m.finished_at,
    m.checkin_team_a_at,
    m.checkin_team_b_at,
    ta.id                                        as team_a_id,
    ta.name                                      as team_a_name,
    ta.shield_url                                as team_a_shield_url,
    ta.elo_rating                                as team_a_elo,
    tb.id                                        as team_b_id,
    tb.name                                      as team_b_name,
    tb.shield_url                                as team_b_shield_url,
    tb.elo_rating                                as team_b_elo,
    ra.goals_scored                              as result_team_a,
    rb.goals_scored                              as result_team_b,
    p.id                                         as proposal_id,
    p.from_team_id                               as proposal_from_team_id,
    p.scheduled_at                               as proposal_scheduled_at,
    p.format                                     as proposal_format,
    p.location                                   as proposal_location,
    p.status                                     as proposal_status,
    exists(
      select 1 from cancellation_requests cr
      where cr.match_id = m.id and cr.status = 'PENDIENTE'
    )                                            as has_pending_cancellation
  from matches m
  join teams ta on ta.id = m.team_a_id
  join teams tb on tb.id = m.team_b_id
  left join venues v on v.id = m.venue_id
  left join match_results ra on ra.match_id = m.id and ra.team_id = m.team_a_id
  left join match_results rb on rb.match_id = m.id and rb.team_id = m.team_b_id
  left join lateral (
    select * from match_proposals
    where match_id = m.id and status = 'PENDIENTE'
    order by created_at desc
    limit 1
  ) p on true
  where m.team_a_id = p_team_id or m.team_b_id = p_team_id
  order by
    case when m.status = 'EN_VIVO' then 0
         when m.status in ('CONFIRMADO','PENDIENTE') then 1
         else 2
    end,
    m.scheduled_at desc nulls last
$$;

grant execute on function get_my_matches(uuid) to authenticated;
