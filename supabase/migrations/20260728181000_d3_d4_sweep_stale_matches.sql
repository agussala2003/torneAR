-- ============================================================
-- D3 / D4 / E6 — BARRIDO DE PARTIDOS HUÉRFANOS — 2026-07-28
-- ------------------------------------------------------------
-- Hallazgos (auditoria_dominio.md):
--   D3 🟠 Ningún estado del partido caduca. Los únicos jobs eran el
--         recordatorio 24h, la limpieza del mercado y el aviso de temporada
--         vencida: ninguno cierra un partido.
--   D4 🟠 "No se presentó" no tenía flujo automático; y si NINGUNO de los dos
--         hacía check-in no había salida posible (claim_wo exige que el equipo
--         reclamante tenga check-in registrado).
--   E6 🟡 Un partido zombi en CONFIRMADO/EN_VIVO deja a sus convocados
--         bloqueados para siempre (leave_team_as_member → ACTIVE_MATCH).
--
-- ── Diseño ──────────────────────────────────────────────────────────────────
-- Una sola función de barrido, idempotente por construcción: cada rama mueve
-- el partido a un estado que ya no matchea su propio WHERE, así que correrla
-- dos veces seguidas no reprocesa nada y no hace falta una columna de control.
--
-- Los umbrales viven en `app_settings` (misma mecánica que
-- checkin_geofence_radius_m): producto los ajusta sin desplegar.
--
--   PENDIENTE viejo                 → CANCELADO
--   CONFIRMADO + gracia vencida:
--       · nadie hizo check-in       → CANCELADO   (libera a los convocados)
--       · sólo A hizo check-in      → WO_A        (3-0 + ELO + Fair Play)
--       · sólo B hizo check-in      → WO_B
--   EN_VIVO + timeout:
--       · sin resultados cargados   → CANCELADO
--       · con algún resultado       → EN_DISPUTA
--
-- ── Decisiones que se apartan de la lectura literal del plan ────────────────
-- (a) EN_VIVO **sin ningún resultado** NO va a EN_DISPUTA, va a CANCELADO.
--     Motivo: resolve_match_dispute lee los goles del ganador de match_results
--     y aborta con 'No se encontraron resultados del equipo ganador' si no
--     existen. Mandar ahí un partido sin resultados fabrica exactamente el
--     callejón sin salida que describe D2, sólo que ahora a escala y de forma
--     automática. Cancelar cierra el ciclo y libera a los jugadores, que es el
--     objetivo de E6.
-- (b) El barrido NO toca partidos con un reclamo de WO en PENDIENTE_REVISION:
--     ahí ya hay un humano decidiendo y el auto-WO le pisaría el veredicto.
--
-- ── Residual conocido (D2, sigue abierto) ───────────────────────────────────
-- Un partido que el barrido manda a EN_DISPUTA con UN solo resultado depende
-- de resolve_match_dispute para cerrarse, y esa RPC puede: (i) abortar si el
-- ganador por votos/Fair Play es el equipo que nunca cargó, o (ii) finalizar
-- sin aplicar stats, porque apply_match_outcome necesita las dos filas de
-- match_results. Es una limitación preexistente de la resolución de disputas
-- —no la introduce este barrido—, pero AHORA se puede alcanzar por vía
-- automática. El cierre real es la herramienta de admin para disputas (D2).
-- ============================================================


-- ─── Umbrales configurables ─────────────────────────────────────────────────
INSERT INTO public.app_settings (key, value, description) VALUES
  ('sweep_pending_no_date_days', 14,
   'Días sin confirmar tras los cuales un partido PENDIENTE se cancela solo.'),
  ('sweep_confirmed_grace_hours', 4,
   'Horas después del horario pactado tras las cuales un partido CONFIRMADO se resuelve solo (WO por no presentación o cancelación si no fue nadie).'),
  ('sweep_live_timeout_hours', 24,
   'Horas en EN_VIVO tras las cuales el partido se cierra solo (a disputa si hay algún resultado, cancelado si no hay ninguno).')
ON CONFLICT (key) DO NOTHING;


-- ─── Barrido ────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.sweep_stale_matches()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
declare
  v_pending_days    numeric := coalesce((select value from app_settings where key = 'sweep_pending_no_date_days'), 14);
  v_confirmed_hours numeric := coalesce((select value from app_settings where key = 'sweep_confirmed_grace_hours'), 4);
  v_live_hours      numeric := coalesce((select value from app_settings where key = 'sweep_live_timeout_hours'), 24);

  v_pending_cancelled int := 0;
  v_noshow_cancelled  int := 0;
  v_auto_wo           int := 0;
  v_live_cancelled    int := 0;
  v_live_disputed     int := 0;

  r record;
  v_winner_team_id uuid;
  v_loser_team_id  uuid;
  v_submitter      uuid;
  v_winner_name    text;
  v_loser_name     text;
