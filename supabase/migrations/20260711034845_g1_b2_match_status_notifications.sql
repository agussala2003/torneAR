-- ============================================================
-- G1 · Bloque B.2 — Notificaciones de eventos de partido — 2026-07-11
-- ------------------------------------------------------------
-- Completa los eventos de partido del dominio (Sec. 11) que hoy NO generaban
-- notificación: PARTIDO_CONFIRMADO, PARTIDO_FINALIZADO, RESULTADO_EN_DISPUTA.
-- Se hace por trigger sobre el cambio de estado (confiable: dispara sin importar
-- qué RPC/camino lo cambió). PARTIDO_CANCELADO NO se toca acá (ya lo inserta el
-- cliente, evitamos duplicar). Cada fila insertada dispara el push por el
-- trigger de dispatch del Bloque A.
-- ============================================================

create or replace function public.notify_match_status_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_type  notification_type;
  v_title text;
  v_body  text;
begin
  if new.status is not distinct from old.status then
    return new;
  end if;

  if new.status = 'CONFIRMADO' then
    v_type := 'PARTIDO_CONFIRMADO';
    v_title := 'Partido confirmado';
    v_body := 'Tu próximo partido quedó confirmado. ¡A prepararse!';
  elsif new.status = 'FINALIZADO' then
    v_type := 'PARTIDO_FINALIZADO';
    v_title := 'Partido finalizado';
    v_body := 'Se cargó el resultado. Mirá las estadísticas del partido.';
  elsif new.status = 'EN_DISPUTA' then
    v_type := 'RESULTADO_EN_DISPUTA';
    v_title := 'Resultado en disputa';
    v_body := 'Los resultados cargados no coinciden. Revisá el partido.';
  else
    return new;  -- otros estados (EN_VIVO, WO_*, CANCELADO) no notifican acá
  end if;

  insert into notifications (profile_id, type, title, body, data, is_read)
  select tm.profile_id, v_type, v_title, v_body,
         jsonb_build_object('match_id', new.id), false
  from team_members tm
  where tm.team_id in (new.team_a_id, new.team_b_id);

  return new;
end;
$$;

revoke execute on function public.notify_match_status_change() from public, anon, authenticated;

drop trigger if exists trg_notify_match_status on public.matches;
create trigger trg_notify_match_status
  after update of status on public.matches
  for each row
  execute function public.notify_match_status_change();
