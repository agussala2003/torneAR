-- ============================================================
-- E8 — LOS DESAFÍOS `ENVIADA` CADUCAN — 2026-07-29
-- ------------------------------------------------------------
-- Hallazgo (auditoria_dominio.md · E8 🔵):
--   `send_challenge` rechaza un desafío nuevo si ya existe uno `ENVIADA` entre
--   los dos equipos, **en cualquier dirección** (y el índice único parcial
--   `uq_challenges_active_pair` lo garantiza a nivel de datos). No hay
--   caducidad ni job de limpieza: un capitán que no responde nunca congela el
--   emparejamiento entre esos dos equipos para siempre. El desafiante no tiene
--   forma de destrabarlo salvo cancelar el suyo — y si el que no responde es
--   él, tampoco.
--
-- ── Diseño ──────────────────────────────────────────────────────────────────
-- Rama nueva dentro de `sweep_stale_matches()` en lugar de una función y un job
-- aparte. Motivos:
--   · Es exactamente el mismo tipo de deuda que D3 (estados que no caducan) y
--     comparte la misma propiedad de idempotencia: `ENVIADA → RECHAZADA` deja
--     la fila fuera de su propio WHERE.
--   · Un segundo cron para una sola sentencia agrega superficie operativa sin
--     agregar nada; el barrido ya corre cada hora y ya devuelve métricas.
--   · El umbral vive en `app_settings` como los otros tres (`sweep_*`).
--
-- **`RECHAZADA` y no `CANCELADA`**: el enum tiene los dos, pero `CANCELADA` es
-- lo que hace el que ENVIÓ el desafío al arrepentirse. Acá nadie se arrepintió:
-- el desafío murió porque el destinatario no contestó, que es semánticamente un
-- rechazo por omisión. La distinción importa para leer el historial después.
--
-- El aviso reusa `DESAFIO_RECHAZADO` en vez de agregar un valor al enum
-- `notification_type`: es el mismo desenlace desde el lado del desafiante, y
-- `app/notifications.tsx` ya lo rutea a `/challenge-inbox`, que es donde puede
-- volver a desafiar. Un tipo nuevo habría necesitado una migración previa sólo
-- para el `ALTER TYPE` (no se puede usar un valor agregado en la misma
-- transacción) y una rama nueva de ruteo, para llegar al mismo lugar.
--
-- Se notifica **a los dos lados**, con textos distintos: al que envió, porque
-- su desafío se cayó; al que recibió, porque dejó vencer algo que tenía que
-- responder. Sólo a CAPITAN/SUBCAPITAN — son los únicos que podían actuar.
-- ============================================================


-- ─── Umbral configurable ────────────────────────────────────────────────────
INSERT INTO public.app_settings (key, value, description) VALUES
  ('sweep_challenge_expiry_days', 14,
   'Días sin respuesta tras los cuales un desafío ENVIADA se rechaza solo y libera el emparejamiento entre los dos equipos.')
ON CONFLICT (key) DO NOTHING;


-- ─── Índice de apoyo ────────────────────────────────────────────────────────
-- Parcial por estado, igual que los tres del barrido de partidos: ENVIADA es
-- un estado transitorio, así que el índice se mantiene chico.
CREATE INDEX IF NOT EXISTS idx_challenges_sweep_sent
  ON public.challenges (created_at)
  WHERE status = 'ENVIADA';


