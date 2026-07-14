-- ============================================================
-- CICLO DE VIDA DE TEMPORADAS — 2026-07-14
-- ------------------------------------------------------------
-- Deuda del audit 360° del 13-jul-2026: la temporada "Apertura 2026" venció
-- el 30/6 y seguía activa; el cron season-reset-elo (1/1 y 1/7) reseteaba
-- contadores y hacía squeeze de ELO en silencio SIN cerrar/crear temporadas
-- (ya falló el 1/7); y close_season (legacy del schema, sin uso en el
-- frontend) era ejecutable por anon/authenticated.
--
-- Diseño aprobado (2026-07-14):
--   (a) ELO y matches_played INTACTOS en la transición — sin squeeze. El
--       squeeze ×0.5 muere con las funciones legacy; si el matchmaking lo
--       necesitara a futuro, se reintroduce como parámetro explícito.
--   (b) Los partidos abiertos (no terminales) se re-etiquetan a la temporada
--       nueva: sus stats van a caer en los contadores nuevos al finalizar.
--   (c) Transición MANUAL (RPC admin-gated, botón en el panel admin) +
--       recordatorio automático diario a admins si la activa está vencida.
--       El cron nunca vuelve a mutar estado competitivo; sólo avisa.
--
--   1. Valores nuevos de notification_type (TEMPORADA_VENCIDA/INICIADA).
--   2. Índice único parcial: la base garantiza UNA sola temporada activa.
--   3. Baja del cron season-reset-elo y DROP de close_season/season_reset_elo.
--   4. Cron de recordatorio idempotente (una notificación por admin por
--      temporada vencida).
--   5. RPC transition_season(nombre, inicio, fin) — SECURITY DEFINER,
--      admin-gated, atómica: cierra la activa, crea la nueva, resetea los
--      contadores season_* de teams y re-etiqueta los partidos abiertos.
-- ============================================================

-- ─── 1. Tipos de notificación ────────────────────────────────────────────────
-- (sólo se referencian en runtime, nunca dentro de esta transacción)
ALTER TYPE public.notification_type ADD VALUE IF NOT EXISTS 'TEMPORADA_VENCIDA';
ALTER TYPE public.notification_type ADD VALUE IF NOT EXISTS 'TEMPORADA_INICIADA';

-- ─── 2. Una sola temporada activa, garantizado por la base ──────────────────
CREATE UNIQUE INDEX IF NOT EXISTS seasons_one_active_idx
  ON public.seasons ((true))
  WHERE is_active;

-- ─── 3. Adiós al legacy ──────────────────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'season-reset-elo') THEN
    PERFORM cron.unschedule('season-reset-elo');
  END IF;
END;
$$;

DROP FUNCTION IF EXISTS public.close_season(uuid);
DROP FUNCTION IF EXISTS public.season_reset_elo();

-- ─── 4. Recordatorio automático (sólo avisa, nunca muta) ────────────────────
CREATE OR REPLACE FUNCTION public.enqueue_season_expiry_reminder()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
begin
  -- Idempotente: una única notificación por admin por temporada vencida.
  insert into notifications (profile_id, type, title, body, data, is_read)
  select
    p.id,
    'TEMPORADA_VENCIDA',
    '⏰ Temporada vencida',
    'La temporada "' || s.name || '" venció el ' || to_char(s.ends_at, 'DD/MM/YYYY')
      || '. Ejecutá la transición desde el panel de administración.',
    jsonb_build_object('season_id', s.id),
    false
  from seasons s
  cross join profiles p
  where s.is_active
    and s.ends_at < current_date
    and p.is_admin
    and not exists (
      select 1 from notifications n
      where n.type = 'TEMPORADA_VENCIDA'
        and n.profile_id = p.id
        and n.data->>'season_id' = s.id::text
    );
end;
$$;

REVOKE EXECUTE ON FUNCTION public.enqueue_season_expiry_reminder() FROM PUBLIC, anon, authenticated;

-- Diario a las 12:00 UTC (09:00 AR).
SELECT cron.schedule(
  'season-expiry-reminder', '0 12 * * *',
  $$select public.enqueue_season_expiry_reminder();$$
);

-- ─── 5. RPC de transición ────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.transition_season(
  p_new_name  text,
  p_starts_at date,
  p_ends_at   date
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
declare
  v_admin  uuid;
  v_old    seasons%rowtype;
  v_new_id uuid;
  v_slug   text;
begin
  -- Autorización: admin derivado de auth.uid() (patrón resolve_wo_claim).
  select id into v_admin
  from profiles where auth_user_id = auth.uid() and is_admin = true;
  if v_admin is null then
    raise exception 'No autorizado: se requiere rol de administrador';
  end if;

  -- Validaciones de entrada.
  if p_new_name is null or btrim(p_new_name) = '' then
    raise exception 'El nombre de la temporada es obligatorio';
  end if;
  if p_starts_at is null or p_ends_at is null or p_starts_at >= p_ends_at then
    raise exception 'Rango de fechas inválido (inicio: %, fin: %)', p_starts_at, p_ends_at;
  end if;

  -- Temporada activa, con lock: dos transiciones concurrentes se serializan
  -- y la segunda falla en la guarda de estado (además del índice único).
  select * into v_old from seasons where is_active = true limit 1 for update;
  if v_old.id is null then
    raise exception 'No hay temporada activa para cerrar';
  end if;

  v_slug := btrim(regexp_replace(lower(btrim(p_new_name)), '[^a-z0-9]+', '-', 'g'), '-');
  if exists (select 1 from seasons where slug = v_slug) then
    raise exception 'Ya existe una temporada con slug "%"', v_slug;
  end if;

  -- a) Cerrar la temporada vigente.
  update seasons set is_active = false where id = v_old.id;

  -- b) Crear y activar la nueva.
  insert into seasons (name, slug, starts_at, ends_at, is_active)
  values (btrim(p_new_name), v_slug, p_starts_at, p_ends_at, true)
  returning id into v_new_id;

  -- c) Contadores de temporada a 0. elo_rating y matches_played quedan
  --    INTACTOS por decisión de dominio (ELO continuo entre temporadas).
  update teams set
    season_wins          = 0,
    season_draws         = 0,
    season_losses        = 0,
    season_goals_for     = 0,
    season_goals_against = 0;

  -- d) Partidos abiertos: pasan a la temporada nueva (sus stats caerán en
  --    los contadores nuevos cuando terminen; los terminales no se tocan).
  update matches set season_id = v_new_id
   where status in ('PENDIENTE', 'CONFIRMADO', 'EN_VIVO', 'EN_DISPUTA');

  -- e) Auditoría: notificación a todos los admins.
  insert into notifications (profile_id, type, title, body, data, is_read)
  select
    p.id,
    'TEMPORADA_INICIADA',
    '🏁 Nueva temporada: ' || btrim(p_new_name),
    'Se cerró "' || v_old.name || '" y comenzó "' || btrim(p_new_name)
      || '". Los contadores de temporada fueron reseteados (ELO intacto).',
    jsonb_build_object('season_id', v_new_id, 'previous_season_id', v_old.id, 'executed_by', v_admin),
    false
  from profiles p
  where p.is_admin = true;

  return v_new_id;
end;
$$;

REVOKE EXECUTE ON FUNCTION public.transition_season(text, date, date) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.transition_season(text, date, date) TO authenticated;