begin
  -- ═══════════════════════════════════════════════════════════
  -- 1. PENDIENTE que nunca se coordinó → CANCELADO
  -- ═══════════════════════════════════════════════════════════
  -- `coalesce(scheduled_at, created_at)` cubre las dos formas del zombi: el
  -- partido creado por accept_challenge que nunca recibió propuesta (fecha
  -- NULL) y el que tuvo una propuesta cuya fecha ya pasó sin confirmarse.
  for r in
    select m.id, m.team_a_id, m.team_b_id
    from matches m
    where m.status = 'PENDIENTE'
      and coalesce(m.scheduled_at, m.created_at) < now() - (v_pending_days || ' days')::interval
  loop
    update matches set status = 'CANCELADO' where id = r.id;

    -- CANCELADO no dispara notify_match_status_change (ese trigger sólo cubre
    -- CONFIRMADO/FINALIZADO/EN_DISPUTA), así que el aviso se inserta acá.
    insert into notifications (profile_id, type, title, body, data, is_read)
    select tm.profile_id,
           'PARTIDO_CANCELADO',
           'Partido cancelado automáticamente',
           'Un partido quedó sin coordinar durante ' || v_pending_days::int
             || ' días y se canceló solo. Podés volver a desafiar cuando quieras.',
           jsonb_build_object('match_id', r.id, 'reason', 'PENDIENTE_SIN_COORDINAR'),
           false
    from team_members tm
    where tm.team_id in (r.team_a_id, r.team_b_id);

    v_pending_cancelled := v_pending_cancelled + 1;
  end loop;

  -- ═══════════════════════════════════════════════════════════
  -- 2. CONFIRMADO con la gracia vencida
  -- ═══════════════════════════════════════════════════════════
  for r in
    select m.id, m.team_a_id, m.team_b_id, m.checkin_team_a_at, m.checkin_team_b_at
    from matches m
    where m.status = 'CONFIRMADO'
      and m.scheduled_at is not null
      and m.scheduled_at < now() - (v_confirmed_hours || ' hours')::interval
      -- Nunca pisar un reclamo que un admin todavía está evaluando.
      and not exists (
        select 1 from wo_claims wc
        where wc.match_id = m.id and wc.status = 'PENDIENTE_REVISION'
      )
  loop
    if r.checkin_team_a_at is null and r.checkin_team_b_at is null then
      -- ── Nadie se presentó ────────────────────────────────────────────────
      -- Sin check-in de ninguno de los dos, claim_wo era inalcanzable para
      -- ambos: éste era el agujero exacto de D4. No se penaliza Fair Play (no
      -- hay cancellation_request tardía de por medio): el objetivo es cerrar
      -- el ciclo y liberar a los convocados, no repartir culpas sin evidencia.
      update matches set status = 'CANCELADO' where id = r.id;

      insert into notifications (profile_id, type, title, body, data, is_read)
      select tm.profile_id,
             'PARTIDO_CANCELADO',
             'Partido cancelado por ausencia',
             'Ningún equipo registró check-in y el partido se cerró automáticamente.',
             jsonb_build_object('match_id', r.id, 'reason', 'SIN_CHECKIN_DE_NINGUNO'),
             false
      from team_members tm
      where tm.team_id in (r.team_a_id, r.team_b_id);

      v_noshow_cancelled := v_noshow_cancelled + 1;

    elsif r.checkin_team_a_at is not null and r.checkin_team_b_at is null then
      v_winner_team_id := r.team_a_id;
      v_loser_team_id  := r.team_b_id;
    elsif r.checkin_team_b_at is not null and r.checkin_team_a_at is null then
      v_winner_team_id := r.team_b_id;
      v_loser_team_id  := r.team_a_id;
    else
      -- Los dos con check-in: el partido debería haber pasado a EN_VIVO solo.
      -- Estado inconsistente; se deja para inspección manual antes que
      -- inventar un ganador.
      v_winner_team_id := null;
      v_loser_team_id  := null;
    end if;

    if v_winner_team_id is not null then
      -- ── WO automático por no presentación ────────────────────────────────
      -- `submitted_by` es NOT NULL: se usa el perfil que efectivamente hizo el
      -- check-in del equipo presente. Es el equivalente automático de lo que
      -- resolve_wo_claim guarda como `claimed_by`.
      select mp.profile_id into v_submitter
      from match_participants mp
      where mp.match_id = r.id
        and mp.team_id = v_winner_team_id
        and mp.did_checkin = true
      order by mp.is_result_loader desc, mp.checkin_at asc
      limit 1;

      if v_submitter is not null then
        -- El 3-0 no lo necesita apply_match_outcome (para WO_* lo hardcodea),
        -- pero sí la pantalla de detalle y el historial: sin esta fila el
        -- partido se ve sin marcador. Mismo criterio que resolve_wo_claim.
        insert into match_results (match_id, team_id, submitted_by, goals_scored, goals_against)
        values (r.id, v_winner_team_id, v_submitter, 3, 0)
        on conflict (match_id, team_id) do nothing;
      end if;

      update matches
        set status = case when v_winner_team_id = r.team_a_id then 'WO_A' else 'WO_B' end
        where id = r.id;

      select name into v_winner_name from teams where id = v_winner_team_id;
      select name into v_loser_name  from teams where id = v_loser_team_id;

      insert into notifications (profile_id, type, title, body, data, is_read)
      select tm.profile_id,
             'WO_AUTOMATICO',
             '🏆 Ganaste por no presentación',
             coalesce(v_loser_name, 'El rival') || ' no registró check-in y el partido se te dio 3-0.',
             jsonb_build_object('match_id', r.id, 'reason', 'NO_PRESENTACION'),
             false
      from team_members tm
      where tm.team_id = v_winner_team_id;

      insert into notifications (profile_id, type, title, body, data, is_read)
      select tm.profile_id,
             'WO_AUTOMATICO',
             '⚠️ Partido perdido por no presentación',
             'Tu equipo no registró check-in y ' || coalesce(v_winner_name, 'el rival')
               || ' ganó 3-0. Esto impacta en tu Fair Play.',
             jsonb_build_object('match_id', r.id, 'reason', 'NO_PRESENTACION'),
             false
      from team_members tm
      where tm.team_id = v_loser_team_id;

      v_auto_wo := v_auto_wo + 1;
      v_winner_team_id := null;
      v_loser_team_id  := null;
    end if;
  end loop;

  -- ═══════════════════════════════════════════════════════════
  -- 3. EN_VIVO que nunca se cerró
  -- ═══════════════════════════════════════════════════════════
  for r in
    select m.id, m.team_a_id, m.team_b_id,
           (select count(*) from match_results mr where mr.match_id = m.id) as result_count
    from matches m
    where m.status = 'EN_VIVO'
      and coalesce(m.started_at, m.scheduled_at) is not null
      and coalesce(m.started_at, m.scheduled_at) < now() - (v_live_hours || ' hours')::interval
  loop
    if r.result_count = 0 then
      -- Ver decisión (a) del encabezado: sin resultados, EN_DISPUTA sería
      -- irresoluble por construcción.
      update matches set status = 'CANCELADO' where id = r.id;

      insert into notifications (profile_id, type, title, body, data, is_read)
      select tm.profile_id,
             'PARTIDO_CANCELADO',
             'Partido cerrado sin resultado',
             'Pasaron ' || v_live_hours::int || ' horas y ningún equipo cargó el resultado, '
               || 'así que el partido se cerró sin computar.',
             jsonb_build_object('match_id', r.id, 'reason', 'EN_VIVO_SIN_RESULTADO'),
             false
      from team_members tm
      where tm.team_id in (r.team_a_id, r.team_b_id);

      v_live_cancelled := v_live_cancelled + 1;
    else
      -- Un solo resultado cargado: se fuerza la instancia de disputa para que
      -- voten los que hicieron check-in. El trigger notify_match_status_change
      -- ya avisa el paso a EN_DISPUTA, así que acá no se inserta nada.
      update matches set status = 'EN_DISPUTA' where id = r.id;
      v_live_disputed := v_live_disputed + 1;
    end if;
  end loop;

  return jsonb_build_object(
    'pendingCancelled', v_pending_cancelled,
    'noShowCancelled',  v_noshow_cancelled,
    'autoWo',           v_auto_wo,
    'liveCancelled',    v_live_cancelled,
    'liveDisputed',     v_live_disputed,
    'ranAt',            now()
  );
