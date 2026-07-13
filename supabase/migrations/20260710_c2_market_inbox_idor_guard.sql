-- ============================================================
-- C2 — get_market_inbox: cierre de IDOR sobre inboxes de chat — 2026-07-10
-- ------------------------------------------------------------
-- Hallazgo (audit 2026-07-10, bloque CRÍTICO):
--   public.get_market_inbox(p_profile_id uuid) es SECURITY DEFINER y no
--   validaba que p_profile_id fuera el perfil del usuario autenticado.
--   Cualquier usuario podía pasar el profiles.id de otra persona (viajan en
--   muchas respuestas) y leer su inbox privado de mercado: contrapartes y
--   preview del último mensaje de cada conversación. Fuga de datos privados.
--
--   get_unread_market_chat_count(p_profile_id) queda protegida de forma
--   transitiva: llama a get_market_inbox(p_profile_id), que ahora devuelve
--   vacío si p_profile_id no es el caller -> el conteo da 0.
--
-- Fix:
--   Agregar un CTE `caller` que resuelve el perfil real desde auth.uid() y
--   exigir p_profile_id = (perfil del caller) en la selección de convos.
--   Si no coincide (o el caller es anónimo => auth.uid() null), el resultado
--   sale vacío. El resto del cuerpo se preserva idéntico.
-- ============================================================

create or replace function public.get_market_inbox(p_profile_id uuid)
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
  with caller as (
    -- Perfil real del usuario autenticado. Si es anon, auth.uid() es null
    -- y este CTE queda vacío => el guard de abajo nunca matchea.
    select pr.id
    from profiles pr
    where pr.auth_user_id = auth.uid()
  ),
  managed_teams as (
    select tm.team_id
    from team_members tm
    where tm.profile_id = p_profile_id
      and tm.role in ('CAPITAN', 'SUBCAPITAN')
  ),
  user_convos as (
    select c.*
    from conversations c
    where c.type = 'MARKET_DM'
      -- IDOR guard: sólo el propio perfil del caller puede leer su inbox.
      and p_profile_id = (select id from caller)
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
