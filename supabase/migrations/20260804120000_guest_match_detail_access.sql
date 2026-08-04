-- ============================================================
-- FIX INVITADO — EL CÓDIGO DEJABA ENTRAR PERO NO DEJABA MIRAR — 2026-08-04
-- ------------------------------------------------------------
-- Síntoma QA: un usuario ajeno a los dos equipos canjea el `unique_code` en
-- GuestJoinModal, `join_match_as_guest` devuelve OK y lo navega al detalle del
-- partido... y la pantalla muere en `match-detail.loadData` con
--
--     No autorizado: no sos miembro de este equipo
--
-- Causa raíz: `get_match_detail` (20260328165650, ampliada por 20260723121000)
-- autoriza SOLO contra `team_members`. Pero `join_match_as_guest` NO crea
-- membresía a propósito —el invitado juega el partido, no se afilia al club—:
-- deja una fila en `match_participants` con `is_guest = true`. Las dos mitades
-- del circuito estaban implementadas contra dos definiciones distintas de
-- "estar en este partido", así que el código funcionaba para entrar y fallaba
-- para leer.
--
-- El resto del circuito ya contemplaba al invitado y por eso el bug quedaba
-- tapado hasta la última milla:
--   · `resolveMyTeamIdForMatch` (lib/match-detail-data.ts) resuelve el equipo
--     mirando `team_members` UNION `match_participants` — le devolvía al
--     invitado un teamId correcto, que la RPC después rechazaba.
--   · `team_roster` (20260723121000) ya emite a los invitados en el plantel.
--   · `submit_team_checkin` (20260714201000) ya los acepta en la convocatoria.
--
-- ── Por qué el arreglo va en la RPC y no en las policies de `matches` ───────
-- No hay nada que aflojar en RLS: `matches_select_all` es `using (true)` desde
-- 20240101000000 y `match_participants_select_all` también. Verificado contra
-- la base local — el invitado ya podía hacer `select * from matches`; lo que lo
-- frenaba era el `RAISE EXCEPTION` de esta función `SECURITY DEFINER`, que
-- corre por encima de las policies. Aflojar RLS no habría cambiado nada.
--
-- ── Qué se admite exactamente ──────────────────────────────────────────────
-- La autorización pasa a ser "sos miembro del equipo O estás anotado en ESTE
-- partido por ESE equipo". La segunda rama no es una puerta abierta: la única
-- vía para conseguir esa fila siendo ajeno al club es `join_match_as_guest`,
-- que ya exige `status = 'CONFIRMADO'` y un código no vencido (E7,
-- 20260729120000). Presentar el código válido ES la credencial; esta función
-- simplemente vuelve a reconocerla.
--
-- El alcance sigue anclado al partido y al equipo pedidos: la fila de
-- `match_participants` se busca por (match_id, team_id, profile_id), así que
-- un invitado del partido X no gana lectura sobre el partido Y, ni el invitado
-- del equipo A puede pedir el detalle desde la vista del equipo B.
--
-- `unique_code` viaja en el payload y ahora lo ve también el invitado: es
-- exactamente el dato que tuvo que tipear para llegar hasta acá, así que no
-- hay divulgación nueva.
--
-- Cuerpo idéntico a 20260723121000_match_detail_team_roster.sql salvo el
-- bloque de autorización. Se preserva la verificación de perfil resuelto.
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

  -- ── Autorización: miembro del equipo O anotado en este partido ─────────────
  -- La segunda rama es el invitado por código (join_match_as_guest) y también
  -- el jugador que un capitán convocó. Ambas quedan acotadas a la tripleta
  -- (partido, equipo, perfil): no hay lectura transversal.
  IF NOT EXISTS (
    SELECT 1 FROM team_members
    WHERE team_id = p_team_id AND profile_id = v_profile_id
  ) AND NOT EXISTS (
    SELECT 1 FROM match_participants
    WHERE match_id   = p_match_id
      AND team_id    = p_team_id
      AND profile_id = v_profile_id
  ) THEN
    RAISE EXCEPTION 'No autorizado: no sos miembro ni invitado de este partido';
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
    -- NULL para el invitado: no tiene rol en el club. La UI ya trata `myRole`
    -- nulo como "sin permisos de capitanía" (match-permissions.ts).
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
    -- ── (bug 4) ──────────────────────────────────────────────────────────────
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
  'Detalle completo del partido para un equipo. Autoriza a miembros del equipo Y a quienes estén anotados en el partido por ese equipo (invitados por unique_code vía join_match_as_guest). `participants` = convocatoria; `team_roster` = plantel real con flag in_squad.';

-- Convencion A2 (20260711012137_a2_rpc_execute_lockdown): sin superficie para
-- anon/PUBLIC; solo authenticated.
REVOKE EXECUTE ON FUNCTION public.get_match_detail(uuid, uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_match_detail(uuid, uuid) TO authenticated;
