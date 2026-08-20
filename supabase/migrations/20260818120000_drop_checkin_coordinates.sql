-- ============================================================
-- Riesgo 01 · Baja de las coordenadas de check-in — 2026-08-18
-- ------------------------------------------------------------
-- La Política de Privacidad publicada dice, textual:
--
--   «De esa validación conservamos la distancia aproximada en metros hasta el
--    predio —no tus coordenadas— para auditar los check-ins y calibrar el radio
--    con datos reales en vez de a ojo.»
--   (components/legal/privacyContent.ts)
--
-- La base hacía lo contrario: `match_participants.checkin_lat/checkin_lng`
-- guardaba la posición con `numeric(10,7)` —siete decimales, ~1 cm— sin plazo
-- de conservación. Y no quedaba puertas adentro: la policy de lectura es
-- `match_participants_select_all … USING (true)` con `GRANT SELECT` a
-- `authenticated`, así que cualquier usuario logueado podía leer dónde estuvo
-- parado cualquier jugador en cada partido de ranking.
--
-- Esta migración alinea la base con el documento: se sigue MIDIENDO la
-- distancia (el geofence no cambia de comportamiento) pero ya no se PERSISTE la
-- coordenada.
--
-- ─── Qué NO cambia ───────────────────────────────────────────────────────────
-- · La firma de las dos RPCs. `p_lat`/`p_lng` siguen siendo parámetros: hacen
--   falta para calcular la distancia contra el predio. La app los sigue
--   enviando (lib/checkin-data.ts) y no hay que tocar el cliente.
-- · El geofence: mismo radio, misma fórmula, mismos errores
--   (`LOCATION_REQUIRED`, `GEOFENCE_FAILED` con el mismo texto).
-- · La telemetría: `log_checkin_distance` ya guardaba únicamente
--   `round(distance_m)` y `round(radius_m)` en `app_logs`, nunca la posición.
--   Es lo que la Política describe, y sigue igual.
--
-- ─── Qué sí cambia ───────────────────────────────────────────────────────────
-- · `checkin_team` y `submit_team_checkin` dejan de escribir las coordenadas.
-- · Se eliminan las dos columnas. El DROP COLUMN también borra el histórico ya
--   acumulado, que es el punto: dejar la columna vacía no repara nada.
--
-- ─── Orden de las operaciones ────────────────────────────────────────────────
-- Primero se reemplazan las funciones, después se dropean las columnas. Al
-- revés, entre statement y statement quedarían funciones cuyo cuerpo referencia
-- columnas inexistentes; plpgsql sólo lo descubriría en tiempo de ejecución, en
-- el próximo check-in real.
--
-- Los cuerpos se reproducen TAL CUAL la definición vigente
-- (20260811130000_checkin_distance_telemetry.sql, que es la última que redefinió
-- ambas: `checkin_team` pasó por D9/quórum y `submit_team_checkin` por R6/DT).
-- El único cambio son las coordenadas. Reconstruirlas desde un archivo anterior
-- las haría retroceder en silencio: CREATE OR REPLACE no avisa.
--
-- Idempotente: se puede re-aplicar sin efectos.
-- ============================================================


-- ═══════════════════════════════════════════════════════════════
-- 1. checkin_team — check-in individual
-- ═══════════════════════════════════════════════════════════════
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
  --
  -- `p_lat`/`p_lng` viven sólo dentro de este bloque: se usan para medir y se
  -- descartan al terminar la llamada. Lo único que sobrevive es la distancia
  -- redondeada que registra log_checkin_distance.
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
  --
  -- Riesgo 01: la evidencia del WO es «quién y cuándo». El «dónde» ya lo
  -- garantiza el geofence de arriba —si la fila existe, el jugador pasó la
  -- validación— así que guardar además la coordenada no agregaba prueba, sólo
  -- un dato personal de más.
  INSERT INTO match_participants
    (match_id, profile_id, team_id, is_result_loader, did_checkin, checkin_at)
  VALUES
    (p_match_id, v_profile_id, p_team_id, true, true, now())
  ON CONFLICT (match_id, profile_id)
  DO UPDATE SET
    did_checkin      = true,
    checkin_at       = now(),
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

  -- Ambos equipos presentes → EN_VIVO.
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
$function$;


-- ═══════════════════════════════════════════════════════════════
-- 2. submit_team_checkin — convocatoria (lista de buena fe)
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
  -- Igual que en checkin_team: se mide y se descarta.
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
$function$;


-- ═══════════════════════════════════════════════════════════════
-- 3. Baja de las columnas
-- ═══════════════════════════════════════════════════════════════
-- Recién acá: las dos funciones de arriba ya no las tocan.
--
-- `IF EXISTS` para que la migración sea re-aplicable. No hay más lectores:
-- el barrido sobre las 112 migraciones y sobre app/, lib/ y supabase/tests/
-- muestra que las únicas referencias eran las escrituras de estas dos RPCs.
-- Los RPC de detalle de partido (`match_detail_*`) proyectan columnas
-- explícitas y ninguna es la coordenada.
ALTER TABLE public.match_participants DROP COLUMN IF EXISTS checkin_lat;
ALTER TABLE public.match_participants DROP COLUMN IF EXISTS checkin_lng;


-- ═══════════════════════════════════════════════════════════════
-- 4. Grant de UPDATE por columna
-- ═══════════════════════════════════════════════════════════════
-- 20260714201000_squad_formats_checkin_rpc.sql había otorgado
-- `GRANT UPDATE (did_checkin, checkin_at, checkin_lat, checkin_lng)`. Postgres
-- descarta solo el privilegio de una columna dropeada, así que esto no arregla
-- nada roto: se re-declara para que el estado final quede escrito y no haya que
-- deducirlo del DROP de arriba. Es idempotente y no amplía nada.
GRANT UPDATE (did_checkin, checkin_at) ON public.match_participants TO authenticated;


COMMENT ON TABLE public.match_participants IS
  'Convocatoria y presencia por partido. La validación de ubicación del check-in es transitoria: se mide contra el predio y se descarta. Sólo persiste la distancia redondeada en app_logs (message = ''checkin.geofence''), nunca la posición del jugador.';