end;
$$;

COMMENT ON FUNCTION public.sweep_stale_matches() IS
  'Barrido horario de partidos huérfanos (D3/D4/E6). Idempotente: cada rama mueve el partido a un estado que ya no matchea su WHERE. Umbrales en app_settings (sweep_*). No toca partidos con un wo_claim en PENDIENTE_REVISION.';

-- Función de mantenimiento: jamás ejecutable desde la API REST. Mismo régimen
-- que enqueue_match_reminders / enqueue_season_expiry_reminder.
REVOKE EXECUTE ON FUNCTION public.sweep_stale_matches() FROM PUBLIC, anon, authenticated;


-- ─── Índices de apoyo ───────────────────────────────────────────────────────
-- Los tres barridos filtran por estado + fecha. Parciales por estado: las
-- transiciones son terminales, así que estos índices se mantienen chicos.
CREATE INDEX IF NOT EXISTS idx_matches_sweep_pending
  ON public.matches (created_at)
  WHERE status = 'PENDIENTE';

CREATE INDEX IF NOT EXISTS idx_matches_sweep_confirmed
  ON public.matches (scheduled_at)
  WHERE status = 'CONFIRMADO';

CREATE INDEX IF NOT EXISTS idx_matches_sweep_live
  ON public.matches (started_at)
  WHERE status = 'EN_VIVO';


-- ─── Job horario ────────────────────────────────────────────────────────────
-- Idempotente por nombre: cron.schedule reemplaza la definición si ya existe.
-- Corre a los 20 minutos de cada hora para no pisar el recordatorio de partidos
-- (*/15) ni la limpieza del mercado (:00).
SELECT cron.schedule(
  'sweep-stale-matches', '20 * * * *',
  $$select public.sweep_stale_matches();$$
);
