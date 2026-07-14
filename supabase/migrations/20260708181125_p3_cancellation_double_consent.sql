-- ============================================================
-- P3 — CANCELACIÓN CON DOBLE CONSENTIMIENTO — 2026-07-08
-- Roadmap v1.1: ambos capitanes deben confirmar la cancelación de un
-- partido antes de que se efectivice, para evitar que el equipo que la
-- pide pierda Fair Play sin que el rival haya tenido voz.
--
-- Decisión de producto: si el rival ACEPTA una cancelación tardía, el
-- equipo que la pidió igual pierde FPS (se mantiene la fórmula actual).
-- Sólo cambia CUÁNDO se aplica la penalización: antes al pedirla
-- (INSERT), ahora recién al aceptarse (UPDATE → ACEPTADA). Si el rival
-- RECHAZA, el partido sigue en pie y no hay penalización.
-- ============================================================

-- ─── 1. Nuevos tipos de notificación ──────────────────────────────────────────
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'CANCELACION_SOLICITADA';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'CANCELACION_RECHAZADA';

-- ─── 2. request_match_cancellation — ya no cancela el partido directamente ───
CREATE OR REPLACE FUNCTION public.request_match_cancellation(
  p_match_id uuid, p_team_id uuid, p_reason text, p_notes text DEFAULT NULL::text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_match   matches%rowtype;
  v_is_late boolean := false;
BEGIN
  SELECT * INTO v_match FROM matches WHERE id = p_match_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Partido no encontrado: %', p_match_id; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM team_members tm
    JOIN profiles p ON p.id = tm.profile_id
    WHERE tm.team_id = p_team_id
      AND p.auth_user_id = auth.uid()
      AND tm.role IN ('CAPITAN', 'SUBCAPITAN')
  ) THEN
    RAISE EXCEPTION 'No autorizado: solo el capitán o subcapitán puede cancelar un partido';
  END IF;

  IF v_match.team_a_id <> p_team_id AND v_match.team_b_id <> p_team_id THEN
    RAISE EXCEPTION 'El equipo no participa en este partido';
  END IF;

  IF v_match.status NOT IN ('PENDIENTE', 'CONFIRMADO') THEN
    RAISE EXCEPTION 'No se puede solicitar la cancelación de un partido en estado %', v_match.status;
  END IF;

  IF EXISTS (
    SELECT 1 FROM cancellation_requests
    WHERE match_id = p_match_id AND status = 'PENDIENTE'
  ) THEN
    RAISE EXCEPTION 'Ya existe una solicitud de cancelación pendiente para este partido';
  END IF;

  IF v_match.scheduled_at IS NOT NULL THEN
    v_is_late := (v_match.scheduled_at - now()) < INTERVAL '24 hours';
  END IF;

  -- status queda en el default 'PENDIENTE' — el partido NO se cancela acá.
  INSERT INTO cancellation_requests
    (match_id, requested_by_team_id, reason, notes, is_late)
  VALUES
    (p_match_id, p_team_id, p_reason, p_notes, v_is_late);
END;
$function$;

