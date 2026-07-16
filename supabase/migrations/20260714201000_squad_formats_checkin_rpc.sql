-- ============================================================
-- SQUAD FORMATS (2/2) — RPC de check-in con convocatoria — 2026-07-14
-- ------------------------------------------------------------
-- submit_team_checkin: el capitán/subcapitán presenta la lista de buena fe
-- COMPLETA de su equipo (titulares + suplentes) en una sola operación
-- transaccional, validada contra format_rules. Reemplaza al flujo de
-- "check-in sin lista" para equipos (checkin_team queda vigente para
-- compatibilidad del cliente actual; el frontend migrará a esta RPC).
--
-- Validaciones (en orden):
--   1. Lock del match (FOR UPDATE) — serializa dobles submits.
--   2. Estado CONFIRMADO + formato definido.
--   3. Caller CAPITAN/SUBCAPITAN del equipo.
--   4. Payload bien formado y sin duplicados.
--   5. Cupos contra format_rules:
--        min_players_to_start <= titulares <= players_on_field
--        total <= max_squad_size
--   6. Cada jugador es miembro del equipo o invitado ya registrado
--      (join_match_as_guest) en ese partido para ese equipo.
--   7. Geofence <= 150 m si hay venue con coordenadas (paridad con
--      checkin_team).
--
-- Escritura: reemplazo atómico de la lista del equipo (borra los que salen,
-- upsertea los que quedan preservando did_checkin/checkin_* e is_guest).
-- Re-ejecutable mientras el match siga CONFIRMADO. Sella checkin_team_X_at
-- y pasa a EN_VIVO cuando ambos equipos presentaron lista.
--
-- Errores con prefijo estable (MIN_STARTERS_NOT_MET, SQUAD_LIMIT_EXCEEDED,
-- etc.) para que el frontend mapee mensajes sin parsear texto libre.
--
-- RLS: se cierra el INSERT directo de capitanes sobre match_participants
-- (la lista masiva sólo entra por esta RPC) y el UPDATE directo queda
-- limitado a la propia fila. Los invitados conservan su alta self-service
-- (usada vía join_match_as_guest).
-- ============================================================


