-- checkin_team: add GPS coordinates + geofence validation (≤ 150m from venue)
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
  IF NOT FOUND THEN RAISE EXCEPTION 'Match not found: %', p_match_id; END IF;

  -- Identify the calling user's profile
  SELECT id INTO v_profile_id FROM profiles WHERE auth_user_id = auth.uid();
  IF v_profile_id IS NULL THEN RAISE EXCEPTION 'Profile not found for current user'; END IF;

  -- Geofence validation: only when match has a venue with coords AND user sent coords
  IF v_match.venue_id IS NOT NULL AND p_lat IS NOT NULL AND p_lng IS NOT NULL THEN
    SELECT * INTO v_venue FROM venues WHERE id = v_match.venue_id;
    IF FOUND AND v_venue.lat IS NOT NULL AND v_venue.lng IS NOT NULL THEN
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
