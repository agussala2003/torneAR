-- ============================================================
-- D2 · Telemetría de distancia del check-in — 2026-08-11
-- ------------------------------------------------------------
-- El radio pasó de 150 a 500 m (migración 20260810120000) porque 150 fallaba en
-- campo con GPS honesto. Ese número se eligió por intuición: no hay un solo dato
-- de a qué distancia real está la gente cuando hace check-in.
--
-- Esta migración registra esa distancia en `app_logs` para poder ajustar el
-- radio con evidencia. El check-in NO cambia de comportamiento: sigue
-- aceptándose o rechazándose exactamente igual.
--
-- ─── Qué población queda registrada ──────────────────────────────────────────
-- Sólo los check-ins EXITOSOS, y es a propósito: un INSERT previo a un
-- `RAISE EXCEPTION` se va con el rollback de la transacción, así que registrar
-- los rechazos desde acá exigiría una transacción autónoma (dblink/pg_background)
-- —dependencia nueva y otra conexión por intento— para un dato que ya existe:
-- el mensaje de GEOFENCE_FAILED lleva la distancia y el cliente lo escribe en
-- `app_logs` por su propio Logger.
--
-- Y es justamente la población que se quiere medir: "a qué distancia está el
-- usuario que hace check-in con GPS honesto" son los que entran, no los que la
-- guarda rechaza.
--
-- ─── Consulta de análisis ────────────────────────────────────────────────────
--   SELECT
--     count(*)                                                   AS checkins,
--     round(avg((details->>'distance_m')::numeric))              AS promedio_m,
--     percentile_disc(0.5)  WITHIN GROUP (ORDER BY (details->>'distance_m')::numeric) AS mediana_m,
--     percentile_disc(0.95) WITHIN GROUP (ORDER BY (details->>'distance_m')::numeric) AS p95_m,
--     max((details->>'distance_m')::numeric)                     AS maximo_m
--   FROM public.app_logs
--   WHERE message = 'checkin.geofence';
--
-- Con el p95 sobre unas cuantas semanas se puede bajar el radio sabiendo a
-- quién deja afuera.
--
-- Idempotente: se puede re-aplicar sin efectos.
-- ============================================================