-- ─── RPC ─────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.submit_team_checkin(
  p_match_id uuid,
  p_team_id  uuid,
  p_players  jsonb,               -- [{"profile_id": "...", "lineup_role": "TITULAR"|"SUPLENTE"}, ...]
  p_lat      numeric DEFAULT NULL,
  p_lng      numeric DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_match       matches%rowtype;
  v_rules       format_rules%rowtype;
  v_caller_id   uuid;
  v_venue       venues%rowtype;
  v_distance_m  numeric;
  v_total       integer;
  v_starters    integer;
  v_distinct    integer;
  v_invalid     integer;
  v_outsiders   text;
BEGIN
  -- 1. Lock del match
  SELECT * INTO v_match FROM matches WHERE id = p_match_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'MATCH_NOT_FOUND: partido % inexistente', p_match_id;
  END IF;

  IF p_team_id <> v_match.team_a_id AND p_team_id <> v_match.team_b_id THEN
    RAISE EXCEPTION 'TEAM_NOT_IN_MATCH: el equipo no juega este partido';
  END IF;

  -- 2. Estado y formato
  IF v_match.status <> 'CONFIRMADO' THEN
    RAISE EXCEPTION 'INVALID_MATCH_STATUS: la lista sólo se presenta con el partido CONFIRMADO (estado: %)', v_match.status;
  END IF;
  IF v_match.format IS NULL THEN
    RAISE EXCEPTION 'FORMAT_NOT_SET: el partido no tiene formato definido';
  END IF;

  -- 3. Autorización: CAPITAN o SUBCAPITAN del equipo
  SELECT id INTO v_caller_id FROM profiles WHERE auth_user_id = auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'PROFILE_NOT_FOUND: perfil no encontrado para el usuario actual';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM team_members
    WHERE team_id = p_team_id AND profile_id = v_caller_id
      AND role IN ('CAPITAN', 'SUBCAPITAN')
  ) THEN
    RAISE EXCEPTION 'NOT_TEAM_ADMIN: sólo el capitán o subcapitán puede presentar la lista';
  END IF;

  -- 4. Payload bien formado
  IF p_players IS NULL OR jsonb_typeof(p_players) <> 'array' OR jsonb_array_length(p_players) = 0 THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: p_players debe ser un array JSON no vacío';
  END IF;

  SELECT count(*),
         count(*) FILTER (WHERE e->>'lineup_role' = 'TITULAR'),
         count(DISTINCT e->>'profile_id'),
         count(*) FILTER (
           WHERE (e->>'profile_id') IS NULL
              OR NOT (e->>'profile_id' ~ '^[0-9a-fA-F-]{36}$')
              OR (e->>'lineup_role') IS NULL
              OR (e->>'lineup_role') NOT IN ('TITULAR', 'SUPLENTE')
         )
    INTO v_total, v_starters, v_distinct, v_invalid
  FROM jsonb_array_elements(p_players) e;

  IF v_invalid > 0 THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: cada entrada necesita profile_id (uuid) y lineup_role TITULAR|SUPLENTE';
  END IF;
  IF v_distinct <> v_total THEN
    RAISE EXCEPTION 'DUPLICATE_PLAYER: hay jugadores repetidos en la lista';
  END IF;

  -- 5. Cupos contra el catálogo
  SELECT * INTO v_rules FROM format_rules WHERE format = v_match.format;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'FORMAT_RULES_MISSING: no hay reglas cargadas para %', v_match.format;
  END IF;

  IF v_starters < v_rules.min_players_to_start THEN
    RAISE EXCEPTION 'MIN_STARTERS_NOT_MET: % necesita al menos % titulares (recibidos: %)',
      v_match.format, v_rules.min_players_to_start, v_starters;
  END IF;
  IF v_starters > v_rules.players_on_field THEN
    RAISE EXCEPTION 'TOO_MANY_STARTERS: % admite % titulares en cancha (recibidos: %)',
      v_match.format, v_rules.players_on_field, v_starters;
  END IF;
  IF v_total > v_rules.max_squad_size THEN
    RAISE EXCEPTION 'SQUAD_LIMIT_EXCEEDED: % admite % convocados como máximo (recibidos: %)',
      v_match.format, v_rules.max_squad_size, v_total;
  END IF;

  -- 6. Pertenencia: miembro del equipo o invitado ya registrado en el match
  SELECT string_agg(e->>'profile_id', ', ') INTO v_outsiders
  FROM jsonb_array_elements(p_players) e
  WHERE NOT EXISTS (
          SELECT 1 FROM team_members tm
          WHERE tm.team_id = p_team_id AND tm.profile_id = (e->>'profile_id')::uuid
        )
    AND NOT EXISTS (
          SELECT 1 FROM match_participants mp
          WHERE mp.match_id = p_match_id AND mp.team_id = p_team_id
            AND mp.profile_id = (e->>'profile_id')::uuid AND mp.is_guest
        );
  IF v_outsiders IS NOT NULL THEN
    RAISE EXCEPTION 'PLAYER_NOT_IN_TEAM: no son miembros ni invitados del equipo: %', v_outsiders;
  END IF;

  -- 7. Geofence (paridad con checkin_team): sólo si hay venue con coords y el
  --    caller mandó coords.
  IF v_match.venue_id IS NOT NULL AND p_lat IS NOT NULL AND p_lng IS NOT NULL THEN
    SELECT * INTO v_venue FROM venues WHERE id = v_match.venue_id;
    IF FOUND AND v_venue.lat IS NOT NULL AND v_venue.lng IS NOT NULL THEN
      v_distance_m := 2 * 6371000 * asin(sqrt(
        pow(sin(radians((p_lat - v_venue.lat) / 2)), 2) +
        cos(radians(v_venue.lat)) * cos(radians(p_lat)) *
        pow(sin(radians((p_lng - v_venue.lng) / 2)), 2)
      ));
      IF v_distance_m > 150 THEN
        RAISE EXCEPTION 'GEOFENCE_FAILED: estás a %m de la cancha. El check-in requiere estar a menos de 150m.', round(v_distance_m);
      END IF;
    END IF;
  END IF;

  -- Reemplazo atómico de la lista del equipo: salen los que ya no están...
  DELETE FROM match_participants
  WHERE match_id = p_match_id AND team_id = p_team_id
    AND profile_id NOT IN (
      SELECT (e->>'profile_id')::uuid FROM jsonb_array_elements(p_players) e
    );

  -- ...y se upsertea el resto preservando did_checkin/checkin_* e is_guest.
  INSERT INTO match_participants (match_id, profile_id, team_id, lineup_role)
  SELECT p_match_id, (e->>'profile_id')::uuid, p_team_id, (e->>'lineup_role')::lineup_role
  FROM jsonb_array_elements(p_players) e
  ON CONFLICT (match_id, profile_id) DO UPDATE SET
    team_id     = EXCLUDED.team_id,
    lineup_role = EXCLUDED.lineup_role;

  -- El caller que presenta la lista jugando queda con presencia marcada y
  -- habilitado a cargar el resultado (paridad con checkin_team).
  UPDATE match_participants SET
    did_checkin      = true,
    checkin_at       = now(),
    checkin_lat      = p_lat,
    checkin_lng      = p_lng,
    is_result_loader = true
  WHERE match_id = p_match_id AND profile_id = v_caller_id AND team_id = p_team_id;

  -- Sello del check-in del equipo
  IF v_match.team_a_id = p_team_id THEN
    UPDATE matches SET checkin_team_a_at = now() WHERE id = p_match_id;
  ELSE
    UPDATE matches SET checkin_team_b_at = now() WHERE id = p_match_id;
  END IF;

  -- Ambos equipos presentes → EN_VIVO
  SELECT * INTO v_match FROM matches WHERE id = p_match_id;
  IF v_match.checkin_team_a_at IS NOT NULL
     AND v_match.checkin_team_b_at IS NOT NULL
     AND v_match.status = 'CONFIRMADO'
  THEN
    UPDATE matches SET status = 'EN_VIVO', started_at = now() WHERE id = p_match_id;
    v_match.status := 'EN_VIVO';
  END IF;

  RETURN json_build_object(
    'matchId',     p_match_id,
    'teamId',      p_team_id,
    'format',      v_match.format,
    'starters',    v_starters,
    'substitutes', v_total - v_starters,
    'total',       v_total,
    'matchStatus', v_match.status
  );
