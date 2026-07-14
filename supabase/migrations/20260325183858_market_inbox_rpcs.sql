-- RPC: get_market_inbox
-- Returns all MARKET_DM conversations for a user (as player or as captain/subcaptain of their teams)
-- plus last message info and read status.
create or replace function get_market_inbox(p_profile_id uuid)
returns table (
  id               uuid,
  type             text,
  player_id        uuid,
  team_id          uuid,
  created_at       timestamptz,
  player_full_name text,
  player_avatar    text,
  team_name        text,
  team_shield      text,
  last_msg_content text,
  last_msg_at      timestamptz,
  last_msg_sender  uuid,
  last_read_at     timestamptz
)
language sql
security definer
set search_path = public
as $$
  with managed_teams as (
    select tm.team_id
    from team_members tm
    where tm.profile_id = p_profile_id
      and tm.role in ('CAPITAN', 'SUBCAPITAN')
  ),
  user_convos as (
    select c.*
    from conversations c
    where c.type = 'MARKET_DM'
      and (
        c.player_id = p_profile_id
        or c.team_id in (select team_id from managed_teams)
      )
  ),
  last_messages as (
    select distinct on (m.conversation_id)
      m.conversation_id,
      m.content      as last_msg_content,
      m.created_at   as last_msg_at,
      m.sender_profile_id as last_msg_sender
    from messages m
    where m.conversation_id in (select id from user_convos)
    order by m.conversation_id, m.created_at desc
  )
  select
    uc.id,
    uc.type::text,
    uc.player_id,
    uc.team_id,
    uc.created_at,
    p.full_name      as player_full_name,
    p.avatar_url     as player_avatar,
    t.name           as team_name,
    t.shield_url     as team_shield,
    lm.last_msg_content,
    lm.last_msg_at,
    lm.last_msg_sender,
    cr.last_read_at
  from user_convos uc
  left join profiles p on p.id = uc.player_id
  left join teams t on t.id = uc.team_id
  left join last_messages lm on lm.conversation_id = uc.id
  left join conversation_reads cr
    on cr.conversation_id = uc.id
    and cr.profile_id = p_profile_id
  order by coalesce(lm.last_msg_at, uc.created_at) desc;
$$;

-- RPC: get_unread_market_chat_count
-- Returns the count of MARKET_DM conversations with unread messages for the user.
create or replace function get_unread_market_chat_count(p_profile_id uuid)
returns integer
language sql
security definer
set search_path = public
as $$
  select count(*)::integer
  from (
    select 1
    from get_market_inbox(p_profile_id) inbox
    where
      inbox.last_msg_at is not null
      and inbox.last_msg_sender != p_profile_id
      and (
        inbox.last_read_at is null
        or inbox.last_msg_at > inbox.last_read_at
      )
  ) unread_rows;
$$;
