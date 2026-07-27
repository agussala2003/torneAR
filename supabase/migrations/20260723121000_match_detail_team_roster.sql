-- ============================================================
-- BUG 4 — PLANTEL COMPLETO EN LA CARGA DE RESULTADOS — 2026-07-23
-- ------------------------------------------------------------
-- Sintoma QA: como cap.alfa, en un partido EN_VIVO el selector de goleadores /
-- MVP ofrece solo 2 jugadores en lugar del plantel entero.
--
-- Causa raiz: el nodo `participants` sale de match_participants, que NO es el
-- plantel: es la CONVOCATORIA del partido (lista de buena fe presentada por el
-- capitan). El selector estaba leyendo la lista equivocada.
--
-- Por que esto es un bug de produccion y no solo del seed: la RPC legacy
-- checkin_team (20260328022610) inserta UNICAMENTE al caller en
-- match_participants y puede flipear el partido a EN_VIVO. Un partido iniciado
-- por esa via queda con UN participante por equipo, y el capitan no puede
-- asignarle goles a nadie mas que a si mismo. La RPC nueva submit_team_checkin
-- si carga la lista completa, pero la pantalla de detalle nunca la usa.
--
-- Decision de dominio: la convocatoria define quien DEBERIA jugar; el resultado
-- registra quien JUGO. Un gol puede ser de alguien que entro sin figurar en la
-- lista. Por eso `team_roster` expone el plantel entero y marca con `in_squad`
-- quien esta convocado, para que la UI ordene (convocados primero) y advierta
-- cuando se le carga un gol a alguien fuera de lista.
--
-- Cambio de contrato: el payload es identico al anterior MAS la clave
-- `team_roster`. Los clientes viejos la ignoran; no hay breaking change.
--
-- Se preservan intactas las dos verificaciones de seguridad de
-- 20260328165650_production_security_patch.sql (perfil resuelto + membresia en
-- p_team_id): sin ellas la RPC filtraba unique_code, coordenadas del venue y
-- participantes a cualquier usuario.
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_match_detail(p_match_id uuid, p_team_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_profile_id uuid;
  v_result     json;
  v_roster     json;
BEGIN
  -- ── Resolver perfil del usuario ────────────────────────────────────────────
  SELECT id INTO v_profile_id FROM profiles WHERE auth_user_id = auth.uid();
  IF v_profile_id IS NULL THEN
    RAISE EXCEPTION 'Perfil no encontrado para el usuario actual';
  END IF;

  -- ── Verificar que el caller es miembro del equipo solicitado ───────────────
  IF NOT EXISTS (
    SELECT 1 FROM team_members
    WHERE team_id = p_team_id AND profile_id = v_profile_id
  ) THEN
    RAISE EXCEPTION 'No autorizado: no sos miembro de este equipo';
  END IF;

  -- ── Plantel de MI equipo (bug 4) ───────────────────────────────────────────
  -- UNION de dos fuentes disjuntas:
  --   1. team_members  → el plantel real, este o no convocado.
  --   2. match_participants con is_guest = true → invitados que entraron por
  --      unique_code (join_match_as_guest). No son miembros, pero jugaron y
  --      pueden haber convertido.
  -- La rama de invitados excluye explicitamente a quien ya es miembro para que
  -- el UNION no pueda emitir dos filas del mismo profile_id (difieren en
  -- is_guest/team_role, asi que la deduplicacion del UNION no las colapsaria).
  SELECT coalesce(json_agg(r ORDER BY r.in_squad DESC, r.full_name), '[]'::json)
    INTO v_roster
  FROM (
    SELECT
      tm.profile_id                                              AS profile_id,
      coalesce(pr.full_name, pr.username, 'Jugador')             AS full_name,
      coalesce(pr.username, '')                                  AS username,
      pr.avatar_url                                              AS avatar_url,
      p_team_id                                                  AS team_id,
      false                                                      AS is_guest,
      tm.role                                                    AS team_role,
      EXISTS (
        SELECT 1 FROM match_participants mp
        WHERE mp.match_id   = p_match_id
          AND mp.team_id    = p_team_id
          AND mp.profile_id = tm.profile_id
      )                                                          AS in_squad
    FROM team_members tm
    JOIN profiles pr ON pr.id = tm.profile_id
    WHERE tm.team_id = p_team_id

    UNION

    SELECT
      mp.profile_id,
      coalesce(pr.full_name, pr.username, 'Invitado'),
      coalesce(pr.username, ''),
      pr.avatar_url,
      mp.team_id,
      true,
      NULL::team_role,
      true                       -- un invitado existe solo si esta en la lista
    FROM match_participants mp
    JOIN profiles pr ON pr.id = mp.profile_id
    WHERE mp.match_id = p_match_id
      AND mp.team_id  = p_team_id
      AND mp.is_guest = true
      AND NOT EXISTS (
        SELECT 1 FROM team_members tm2
        WHERE tm2.team_id = p_team_id AND tm2.profile_id = mp.profile_id
      )
  ) r;

  -- ── Construir respuesta JSON ───────────────────────────────────────────────
  SELECT json_build_object(
    'id',                 m.id,
    'status',             m.status,
    'match_type',         m.match_type,
    'format',             m.format,
    'scheduled_at',       m.scheduled_at,
    'duration_minutes',   m.duration_minutes,
    'location',           m.location,
    'venue_id',           m.venue_id,
    'venue_name',         v.name,
    'venue_address',      v.address,
    'venue_lat',          v.lat,
    'venue_lng',          v.lng,
    'signal_amount',      m.signal_amount,
    'total_cost',         m.total_cost,
    'unique_code',        m.unique_code,
    'started_at',         m.started_at,
    'finished_at',        m.finished_at,
    'checkin_team_a_at',  m.checkin_team_a_at,
    'checkin_team_b_at',  m.checkin_team_b_at,
    'team_a', json_build_object(
      'id',         ta.id,
      'name',       ta.name,
      'shield_url', ta.shield_url,
      'elo_rating', ta.elo_rating
    ),
    'team_b', json_build_object(
      'id',         tb.id,
      'name',       tb.name,
      'shield_url', tb.shield_url,
      'elo_rating', tb.elo_rating
    ),
    'my_team_id', p_team_id,
    'my_role', (
      SELECT tm.role
      FROM team_members tm
      JOIN profiles pr ON pr.id = tm.profile_id
      WHERE tm.team_id = p_team_id
        AND pr.auth_user_id = auth.uid()
      LIMIT 1
    ),
    'is_result_loader', (
      EXISTS (
        SELECT 1
        FROM match_participants mp
        JOIN profiles pr ON pr.id = mp.profile_id
        WHERE mp.match_id = m.id
          AND mp.team_id  = p_team_id
          AND mp.is_result_loader = true
          AND pr.auth_user_id = auth.uid()
      )
      OR
      EXISTS (
        SELECT 1
        FROM team_members tm
        JOIN profiles pr ON pr.id = tm.profile_id
        WHERE tm.team_id = p_team_id
          AND pr.auth_user_id = auth.uid()
          AND tm.role IN ('CAPITAN', 'SUBCAPITAN')
      )
    ),
    'active_proposal', (
      SELECT json_build_object(
        'id',               p.id,
        'match_id',         p.match_id,
        'from_team_id',     p.from_team_id,
        'proposed_by_name', pr2.full_name,
        'format',           p.format,
        'match_type',       p.match_type,
        'scheduled_at',     p.scheduled_at,
        'duration_minutes', p.duration_minutes,
        'location',         p.location,
        'venue_id',         p.venue_id,
        'venue_name',       pv.name,
        'venue_address',    pv.address,
        'venue_lat',        pv.lat,
        'venue_lng',        pv.lng,
        'signal_amount',    p.signal_amount,
        'total_cost',       p.total_cost,
        'status',           p.status,
        'created_at',       p.created_at
      )
      FROM match_proposals p
      JOIN profiles pr2 ON pr2.id = p.proposed_by
      LEFT JOIN venues pv ON pv.id = p.venue_id
      WHERE p.match_id = m.id
        AND p.status = 'PENDIENTE'
      ORDER BY p.created_at DESC
      LIMIT 1
    ),
    'my_result', (
      SELECT json_build_object(
        'team_id',       r.team_id,
        'goals_scored',  r.goals_scored,
        'goals_against', r.goals_against,
        'submitted_at',  r.submitted_at,
        'scorers', (
          SELECT COALESCE(json_agg(
            json_build_object(
              'profile_id', sc->>'profile_id',
              'full_name',  sprof.full_name,
              'goals',      (sc->>'goals')::int
            )
          ), '[]'::json)
          FROM jsonb_array_elements(r.scorers) AS sc
          JOIN profiles sprof ON sprof.id = (sc->>'profile_id')::uuid
        ),
        'mvp', CASE WHEN r.mvp_id IS NOT NULL THEN json_build_object(
          'id',         mvppr.id,
          'full_name',  mvppr.full_name,
          'username',   mvppr.username,
          'avatar_url', mvppr.avatar_url
        ) ELSE NULL END
      )
      FROM match_results r
      LEFT JOIN profiles mvppr ON mvppr.id = r.mvp_id
      WHERE r.match_id = m.id
        AND r.team_id = p_team_id
      LIMIT 1
    ),
    'opponent_result', (
      SELECT json_build_object(
        'team_id',       r.team_id,
        'goals_scored',  r.goals_scored,
        'goals_against', r.goals_against,
        'submitted_at',  r.submitted_at,
        'scorers', (
          SELECT COALESCE(json_agg(
            json_build_object(
              'profile_id', sc->>'profile_id',
              'full_name',  sprof.full_name,
              'goals',      (sc->>'goals')::int
            )
          ), '[]'::json)
          FROM jsonb_array_elements(r.scorers) AS sc
          JOIN profiles sprof ON sprof.id = (sc->>'profile_id')::uuid
        ),
        'mvp', CASE WHEN r.mvp_id IS NOT NULL THEN json_build_object(
          'id',         mvppr.id,
          'full_name',  mvppr.full_name,
          'username',   mvppr.username,
          'avatar_url', mvppr.avatar_url
        ) ELSE NULL END
      )
      FROM match_results r
      LEFT JOIN profiles mvppr ON mvppr.id = r.mvp_id
      WHERE r.match_id = m.id
        AND r.team_id <> p_team_id
      LIMIT 1
    ),
    'participants', (
      SELECT COALESCE(json_agg(
        json_build_object(
          'profile_id',       mp.profile_id,
          'full_name',        ppr.full_name,
          'username',         ppr.username,
          'avatar_url',       ppr.avatar_url,
          'team_id',          mp.team_id,
          'is_guest',         mp.is_guest,
          'did_checkin',      mp.did_checkin,
          'checkin_at',       mp.checkin_at,
          'is_result_loader', mp.is_result_loader
        )
      ), '[]'::json)
      FROM match_participants mp
      JOIN profiles ppr ON ppr.id = mp.profile_id
      WHERE mp.match_id = m.id
    ),
    -- ── NUEVO (bug 4) ────────────────────────────────────────────────────────
    -- Plantel de MI equipo. `participants` sigue siendo la convocatoria (la
    -- usa CheckinSection para contar presentes); `team_roster` es la fuente
    -- correcta para el selector de goleadores/MVP.
    'team_roster', v_roster,
    'conversation_id', (
      SELECT c.id
      FROM conversations c
      WHERE c.match_id = m.id
        AND c.type = 'MATCH_CHAT'
      LIMIT 1
    ),
    'wo_claim', (
      SELECT json_build_object(
        'id',               wc.id,
        'claiming_team_id', wc.claiming_team_id,
        'reason',           wc.reason,
        'photo_url',        wc.photo_url,
        'status',           wc.status,
        'admin_notes',      wc.admin_notes,
        'created_at',       wc.created_at
      )
      FROM wo_claims wc
      WHERE wc.match_id = m.id
      LIMIT 1
    ),
    'cancellation_request', (
      SELECT json_build_object(
        'id',                   cr.id,
        'requested_by_team_id', cr.requested_by_team_id,
        'reason',               cr.reason,
        'notes',                cr.notes,
        'status',               cr.status,
        'created_at',           cr.created_at,
        'is_late',              cr.is_late
      )
      FROM cancellation_requests cr
      WHERE cr.match_id = m.id
        AND cr.status = 'PENDIENTE'
      ORDER BY cr.created_at DESC
      LIMIT 1
    )
  )
  INTO v_result
  FROM matches m
  JOIN teams ta ON ta.id = m.team_a_id
  JOIN teams tb ON tb.id = m.team_b_id
  LEFT JOIN venues v ON v.id = m.venue_id
  WHERE m.id = p_match_id
    AND (m.team_a_id = p_team_id OR m.team_b_id = p_team_id);

  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION public.get_match_detail(uuid, uuid) IS
  'Detalle completo del partido para un equipo. `participants` = convocatoria (match_participants); `team_roster` = plantel real (team_members + invitados) con flag in_squad, fuente correcta para el selector de goleadores/MVP.';

-- Convencion A2 (20260711012137_a2_rpc_execute_lockdown): sin superficie para
-- anon/PUBLIC; solo authenticated.
REVOKE EXECUTE ON FUNCTION public.get_match_detail(uuid, uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_match_detail(uuid, uuid) TO authenticated;