END;
$$;

-- Superficie de ejecución: sólo usuarios autenticados (régimen A2).
REVOKE EXECUTE ON FUNCTION public.submit_team_checkin(uuid, uuid, jsonb, numeric, numeric) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.submit_team_checkin(uuid, uuid, jsonb, numeric, numeric) TO authenticated;


-- ─── RLS: la lista masiva sólo entra por la RPC ──────────────────────────────
-- Antes, un capitán podía insertar filas sueltas en match_participants desde
-- el cliente, salteándose los cupos. Se elimina esa vía; queda únicamente el
-- alta self-service de invitados (compatibilidad con el flujo del
-- unique_code). checkin_team, join_match_as_guest y submit_team_checkin son
-- SECURITY DEFINER y no dependen de estas políticas.

DROP POLICY IF EXISTS match_participants_insert_by_team_admin_or_guest ON public.match_participants;
CREATE POLICY match_participants_insert_guest_self ON public.match_participants
  FOR INSERT TO authenticated
  WITH CHECK (
    is_guest = true
    AND profile_id = (SELECT p.id FROM profiles p WHERE p.auth_user_id = (SELECT auth.uid()))
  );

-- Un invitado sólo puede declarar su identidad y lado; lineup_role e
-- is_result_loader los asigna la RPC.
REVOKE INSERT ON public.match_participants FROM anon, authenticated;
GRANT INSERT (match_id, profile_id, team_id, is_guest)
  ON public.match_participants TO authenticated;

-- El UPDATE directo de un capitán sobre filas ajenas permitiría flipear
-- lineup_role por fuera de los cupos: queda limitado a la propia fila (el
-- jugador marca su propio check-in). La política restringe la FILA; el grant
-- a nivel columna restringe QUÉ campos (lineup_role, team_id, is_guest e
-- is_result_loader sólo cambian vía RPC).
DROP POLICY IF EXISTS "match_participants_update_own_or_team_admin" ON public.match_participants;
CREATE POLICY match_participants_update_own ON public.match_participants
  FOR UPDATE TO authenticated
  USING (
    profile_id = (SELECT p.id FROM profiles p WHERE p.auth_user_id = (SELECT auth.uid()))
  )
  WITH CHECK (
    profile_id = (SELECT p.id FROM profiles p WHERE p.auth_user_id = (SELECT auth.uid()))
  );

REVOKE UPDATE ON public.match_participants FROM anon, authenticated;
GRANT UPDATE (did_checkin, checkin_at, checkin_lat, checkin_lng)
  ON public.match_participants TO authenticated;