-- ═══════════════════════════════════════════════════════════════
-- 1. Helper de registro
-- ═══════════════════════════════════════════════════════════════
-- Vive aparte para que las dos RPCs de check-in no dupliquen el INSERT (ya
-- duplican la fórmula de Haversine, que se deja como está: tocar la aritmética
-- del geofence en la misma migración que agrega logging mezcla un cambio
-- cosmético con uno de seguridad).
--
-- Nunca interrumpe el check-in: si el registro falla, el check-in ya ocurrió y
-- perder una fila de telemetría no justifica abortarlo.
CREATE OR REPLACE FUNCTION public.log_checkin_distance(
  p_match_id   uuid,
  p_team_id    uuid,
  p_profile_id uuid,
  p_venue_id   uuid,
  p_distance_m numeric,
  p_radius_m   numeric,
  p_source     text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.app_logs (level, message, details, user_id)
  VALUES (
    'info',
    'checkin.geofence',
    jsonb_build_object(
      'match_id',   p_match_id,
      'team_id',    p_team_id,
      'profile_id', p_profile_id,
      'venue_id',   p_venue_id,
      'distance_m', round(p_distance_m),
      'radius_m',   round(p_radius_m),
      'source',     p_source
    ),
    auth.uid()
  );
EXCEPTION
  WHEN OTHERS THEN
    -- Telemetría best-effort. El check-in manda.
    RAISE WARNING 'log_checkin_distance falló (match %): %', p_match_id, SQLERRM;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.log_checkin_distance(uuid, uuid, uuid, uuid, numeric, numeric, text)
  FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.log_checkin_distance(uuid, uuid, uuid, uuid, numeric, numeric, text) IS
  'Registra en app_logs la distancia real medida en un check-in aceptado (message = ''checkin.geofence''). Best-effort: nunca aborta el check-in.';



-- ═══════════════════════════════════════════════════════════════
-- 2. checkin_team — check-in individual
-- ═══════════════════════════════════════════════════════════════
-- Cuerpo tomado TAL CUAL de la definición vigente en la base (`pg_get_functiondef`)
-- y no del archivo de la migración que la creó: `checkin_team` fue redefinida
-- después por D9 (quórum por equipo, pasó a devolver json) y `submit_team_checkin`
-- por R6 (autorización del DIRECTOR_TECNICO). Reconstruirlas desde el archivo
-- viejo las habría regresado a una versión anterior — silenciosamente, porque
-- CREATE OR REPLACE no avisa. El único agregado es el PERFORM de telemetría.

CREATE OR REPLACE FUNCTION public.checkin_team(p_match_id uuid, p_team_id uuid, p_lat numeric DEFAULT NULL::numeric, p_lng numeric DEFAULT NULL::numeric)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_match       matches%rowtype;
  v_profile_id  uuid;
  v_venue       venues%rowtype;
  v_distance_m  numeric;
  v_radius_m    numeric;
  v_checked_in  integer;
  v_min_players integer;
  v_sealed_at   timestamptz;
  v_just_sealed boolean := false;
BEGIN
  SELECT * INTO v_match FROM matches WHERE id = p_match_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'MATCH_NOT_FOUND: partido % inexistente', p_match_id;
  END IF;

  SELECT id INTO v_profile_id FROM profiles WHERE auth_user_id = auth.uid();
  IF v_profile_id IS NULL THEN
    RAISE EXCEPTION 'PROFILE_NOT_FOUND: perfil no encontrado para el usuario actual';
  END IF;

  -- ÍTEM 4 (heredado de 20260328150331): el caller tiene que ser miembro del
  -- equipo por el que hace check-in — o invitado ya registrado en este partido
  -- para ese equipo (join_match_as_guest). El literal 'No autorizado' lo
  -- verifica 100-rls-security.spec.sql (P1-4): no cambiar el texto ni adelantar
  -- esta guarda sin tocar el test.
  IF NOT EXISTS (
    SELECT 1 FROM team_members
    WHERE team_id = p_team_id AND profile_id = v_profile_id
  ) AND NOT EXISTS (
    SELECT 1 FROM match_participants
    WHERE match_id = p_match_id AND team_id = p_team_id
      AND profile_id = v_profile_id AND is_guest
  ) THEN
    RAISE EXCEPTION 'No autorizado: no sos miembro del equipo que intentás hacer check-in';
  END IF;

  IF v_match.team_a_id <> p_team_id AND v_match.team_b_id <> p_team_id THEN
    RAISE EXCEPTION 'TEAM_NOT_IN_MATCH: el equipo no participa en este partido';
  END IF;

  -- D9: sin esta guarda, un check-in sobre un partido PENDIENTE dejaba el sello
  -- puesto y lo pre-confirmaba; y sobre un FINALIZADO/CANCELADO era ruido puro.
  IF v_match.status NOT IN ('CONFIRMADO', 'EN_VIVO') THEN
    RAISE EXCEPTION 'INVALID_MATCH_STATUS: el check-in sólo corre con el partido CONFIRMADO o EN_VIVO (estado: %)', v_match.status;
  END IF;

  -- Geofence. Radio configurable desde app_settings; error con prefijo estable.
  IF v_match.venue_id IS NOT NULL THEN
    SELECT * INTO v_venue FROM venues WHERE id = v_match.venue_id;

    IF FOUND AND v_venue.lat IS NOT NULL AND v_venue.lng IS NOT NULL THEN
      IF p_lat IS NULL OR p_lng IS NULL THEN
        RAISE EXCEPTION 'LOCATION_REQUIRED: el check-in de este partido requiere tu ubicación';
      END IF;

      v_radius_m := public.checkin_geofence_radius_m();

      v_distance_m := 2 * 6371000 * asin(sqrt(
        pow(sin(radians((p_lat - v_venue.lat) / 2)), 2) +
        cos(radians(v_venue.lat)) * cos(radians(p_lat)) *
        pow(sin(radians((p_lng - v_venue.lng) / 2)), 2)
      ));

      IF v_distance_m > v_radius_m THEN
        RAISE EXCEPTION 'GEOFENCE_FAILED: estás a %m de la cancha, el máximo es %m',
          round(v_distance_m), round(v_radius_m);
      END IF;

      -- D2: pasó el geofence. Se registra la distancia real medida.
      PERFORM public.log_checkin_distance(
        p_match_id, p_team_id, v_profile_id, v_venue.id,
        v_distance_m, v_radius_m, 'checkin_team'
      );
    END IF;
  END IF;

  -- ── Hecho 1: MI llegada ───────────────────────────────────────────────────
  -- Esto siempre pasa, para cualquier miembro. Es el registro individual, y es
  -- lo que la evidencia de un WO necesita: quién estuvo y a qué hora.
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

  -- ── Hecho 2: ¿se presentó el EQUIPO? ─────────────────────────────────────
  SELECT count(*) INTO v_checked_in
  FROM match_participants
  WHERE match_id = p_match_id AND team_id = p_team_id AND did_checkin;

  v_min_players := public.checkin_min_players(v_match.format);

  v_sealed_at := CASE WHEN v_match.team_a_id = p_team_id
                      THEN v_match.checkin_team_a_at
                      ELSE v_match.checkin_team_b_at END;

  -- Sólo se sella una vez: si el capitán ya presentó la lista por
  -- submit_team_checkin, el timestamp original manda. Re-sellar movería la hora
  -- de llegada del equipo hacia adelante y falsearía la evidencia del WO.
  IF v_sealed_at IS NULL AND v_checked_in >= v_min_players THEN
    IF v_match.team_a_id = p_team_id THEN
      UPDATE matches SET checkin_team_a_at = now() WHERE id = p_match_id;
    ELSE
      UPDATE matches SET checkin_team_b_at = now() WHERE id = p_match_id;
    END IF;
    v_just_sealed := true;
  END IF;

  -- Ambos equipos presentes → EN_VIVO (sin cambios respecto del original, salvo
  -- que ahora "presente" significa lo que dice).
  SELECT * INTO v_match FROM matches WHERE id = p_match_id;
  IF v_match.checkin_team_a_at IS NOT NULL
     AND v_match.checkin_team_b_at IS NOT NULL
     AND v_match.status = 'CONFIRMADO'
  THEN
    UPDATE matches SET status = 'EN_VIVO', started_at = now() WHERE id = p_match_id;
    v_match.status := 'EN_VIVO';
  END IF;

  RETURN json_build_object(
    'matchId',          p_match_id,
    'teamId',           p_team_id,
    'checkedInPlayers', v_checked_in,
    'minPlayers',       v_min_players,
    'teamSealed',       (v_sealed_at IS NOT NULL OR v_just_sealed),
    'justSealed',       v_just_sealed,
    'matchStatus',      v_match.status
  );
END;
$function$

;

-- ═══════════════════════════════════════════════════════════════
-- 3. submit_team_checkin — convocatoria (lista de buena fe)
-- ═══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.submit_team_checkin(p_match_id uuid, p_team_id uuid, p_players jsonb, p_lat numeric DEFAULT NULL::numeric, p_lng numeric DEFAULT NULL::numeric)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_match       matches%rowtype;
  v_rules       format_rules%rowtype;
  v_caller_id   uuid;
  v_venue       venues%rowtype;
  v_distance_m  numeric;
  v_radius_m    numeric;
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

  -- 3. Autorización: CUERPO TÉCNICO del equipo (R6).
  -- Presentar la lista es un acto del banco de suplentes, no de la conducción
  -- del club: el DT arma el equipo que juega. El código de error se mantiene
  -- (`NOT_TEAM_ADMIN`) porque el cliente lo mapea por prefijo.
  SELECT id INTO v_caller_id FROM profiles WHERE auth_user_id = auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'PROFILE_NOT_FOUND: perfil no encontrado para el usuario actual';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM team_members
    WHERE team_id = p_team_id AND profile_id = v_caller_id
      AND role IN ('CAPITAN', 'SUBCAPITAN', 'DIRECTOR_TECNICO')
  ) THEN
    RAISE EXCEPTION 'NOT_TEAM_ADMIN: sólo el capitán, el subcapitán o el DT puede presentar la lista';
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

  -- 7. Geofence — la ubicación es obligatoria si hay cancha del catálogo.
  IF v_match.venue_id IS NOT NULL THEN
    SELECT * INTO v_venue FROM venues WHERE id = v_match.venue_id;

    IF FOUND AND v_venue.lat IS NOT NULL AND v_venue.lng IS NOT NULL THEN
      IF p_lat IS NULL OR p_lng IS NULL THEN
        RAISE EXCEPTION 'LOCATION_REQUIRED: presentar la lista en este partido requiere tu ubicación';
      END IF;

      v_radius_m := public.checkin_geofence_radius_m();

      v_distance_m := 2 * 6371000 * asin(sqrt(
        pow(sin(radians((p_lat - v_venue.lat) / 2)), 2) +
        cos(radians(v_venue.lat)) * cos(radians(p_lat)) *
        pow(sin(radians((p_lng - v_venue.lng) / 2)), 2)
      ));

      IF v_distance_m > v_radius_m THEN
        RAISE EXCEPTION 'GEOFENCE_FAILED: estás a %m de la cancha, el máximo es %m',
          round(v_distance_m), round(v_radius_m);
      END IF;

      -- D2: pasó el geofence. Se registra la distancia real medida.
      PERFORM public.log_checkin_distance(
        p_match_id, p_team_id, v_caller_id, v_venue.id,
        v_distance_m, v_radius_m, 'submit_team_checkin'
      );
    END IF;
  END IF;

  -- Reemplazo atómico de la lista del equipo
  DELETE FROM match_participants
  WHERE match_id = p_match_id AND team_id = p_team_id
    AND profile_id NOT IN (
      SELECT (e->>'profile_id')::uuid FROM jsonb_array_elements(p_players) e
    );

  INSERT INTO match_participants (match_id, profile_id, team_id, lineup_role)
  SELECT p_match_id, (e->>'profile_id')::uuid, p_team_id, (e->>'lineup_role')::lineup_role
  FROM jsonb_array_elements(p_players) e
  ON CONFLICT (match_id, profile_id) DO UPDATE SET
    team_id     = EXCLUDED.team_id,
    lineup_role = EXCLUDED.lineup_role;

  -- El caller que presenta la lista jugando queda con presencia marcada y
  -- habilitado a cargar el resultado. Un DT que no se convoca a sí mismo no
  -- matchea este UPDATE (no tiene fila en match_participants) — y no lo
  -- necesita: la policy de match_results ahora lo habilita por rol.
  UPDATE match_participants SET
    did_checkin      = true,
    checkin_at       = now(),
    checkin_lat      = p_lat,
    checkin_lng      = p_lng,
    is_result_loader = true
  WHERE match_id = p_match_id AND profile_id = v_caller_id AND team_id = p_team_id;

  IF v_match.team_a_id = p_team_id THEN
    UPDATE matches SET checkin_team_a_at = now() WHERE id = p_match_id;
  ELSE
    UPDATE matches SET checkin_team_b_at = now() WHERE id = p_match_id;
  END IF;

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
$function$

;

-- Los GRANT/REVOKE no se repiten: CREATE OR REPLACE conserva los privilegios
-- existentes, y re-declararlos a ciegas sobre funciones que otras migraciones ya
-- ajustaron es la forma más fácil de abrir o cerrar un permiso sin querer.
