-- ============================================================
-- G3/G2 · Bloque B.1 — pg_cron: recordatorio 24h + jobs — 2026-07-11
-- ------------------------------------------------------------
-- El cron ejecuta funciones SQL puras. El recordatorio SOLO inserta filas en
-- notifications; el push sale por el trigger de dispatch (Bloque A). El cron
-- no sabe nada de push (separación de responsabilidades).
-- ============================================================

-- ─── Índice parcial de apoyo a la query del recordatorio ────────────────────
create index if not exists idx_matches_pending_reminder
  on public.matches (scheduled_at)
  where status = 'CONFIRMADO' and reminder_24h_sent_at is null;

-- ─── Recordatorio 24h (G2) — self-healing + idempotente ─────────────────────
-- Diseño "≤ now()+24h AND flag NULL": si un ciclo del cron falla, el siguiente
-- recupera el recordatorio. reminder_24h_sent_at garantiza exactamente-una-vez.
create or replace function public.enqueue_match_reminders()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  with due as (
    select m.id, m.team_a_id, m.team_b_id
    from matches m
    where m.status = 'CONFIRMADO'
      and m.scheduled_at is not null
      and m.scheduled_at > now()
      and m.scheduled_at <= now() + interval '24 hours'
      and m.reminder_24h_sent_at is null
  ),
  inserted as (
    insert into notifications (profile_id, type, title, body, data, is_read)
    select tm.profile_id,
           'RECORDATORIO_PARTIDO_24H',
           'Recordatorio de partido',
           'Tenés un partido en las próximas 24hs. ¡Preparate!',
           jsonb_build_object('match_id', d.id),
           false
    from due d
    join team_members tm on tm.team_id in (d.team_a_id, d.team_b_id)
    returning 1
  )
  update matches
    set reminder_24h_sent_at = now()
  where id in (select id from due);
end;
$$;

revoke execute on function public.enqueue_match_reminders() from public, anon, authenticated;

-- ─── Jobs pg_cron (idempotentes por nombre) ─────────────────────────────────
-- 1) Recordatorio 24h: cada 15 min.
select cron.schedule(
  'enqueue-match-reminders', '*/15 * * * *',
  $$select public.enqueue_match_reminders();$$
);

-- 2) Limpieza de posts de mercado vencidos: cada hora.
select cron.schedule(
  'deactivate-expired-market-posts', '0 * * * *',
  $$select public.deactivate_expired_market_posts();$$
);

-- 3) Reset parcial de ELO por temporada: 1 de enero y 1 de julio, 03:00.
select cron.schedule(
  'season-reset-elo', '0 3 1 1,7 *',
  $$select public.season_reset_elo();$$
);
