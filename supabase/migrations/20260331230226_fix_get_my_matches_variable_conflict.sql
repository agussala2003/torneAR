-- Fix ambiguous column reference in get_my_matches
--
-- RETURNS TABLE(id uuid, status match_status, ...) creates plpgsql local
-- variables with the same names as table columns (id, status, format, etc.).
-- The LATERAL subquery's SELECT * + unqualified column references triggered
-- error 42702 "column reference is ambiguous".
--
-- Fix: #variable_conflict use_column pragma + explicit column list in LATERAL
-- (alias changed from p → prop to avoid shadowing proposal_status output var).

CREATE OR REPLACE FUNCTION public.get_my_matches(p_team_id uuid)
RETURNS TABLE (
  id                    uuid,
  status                match_status,
  match_type            match_type,
  scheduled_at          timestamptz,
  format                team_format,
  venue_id              uuid,
  venue_name            text,
  location              text,
  signal_amount         numeric,
  total_cost            numeric,
  unique_code           text,
  started_at            timestamptz,
  finished_at           timestamptz,
  checkin_team_a_at     timestamptz,
  checkin_team_b_at     timestamptz,
  team_a_id             uuid,
  team_a_name           text,
  team_a_shield_url     text,
  team_a_elo            integer,
  team_b_id             uuid,
  team_b_name           text,
  team_b_shield_url     text,
  team_b_elo            integer,
  result_team_a         integer,
  result_team_b         integer,
  proposal_id           uuid,
  proposal_from_team_id uuid,
  proposal_scheduled_at timestamptz,
  proposal_format       team_format,
  proposal_location     text,
  proposal_status       proposal_status,
  has_pending_cancellation boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
#variable_conflict use_column
DECLARE
  v_profile_id uuid;
BEGIN
  SELECT p.id INTO v_profile_id FROM profiles p WHERE p.auth_user_id = auth.uid();
  IF v_profile_id IS NULL THEN
    RAISE EXCEPTION 'Perfil no encontrado para el usuario actual';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM team_members tm
    WHERE tm.team_id = p_team_id AND tm.profile_id = v_profile_id
  ) THEN
    RAISE EXCEPTION 'No autorizado: no sos miembro de este equipo';
  END IF;

  RETURN QUERY
  SELECT
    m.id,
    m.status,
    m.match_type,
    m.scheduled_at,
    m.format,
    m.venue_id,
    v.name                                       AS venue_name,
    m.location,
    m.signal_amount,
    m.total_cost,
    m.unique_code,
    m.started_at,
    m.finished_at,
    m.checkin_team_a_at,
    m.checkin_team_b_at,
    ta.id                                        AS team_a_id,
    ta.name                                      AS team_a_name,
    ta.shield_url                                AS team_a_shield_url,
    ta.elo_rating                                AS team_a_elo,
    tb.id                                        AS team_b_id,
    tb.name                                      AS team_b_name,
    tb.shield_url                                AS team_b_shield_url,
    tb.elo_rating                                AS team_b_elo,
    ra.goals_scored                              AS result_team_a,
    rb.goals_scored                              AS result_team_b,
    prop.id                                      AS proposal_id,
    prop.from_team_id                            AS proposal_from_team_id,
    prop.scheduled_at                            AS proposal_scheduled_at,
    prop.format                                  AS proposal_format,
    prop.location                                AS proposal_location,
    prop.status                                  AS proposal_status,
    EXISTS(
      SELECT 1 FROM cancellation_requests cr
      WHERE cr.match_id = m.id AND cr.status = 'PENDIENTE'
    )                                            AS has_pending_cancellation
  FROM matches m
  JOIN teams ta ON ta.id = m.team_a_id
  JOIN teams tb ON tb.id = m.team_b_id
  LEFT JOIN venues v ON v.id = m.venue_id
  LEFT JOIN match_results ra ON ra.match_id = m.id AND ra.team_id = m.team_a_id
  LEFT JOIN match_results rb ON rb.match_id = m.id AND rb.team_id = m.team_b_id
  LEFT JOIN LATERAL (
    SELECT mp.id, mp.from_team_id, mp.scheduled_at, mp.format, mp.location, mp.status
    FROM match_proposals mp
    WHERE mp.match_id = m.id AND mp.status = 'PENDIENTE'
    ORDER BY mp.created_at DESC
    LIMIT 1
  ) prop ON true
  WHERE m.team_a_id = p_team_id OR m.team_b_id = p_team_id
  ORDER BY
    CASE WHEN m.status = 'EN_VIVO'                        THEN 0
         WHEN m.status IN ('CONFIRMADO', 'PENDIENTE')     THEN 1
         ELSE 2
    END,
    m.scheduled_at DESC NULLS LAST;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_my_matches(uuid) TO authenticated;
