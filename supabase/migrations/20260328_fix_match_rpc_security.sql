-- ============================================================
-- FASE 1: Seguridad y Autorización en RPCs
-- Fecha: 2026-03-28
-- Reporte: docs/auditoria.md — Ítems 2, 3, 4, 5, 6, 7
-- ============================================================


-- ─────────────────────────────────────────────────────────────
-- ÍTEM 2: accept_challenge
-- Verifica que auth.uid() sea CAPITAN/SUBCAPITAN del to_team_id
-- antes de crear el partido.
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.accept_challenge(p_challenge_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_challenge    record;
  v_season_id    uuid;
  v_match_id     uuid;
  v_conv_id      uuid;
BEGIN
  -- 1. Fetch the challenge
  SELECT from_team_id, to_team_id, match_type, status
  INTO v_challenge
  FROM challenges
  WHERE id = p_challenge_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Challenge not found: %', p_challenge_id;
  END IF;

  IF v_challenge.status <> 'ENVIADA' THEN
    RAISE EXCEPTION 'El desafío ya no está disponible para aceptar (estado: %)', v_challenge.status;
  END IF;

  -- 2. Authorization: caller must be CAPITAN or SUBCAPITAN of the receiving team
  IF NOT EXISTS (
    SELECT 1 FROM team_members tm
    JOIN profiles p ON p.id = tm.profile_id
    WHERE tm.team_id = v_challenge.to_team_id
      AND p.auth_user_id = auth.uid()
      AND tm.role IN ('CAPITAN', 'SUBCAPITAN')
  ) THEN
    RAISE EXCEPTION 'No autorizado: solo el capitán o subcapitán del equipo receptor puede aceptar este desafío';
  END IF;

  -- 3. Active season (nullable — OK if none)
  SELECT id INTO v_season_id
  FROM seasons
  WHERE is_active = true
  LIMIT 1;

  -- 4. Create the match (PENDIENTE, teams from challenge)
  INSERT INTO matches (
    challenge_id,
    team_a_id,
    team_b_id,
    match_type,
    season_id,
    status
  ) VALUES (
    p_challenge_id,
    v_challenge.from_team_id,
    v_challenge.to_team_id,
    COALESCE(v_challenge.match_type, 'AMISTOSO'),
    v_season_id,
    'PENDIENTE'
  )
  RETURNING id INTO v_match_id;

  -- 5. Create the match chat conversation
  INSERT INTO conversations (type, match_id)
  VALUES ('MATCH_CHAT', v_match_id)
  RETURNING id INTO v_conv_id;

  -- 6. Mark challenge as ACEPTADA
  UPDATE challenges
  SET status = 'ACEPTADA', updated_at = now()
  WHERE id = p_challenge_id;

  RETURN json_build_object(
    'matchId',        v_match_id,
    'conversationId', v_conv_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.accept_challenge(uuid) TO authenticated;


-- ─────────────────────────────────────────────────────────────
-- ÍTEM 3: confirm_match_proposal
-- Verifica que auth.uid() sea CAPITAN/SUBCAPITAN del equipo
-- que NO hizo la propuesta (el equipo receptor).
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.confirm_match_proposal(p_proposal_id uuid, p_match_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_proposal match_proposals%rowtype;
BEGIN
  SELECT * INTO v_proposal FROM match_proposals WHERE id = p_proposal_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Proposal not found: %', p_proposal_id; END IF;

  IF v_proposal.status <> 'PENDIENTE' THEN
    RAISE EXCEPTION 'La propuesta ya no está pendiente (estado: %)', v_proposal.status;
  END IF;

  -- Authorization: caller must be CAPITAN/SUBCAPITAN of the team that did NOT propose
  IF NOT EXISTS (
    SELECT 1 FROM team_members tm
    JOIN profiles p ON p.id = tm.profile_id
    WHERE tm.team_id IN (
      SELECT team_a_id FROM matches WHERE id = p_match_id
      UNION
      SELECT team_b_id FROM matches WHERE id = p_match_id
    )
    AND tm.team_id <> v_proposal.from_team_id
    AND p.auth_user_id = auth.uid()
    AND tm.role IN ('CAPITAN', 'SUBCAPITAN')
  ) THEN
    RAISE EXCEPTION 'No autorizado: solo el equipo receptor puede confirmar esta propuesta';
  END IF;

  UPDATE match_proposals SET status = 'ACEPTADA' WHERE id = p_proposal_id;

  UPDATE matches SET
    status           = 'CONFIRMADO',
    scheduled_at     = v_proposal.scheduled_at,
    format           = v_proposal.format,
    duration_minutes = v_proposal.duration_minutes,
    location         = v_proposal.location,
    venue_id         = v_proposal.venue_id,
    signal_amount    = v_proposal.signal_amount,
    total_cost       = v_proposal.total_cost
  WHERE id = p_match_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.confirm_match_proposal(uuid, uuid) TO authenticated;


-- ─────────────────────────────────────────────────────────────
-- ÍTEMS 4 Y 7: checkin_team (versión con geofence)
--
-- ÍTEM 4: Verifica que auth.uid() sea miembro de p_team_id
--         y que ese equipo participe en el partido.
-- ÍTEM 7: Si el venue tiene coordenadas definidas, p_lat/p_lng
--         son OBLIGATORIOS. Coordenadas nulas = excepción.
--
-- También elimina el overload sin geofence (2 parámetros) que
-- quedó como vestigio de la migración anterior.
-- ─────────────────────────────────────────────────────────────

-- Eliminar el overload obsoleto sin geofence
DROP FUNCTION IF EXISTS public.checkin_team(uuid, uuid);

CREATE OR REPLACE FUNCTION public.checkin_team(
  p_match_id uuid,
  p_team_id  uuid,
  p_lat      numeric DEFAULT NULL,
  p_lng      numeric DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_match      matches%rowtype;
  v_profile_id uuid;
  v_venue      venues%rowtype;
  v_distance_m numeric;
BEGIN
  SELECT * INTO v_match FROM matches WHERE id = p_match_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Partido no encontrado: %', p_match_id; END IF;

  -- Identify the calling user's profile
  SELECT id INTO v_profile_id FROM profiles WHERE auth_user_id = auth.uid();
  IF v_profile_id IS NULL THEN RAISE EXCEPTION 'Perfil no encontrado para el usuario actual'; END IF;

  -- ÍTEM 4: Verify caller is a member of p_team_id
  IF NOT EXISTS (
    SELECT 1 FROM team_members
    WHERE team_id = p_team_id AND profile_id = v_profile_id
  ) THEN
    RAISE EXCEPTION 'No autorizado: no sos miembro del equipo que intentás hacer check-in';
  END IF;

  -- Verify the team is actually part of this match
  IF v_match.team_a_id <> p_team_id AND v_match.team_b_id <> p_team_id THEN
    RAISE EXCEPTION 'El equipo no participa en este partido';
  END IF;

  -- ÍTEM 7: Geofence — mandatory when venue has coordinates
  IF v_match.venue_id IS NOT NULL THEN
    SELECT * INTO v_venue FROM venues WHERE id = v_match.venue_id;
    IF FOUND AND v_venue.lat IS NOT NULL AND v_venue.lng IS NOT NULL THEN
      -- Coordinates are required when the venue has a registered location
      IF p_lat IS NULL OR p_lng IS NULL THEN
        RAISE EXCEPTION 'El check-in requiere tu ubicación GPS para verificar que estás en la cancha';
      END IF;
      -- Haversine formula → distance in metres
      v_distance_m := 2 * 6371000 * asin(sqrt(
        pow(sin(radians((p_lat - v_venue.lat) / 2)), 2) +
        cos(radians(v_venue.lat)) * cos(radians(p_lat)) *
        pow(sin(radians((p_lng - v_venue.lng) / 2)), 2)
      ));
      IF v_distance_m > 150 THEN
        RAISE EXCEPTION 'Estás a %.0fm de la cancha. El check-in requiere estar a menos de 150m.', v_distance_m;
      END IF;
    END IF;
  END IF;

  -- Stamp the correct team's check-in time
  IF v_match.team_a_id = p_team_id THEN
    UPDATE matches SET checkin_team_a_at = now() WHERE id = p_match_id;
  ELSE
    UPDATE matches SET checkin_team_b_at = now() WHERE id = p_match_id;
  END IF;

  -- Upsert participant with coords
  INSERT INTO match_participants
    (match_id, profile_id, team_id, is_result_loader, did_checkin, checkin_at, checkin_lat, checkin_lng)
  VALUES
    (p_match_id, v_profile_id, p_team_id, true, true, now(), p_lat, p_lng)
  ON CONFLICT (match_id, profile_id)
  DO UPDATE SET
    did_checkin      = true,
    checkin_at       = now(),
    checkin_lat      = p_lat,
    checkin_lng      = p_lng,
    is_result_loader = true;

  -- Flip to EN_VIVO once both teams are checked in
  SELECT * INTO v_match FROM matches WHERE id = p_match_id;
  IF v_match.checkin_team_a_at IS NOT NULL
     AND v_match.checkin_team_b_at IS NOT NULL
     AND v_match.status = 'CONFIRMADO'
  THEN
    UPDATE matches SET status = 'EN_VIVO', started_at = now() WHERE id = p_match_id;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.checkin_team(uuid, uuid, numeric, numeric) TO authenticated;


-- ─────────────────────────────────────────────────────────────
-- ÍTEM 5: request_match_cancellation
-- Verifica que auth.uid() sea CAPITAN/SUBCAPITAN de p_team_id
-- y que ese equipo sea parte del partido.
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.request_match_cancellation(
  p_match_id uuid,
  p_team_id  uuid,
  p_reason   text,
  p_notes    text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_match   matches%rowtype;
  v_is_late boolean := false;
BEGIN
  SELECT * INTO v_match FROM matches WHERE id = p_match_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Partido no encontrado: %', p_match_id; END IF;

  -- Authorization: caller must be CAPITAN or SUBCAPITAN of p_team_id
  IF NOT EXISTS (
    SELECT 1 FROM team_members tm
    JOIN profiles p ON p.id = tm.profile_id
    WHERE tm.team_id = p_team_id
      AND p.auth_user_id = auth.uid()
      AND tm.role IN ('CAPITAN', 'SUBCAPITAN')
  ) THEN
    RAISE EXCEPTION 'No autorizado: solo el capitán o subcapitán puede cancelar un partido';
  END IF;

  -- Verify the team is part of this match
  IF v_match.team_a_id <> p_team_id AND v_match.team_b_id <> p_team_id THEN
    RAISE EXCEPTION 'El equipo no participa en este partido';
  END IF;

  IF v_match.scheduled_at IS NOT NULL THEN
    v_is_late := (v_match.scheduled_at - now()) < INTERVAL '24 hours';
  END IF;

  INSERT INTO cancellation_requests
    (match_id, requested_by_team_id, reason, notes, is_late)
  VALUES
    (p_match_id, p_team_id, p_reason, p_notes, v_is_late);

  UPDATE matches SET status = 'CANCELADO' WHERE id = p_match_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.request_match_cancellation(uuid, uuid, text, text) TO authenticated;


-- ─────────────────────────────────────────────────────────────
-- ÍTEM 6: challenges — refinar política UPDATE
--
-- El viejo "challenges_update_by_either_team_admin" era
-- demasiado permisivo: cualquier CAPITAN/SUBCAPITAN de AMBOS
-- equipos podía cambiar el status a cualquier valor, incluyendo
-- 'ACEPTADA' directo sin pasar por el RPC (que crea el partido).
--
-- Reemplazo con dos políticas de propósito único:
--   • sender_cancel:   el equipo que envió solo puede poner CANCELADA
--   • receiver_reject: el equipo receptor solo puede poner RECHAZADA
--   • ACEPTADA solo es alcanzable mediante el RPC accept_challenge
-- ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "challenges_update_by_either_team_admin" ON challenges;

-- FROM team: can only cancel their own challenge
CREATE POLICY "challenges_update_cancel_by_sender"
  ON challenges FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM team_members tm
      JOIN profiles p ON p.id = tm.profile_id
      WHERE tm.team_id = challenges.from_team_id
        AND p.auth_user_id = auth.uid()
        AND tm.role IN ('CAPITAN', 'SUBCAPITAN')
    )
  )
  WITH CHECK (
    status = 'CANCELADA'
    AND EXISTS (
      SELECT 1 FROM team_members tm
      JOIN profiles p ON p.id = tm.profile_id
      WHERE tm.team_id = challenges.from_team_id
        AND p.auth_user_id = auth.uid()
        AND tm.role IN ('CAPITAN', 'SUBCAPITAN')
    )
  );

-- TO team: can only reject (accepting goes through the accept_challenge RPC)
CREATE POLICY "challenges_update_reject_by_receiver"
  ON challenges FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM team_members tm
      JOIN profiles p ON p.id = tm.profile_id
      WHERE tm.team_id = challenges.to_team_id
        AND p.auth_user_id = auth.uid()
        AND tm.role IN ('CAPITAN', 'SUBCAPITAN')
    )
  )
  WITH CHECK (
    status = 'RECHAZADA'
    AND EXISTS (
      SELECT 1 FROM team_members tm
      JOIN profiles p ON p.id = tm.profile_id
      WHERE tm.team_id = challenges.to_team_id
        AND p.auth_user_id = auth.uid()
        AND tm.role IN ('CAPITAN', 'SUBCAPITAN')
    )
  );
