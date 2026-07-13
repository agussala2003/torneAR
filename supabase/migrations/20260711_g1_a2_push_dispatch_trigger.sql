-- ============================================================
-- G1 · Bloque A.2 — Push dispatch: vault + verify RPC + trigger — 2026-07-11
-- ------------------------------------------------------------
-- Conecta la tabla notifications (única fuente de verdad) con la edge function
-- genérica push-dispatch. Todo INSERT en notifications dispara un push vía
-- pg_net, sin código de push por evento.
--
-- Componentes:
--   1. Secretos en vault: URL de la función + secreto compartido.
--   2. verify_push_webhook_secret(): la edge function valida su header contra
--      esto (nunca expone el secreto; devuelve sólo boolean).
--   3. dispatch_push_notification(): trigger AFTER INSERT que hace net.http_post
--      a la función con el secreto en el header.
--
-- Nota (temporal, Bloque A): se excluye MENSAJE_NUEVO porque hoy lo sigue
-- empujando la edge function notify-market-message. El Bloque B migrará market
-- a un trigger SQL, retirará esa función y quitará esta exclusión.
-- ============================================================

-- ─── 1. Secretos en supabase_vault (idempotente) ────────────────────────────
do $$
begin
  if not exists (select 1 from vault.secrets where name = 'push_dispatch_url') then
    perform vault.create_secret(
      'https://yusfykqimalghmmhlfdn.supabase.co/functions/v1/push-dispatch',
      'push_dispatch_url',
      'URL de la edge function push-dispatch'
    );
  end if;
  if not exists (select 1 from vault.secrets where name = 'push_dispatch_secret') then
    -- El valor real se inyecta manualmente en Supabase Vault (dashboard / SQL
    -- Editor). NUNCA versionar el secreto en Git.
    perform vault.create_secret(
      '<AQUI_VA_EL_SECRETO_PUSH_DISPATCH>',
      'push_dispatch_secret',
      'Secreto compartido entre el trigger de notifications y push-dispatch'
    );
  end if;
end $$;

-- ─── 2. Verificación del secreto (la usa la edge function) ──────────────────
create or replace function public.verify_push_webhook_secret(p_candidate text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_secret text;
begin
  select decrypted_secret into v_secret
  from vault.decrypted_secrets
  where name = 'push_dispatch_secret';

  if v_secret is null or p_candidate is null then
    return false;
  end if;

  return p_candidate = v_secret;
end;
$$;

revoke execute on function public.verify_push_webhook_secret(text) from public, anon, authenticated;
grant execute on function public.verify_push_webhook_secret(text) to service_role;

-- ─── 3. Trigger de dispatch: notifications INSERT -> pg_net -> push-dispatch ──
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
  -- [Bloque A, temporal] market sigue empujando su propio push por ahora.
  if new.type = 'MENSAJE_NUEVO' then
    return new;
  end if;

  select decrypted_secret into v_url    from vault.decrypted_secrets where name = 'push_dispatch_url';
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'push_dispatch_secret';

  -- Config incompleta: no romper el INSERT de la notificación (push best-effort).
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

drop trigger if exists trg_dispatch_push on public.notifications;
create trigger trg_dispatch_push
  after insert on public.notifications
  for each row
  execute function public.dispatch_push_notification();
