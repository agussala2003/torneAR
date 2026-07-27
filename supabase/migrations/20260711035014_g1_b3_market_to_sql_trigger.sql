-- ============================================================
-- G1 · Bloque B.3 — Market a trigger SQL + arquitectura unificada — 2026-07-11
-- ------------------------------------------------------------
-- Cierra la unificación del push:
--   1. Porta la resolución de destinatarios de la edge function
--      notify-market-message a un trigger SQL (inserta filas MENSAJE_NUEVO).
--   2. Reemplaza el trigger viejo (on_market_message_insert -> edge function)
--      por el nuevo trigger SQL.
--   3. Quita la exclusión temporal de MENSAJE_NUEVO del dispatcher: ahora los
--      mensajes de mercado también empujan por el path único push-dispatch.
--
-- Resultado: UNA sola edge function de push (push-dispatch); toda la lógica de
-- "quién recibe qué" vive en SQL. La edge function notify-market-message queda
-- retirada (tombstone + borrado manual desde el dashboard).
-- ============================================================

-- ─── 1. Resolución de destinatarios de market (antes en la edge function) ────
create or replace function public.notify_market_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_type text;
  v_player_id uuid;
  v_team_id uuid;
  v_sender_name text;
  v_team_name text;
  v_title text;
  v_body text;
begin
  select type, player_id, team_id
    into v_type, v_player_id, v_team_id
  from conversations where id = new.conversation_id;

  -- Sólo conversaciones de mercado.
  if v_type is distinct from 'MARKET_DM' then
    return new;
  end if;

  -- Título según remitente.
  if new.sender_team_id is not null then
    select name into v_team_name from teams where id = new.sender_team_id;
    v_title := 'El equipo ' || coalesce(v_team_name, 'rival') || ' te escribió';
  else
    select full_name into v_sender_name from profiles where id = new.sender_profile_id;
    v_title := coalesce(v_sender_name, 'Alguien') || ' quiere unirse a tu equipo';
  end if;

  -- Cuerpo según tipo de mensaje.
  if new.message_type = 'TEAM_INVITE' then
    v_body := 'Te enviaron un código de invitación al equipo';
  elsif new.message_type = 'MATCH_INVITE' then
    v_body := 'Te invitaron a un partido';
  else
    v_body := case when length(new.content) > 80
                   then left(new.content, 77) || '...'
                   else new.content end;
  end if;

  -- Destinatarios (excluyendo al remitente).
  if new.sender_team_id is null then
    -- Jugador -> CAPITAN/SUBCAPITAN del equipo de la conversación.
    insert into notifications (profile_id, type, title, body, data, is_read)
    select tm.profile_id, 'MENSAJE_NUEVO', v_title, v_body,
           jsonb_build_object('conversation_id', new.conversation_id), false
    from team_members tm
    where tm.team_id = v_team_id
      and tm.role in ('CAPITAN', 'SUBCAPITAN')
      and tm.profile_id <> new.sender_profile_id;
  else
    -- Equipo -> jugador de la conversación.
    if v_player_id is distinct from new.sender_profile_id then
      insert into notifications (profile_id, type, title, body, data, is_read)
      values (v_player_id, 'MENSAJE_NUEVO', v_title, v_body,
              jsonb_build_object('conversation_id', new.conversation_id), false);
    end if;
  end if;

  return new;
end;
$$;

revoke execute on function public.notify_market_message() from public, anon, authenticated;

-- ─── 2. Reemplazar el trigger viejo (edge function) por el trigger SQL ───────
drop trigger if exists on_market_message_insert on public.messages;

drop trigger if exists trg_notify_market_message on public.messages;
create trigger trg_notify_market_message
  after insert on public.messages
  for each row
  execute function public.notify_market_message();

-- ─── 3. Quitar la exclusión temporal de MENSAJE_NUEVO del dispatcher ─────────
create or replace function public.dispatch_push_notification()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_url    text;
  v_secret text;
  v_req_id bigint;
begin
  select decrypted_secret into v_url    from vault.decrypted_secrets where name = 'push_dispatch_url';
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'push_dispatch_secret';

  if v_url is null or v_secret is null then
    return new;
  end if;

  select net.http_post(
    url     := v_url,
    body    := jsonb_build_object('record', to_jsonb(new)),
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'x-push-secret', v_secret
    )
  ) into v_req_id;

  return new;
end;
$$;

revoke execute on function public.dispatch_push_notification() from public, anon, authenticated;