-- ─── Barrido (cuerpo de 20260728181000 + rama 4) ────────────────────────────
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
  v_challenge_days  numeric := coalesce((select value from app_settings where key = 'sweep_challenge_expiry_days'), 14);

  v_pending_cancelled int := 0;
  v_noshow_cancelled  int := 0;
  v_auto_wo           int := 0;
  v_live_cancelled    int := 0;
  v_live_disputed     int := 0;
  v_challenges_expired int := 0;

  r record;
  v_winner_team_id uuid;
  v_loser_team_id  uuid;
  v_submitter      uuid;
  v_winner_name    text;
  v_loser_name     text;
  v_from_name      text;  -- E8: nombre del equipo que envió el desafío
  v_to_name        text;  -- E8: nombre del que no respondió
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

      -- ⚠️ El `::match_status` NO es decorativo. Un literal suelto
      -- (`set status = 'WO_A'`) se castea implícitamente al tipo de la columna,
      -- pero dentro de un CASE las dos ramas se resuelven a `text` y Postgres
      -- deja de coercionar: sin el cast, esto aborta con 42804 y —al cortar la
      -- función entera— el barrido deja de procesar TAMBIÉN las ramas de
      -- PENDIENTE y EN_VIVO. Venía así desde 20260728181000 (D3/D4) y lo
      -- destapó la primera corrida real de 300-sweep-stale-matches.spec.sql.
      update matches
        set status = (case when v_winner_team_id = r.team_a_id then 'WO_A' else 'WO_B' end)::match_status
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

  -- ═══════════════════════════════════════════════════════════
  -- 4. Desafíos ENVIADA sin respuesta (E8)
  -- ═══════════════════════════════════════════════════════════
  -- Idempotente por la misma razón que las ramas de arriba: la fila sale de
  -- 'ENVIADA' y deja de matchear este WHERE. Al salir, también libera el índice
  -- único parcial `uq_challenges_active_pair` y los dos equipos vuelven a
  -- poder desafiarse.
  for r in
    select c.id, c.from_team_id, c.to_team_id
    from challenges c
    where c.status = 'ENVIADA'
      and c.created_at < now() - (v_challenge_days || ' days')::interval
  loop
    update challenges set status = 'RECHAZADA', updated_at = now() where id = r.id;

    select name into v_from_name from teams where id = r.from_team_id;
    select name into v_to_name   from teams where id = r.to_team_id;

    -- Al que desafió: su desafío se cayó, y puede volver a mandarlo.
    insert into notifications (profile_id, type, title, body, data, is_read)
    select tm.profile_id,
           'DESAFIO_RECHAZADO',
           '⌛ Tu desafío venció',
           coalesce(v_to_name, 'El equipo rival') || ' no respondió en '
             || v_challenge_days::int || ' días, así que el desafío se cerró solo. '
             || 'Ya podés volver a desafiarlos.',
           jsonb_build_object('challenge_id', r.id, 'reason', 'SIN_RESPUESTA'),
           false
    from team_members tm
    where tm.team_id = r.from_team_id
      and tm.role in ('CAPITAN', 'SUBCAPITAN');

    -- Al que no respondió: que se entere de que dejó vencer algo suyo.
    insert into notifications (profile_id, type, title, body, data, is_read)
    select tm.profile_id,
           'DESAFIO_RECHAZADO',
           '⌛ Desafío vencido',
           'El desafío de ' || coalesce(v_from_name, 'otro equipo') || ' venció sin respuesta.',
           jsonb_build_object('challenge_id', r.id, 'reason', 'SIN_RESPUESTA'),
           false
    from team_members tm
    where tm.team_id = r.to_team_id
      and tm.role in ('CAPITAN', 'SUBCAPITAN');

    v_challenges_expired := v_challenges_expired + 1;
    v_from_name := null;
    v_to_name   := null;
  end loop;

  return jsonb_build_object(
    'pendingCancelled',  v_pending_cancelled,
    'noShowCancelled',   v_noshow_cancelled,
    'autoWo',            v_auto_wo,
    'liveCancelled',     v_live_cancelled,
    'liveDisputed',      v_live_disputed,
    'challengesExpired', v_challenges_expired,
    'ranAt',             now()
  );
end;
$$;

COMMENT ON FUNCTION public.sweep_stale_matches() IS
  'Barrido horario de partidos huérfanos (D3/D4/E6) y de desafíos sin responder (E8). Idempotente: cada rama mueve la fila a un estado que ya no matchea su WHERE. Umbrales en app_settings (sweep_*). No toca partidos con un wo_claim en PENDIENTE_REVISION.';

-- Función de mantenimiento: jamás ejecutable desde la API REST. Mismo régimen
-- que enqueue_match_reminders / enqueue_season_expiry_reminder.
REVOKE EXECUTE ON FUNCTION public.sweep_stale_matches() FROM PUBLIC, anon, authenticated;