-- ─── 3. respond_to_cancellation_request — el otro equipo acepta o rechaza ────
CREATE OR REPLACE FUNCTION public.respond_to_cancellation_request(
  p_request_id uuid, p_accept boolean
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_request       cancellation_requests%rowtype;
  v_match         matches%rowtype;
  v_other_team_id uuid;
  v_new_status    text;
BEGIN
  SELECT * INTO v_request FROM cancellation_requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Solicitud de cancelación no encontrada: %', p_request_id;
  END IF;

  IF v_request.status <> 'PENDIENTE' THEN
    RAISE EXCEPTION 'La solicitud ya fue respondida (estado: %)', v_request.status;
  END IF;

  SELECT * INTO v_match FROM matches WHERE id = v_request.match_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Partido no encontrado'; END IF;

  v_other_team_id := CASE
    WHEN v_match.team_a_id = v_request.requested_by_team_id THEN v_match.team_b_id
    ELSE v_match.team_a_id
  END;

  -- Sólo el capitán/subcapitán del equipo RIVAL (no el que la pidió) puede responder
  IF NOT EXISTS (
    SELECT 1 FROM team_members tm
    JOIN profiles p ON p.id = tm.profile_id
    WHERE tm.team_id = v_other_team_id
      AND p.auth_user_id = auth.uid()
      AND tm.role IN ('CAPITAN', 'SUBCAPITAN')
  ) THEN
    RAISE EXCEPTION 'No autorizado: solo el capitán o subcapitán del equipo rival puede responder esta solicitud';
  END IF;

  IF p_accept THEN
    v_new_status := 'ACEPTADA';
    UPDATE cancellation_requests SET status = v_new_status WHERE id = p_request_id;
    UPDATE matches SET status = 'CANCELADO' WHERE id = v_request.match_id;
  ELSE
    v_new_status := 'RECHAZADA';
    UPDATE cancellation_requests SET status = v_new_status WHERE id = p_request_id;
  END IF;

  RETURN v_new_status;
END;
$function$;

-- ─── 4. Mover la penalización de FPS de INSERT a UPDATE→ACEPTADA ─────────────
DROP TRIGGER IF EXISTS fps_on_cancellation ON public.cancellation_requests;

CREATE TRIGGER fps_on_cancellation_accepted
  AFTER UPDATE ON public.cancellation_requests
  FOR EACH ROW
  WHEN (NEW.status = 'ACEPTADA' AND OLD.status IS DISTINCT FROM NEW.status AND NEW.is_late)
  EXECUTE FUNCTION public.trigger_update_fps();

-- ─── 5. recalculate_team_fps — contar sólo cancelaciones tardías ACEPTADAS ───
-- Antes contaba cualquier fila con is_late=true sin mirar status: una
-- solicitud RECHAZADA quedaba penalizando para siempre. Bug independiente de
-- este feature, corregido de paso.
CREATE OR REPLACE FUNCTION public.recalculate_team_fps(p_team_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_clean_matches integer;
  v_late_cancels  integer;
  v_wo_absences   integer;
  v_disputes      integer;
  v_fps           numeric;
BEGIN
  SELECT COUNT(*) INTO v_clean_matches
  FROM matches
  WHERE status = 'FINALIZADO'
    AND (team_a_id = p_team_id OR team_b_id = p_team_id);

  SELECT COUNT(*) INTO v_late_cancels
  FROM cancellation_requests
  WHERE requested_by_team_id = p_team_id
    AND is_late = true
    AND status = 'ACEPTADA';

  SELECT COUNT(*) INTO v_wo_absences
  FROM matches
  WHERE (status = 'WO_A' AND team_b_id = p_team_id)
     OR (status = 'WO_B' AND team_a_id = p_team_id);

  SELECT COUNT(*) INTO v_disputes
  FROM matches
  WHERE status = 'EN_DISPUTA'
    AND (team_a_id = p_team_id OR team_b_id = p_team_id);

  v_fps := 100.0
          + (v_clean_matches * 1)
          - (v_late_cancels  * 5)
          - (v_wo_absences   * 15)
          - (v_disputes      * 2);

  v_fps := GREATEST(0, LEAST(100, v_fps));

  UPDATE teams SET fair_play_score = v_fps WHERE id = p_team_id;
END;
$function$;

-- ─── 6. notifications RLS — 4ª rama: admin de un equipo notifica al admin del rival en el mismo partido ───
-- Necesario para avisar "te pidieron cancelar" / "respondieron tu solicitud".
DROP POLICY IF EXISTS "notifications_insert_authenticated" ON public.notifications;

CREATE POLICY "notifications_insert_authenticated" ON public.notifications FOR INSERT
  TO authenticated
  WITH CHECK (
    -- (a) mismo equipo: notificaciones de gestión (aceptado / rol / expulsado)
    EXISTS (
      SELECT 1 FROM team_members tm_r
      JOIN team_members tm_c ON tm_c.team_id = tm_r.team_id
      JOIN profiles p_c ON p_c.id = tm_c.profile_id
      WHERE tm_r.profile_id = notifications.profile_id
        AND p_c.auth_user_id = (SELECT auth.uid())
        AND tm_c.role IN ('CAPITAN', 'SUBCAPITAN')
    )
    OR
    -- (b) solicitud de unión pendiente -> admin del equipo destino
    EXISTS (
      SELECT 1 FROM team_join_requests r
      JOIN profiles p_req ON p_req.id = r.profile_id
      JOIN team_members tm_admin ON tm_admin.team_id = r.team_id
      JOIN profiles p_admin ON p_admin.id = tm_admin.profile_id
      WHERE p_admin.id = notifications.profile_id
        AND p_req.auth_user_id = (SELECT auth.uid())
        AND tm_admin.role IN ('CAPITAN', 'SUBCAPITAN')
    )
    OR
    -- (c) desafío entre equipos: admin de un lado notifica al admin del otro
    EXISTS (
      SELECT 1 FROM challenges c
      JOIN team_members tm_caller ON tm_caller.team_id IN (c.from_team_id, c.to_team_id)
      JOIN profiles p_caller ON p_caller.id = tm_caller.profile_id
      JOIN team_members tm_recipient ON tm_recipient.team_id IN (c.from_team_id, c.to_team_id)
        AND tm_recipient.team_id <> tm_caller.team_id
      WHERE p_caller.auth_user_id = (SELECT auth.uid())
        AND tm_recipient.profile_id = notifications.profile_id
        AND tm_caller.role IN ('CAPITAN', 'SUBCAPITAN')
        AND tm_recipient.role IN ('CAPITAN', 'SUBCAPITAN')
    )
    OR
    -- (d) partido entre equipos: admin de un lado notifica al admin del otro
    -- (pedidos/respuestas de cancelación)
    EXISTS (
      SELECT 1 FROM matches m
      JOIN team_members tm_caller ON tm_caller.team_id IN (m.team_a_id, m.team_b_id)
      JOIN profiles p_caller ON p_caller.id = tm_caller.profile_id
      JOIN team_members tm_recipient ON tm_recipient.team_id IN (m.team_a_id, m.team_b_id)
        AND tm_recipient.team_id <> tm_caller.team_id
      WHERE p_caller.auth_user_id = (SELECT auth.uid())
        AND tm_recipient.profile_id = notifications.profile_id
        AND tm_caller.role IN ('CAPITAN', 'SUBCAPITAN')
        AND tm_recipient.role IN ('CAPITAN', 'SUBCAPITAN')
    )
  );
