-- join_match_as_guest: allows any authenticated user to join a confirmed match
-- using its unique_code and selecting which team side to play on.
CREATE OR REPLACE FUNCTION public.join_match_as_guest(
  p_unique_code text,
  p_team_side   text   -- 'A' or 'B'
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_match      matches%rowtype;
  v_profile_id uuid;
  v_team_id    uuid;
BEGIN
  -- Validate side
  IF p_team_side NOT IN ('A', 'B') THEN
    RAISE EXCEPTION 'p_team_side must be ''A'' or ''B''';
  END IF;

  -- Find the match by unique code
  SELECT * INTO v_match
  FROM matches
  WHERE unique_code = upper(trim(p_unique_code));

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Código inválido. No se encontró ningún partido con ese código.';
  END IF;

  -- Only CONFIRMADO matches can accept guest players
  IF v_match.status <> 'CONFIRMADO' THEN
    RAISE EXCEPTION 'Este partido no está disponible para unirse como invitado (estado: %).', v_match.status;
  END IF;

  -- Get caller's profile
  SELECT id INTO v_profile_id FROM profiles WHERE auth_user_id = auth.uid();
  IF v_profile_id IS NULL THEN
    RAISE EXCEPTION 'Perfil no encontrado para el usuario actual';
  END IF;

  -- Resolve team from side
  v_team_id := CASE p_team_side WHEN 'A' THEN v_match.team_a_id ELSE v_match.team_b_id END;

  -- Upsert into match_participants as guest
  INSERT INTO match_participants (match_id, profile_id, team_id, is_guest, did_checkin)
  VALUES (v_match.id, v_profile_id, v_team_id, true, false)
  ON CONFLICT (match_id, profile_id)
  DO UPDATE SET
    team_id  = v_team_id,
    is_guest = true;

  RETURN json_build_object(
    'matchId',   v_match.id,
    'teamId',    v_team_id,
    'teamSide',  p_team_side,
    'teamAName', (SELECT name FROM teams WHERE id = v_match.team_a_id),
    'teamBName', (SELECT name FROM teams WHERE id = v_match.team_b_id)
  );
END;
$$;
