-- ============================================================
-- ENDURECIMIENTO DEL GEOFENCE DE CHECK-IN — 2026-07-28
-- ------------------------------------------------------------
-- El geofence existía y funcionaba (Haversine, 150 m), pero estaba condicionado
-- a DOS cosas que lo desactivaban en silencio:
--
--   IF v_match.venue_id IS NOT NULL AND p_lat IS NOT NULL AND p_lng IS NOT NULL
--
--   (a) `venue_id IS NOT NULL` — un partido con dirección de texto libre no se
--       validaba. Con 14 de 20 zonas activas sin complejos cargados, ése era el
--       camino habitual, no el borde. El texto libre ya se eliminó del cliente
--       (ProposalModal), pero mientras la base lo acepte el agujero sigue vivo
--       para cualquier cliente viejo o llamada directa.
--
--   (b) `p_lat/p_lng IS NOT NULL` — LO DECIDÍA EL CLIENTE. Ambas RPCs tienen
--       GRANT EXECUTE ... TO authenticated, así que cualquier usuario logueado
--       podía llamarlas desde curl omitiendo las coordenadas y el geofence
--       simplemente no se evaluaba. Sin error, sin registro: check-in válido
--       desde cualquier lado del planeta. Un control de seguridad opt-in por el
--       cliente no es un control de seguridad.
--
-- Esta migración invierte la lógica: si el partido tiene cancha del catálogo,
-- las coordenadas son OBLIGATORIAS.
--
-- ── Qué NO rompe ────────────────────────────────────────────────────────────
-- El cliente ya manda coordenadas siempre que `venueId` existe
-- (app/match-checkin.tsx y app/match-detail.tsx piden permiso y hacen
-- getCurrentPositionAsync antes de llamar). Los partidos sin venue —los ya
-- creados con texto libre— siguen entrando sin geofence: no se rompe el
-- historial, sólo se cierra la puerta para los nuevos.
--
-- ── Contenido ───────────────────────────────────────────────────────────────
--   1. app_settings          — el radio deja de estar hardcodeado en 3 lugares
--   2. checkin_team          — coords obligatorias + código de error estable
--   3. submit_team_checkin   — idem
--   4. confirm_match_proposal— un partido de RANKING no se confirma sin venue
-- ============================================================


-- ═══════════════════════════════════════════════════════════════
-- 1. Radio del geofence en un solo lugar
-- ═══════════════════════════════════════════════════════════════
-- Estaba escrito a mano en checkin_team, en submit_team_checkin y en el mensaje
-- del cliente (lib/checkin-data.ts). Tres fuentes de verdad para el mismo
-- número: cambiarlo implicaba acordarse de los tres.
CREATE TABLE IF NOT EXISTS public.app_settings (
  key         text PRIMARY KEY,
  value       numeric NOT NULL,
  description text,
  updated_at  timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.app_settings IS
  'Parámetros operativos que producto puede ajustar sin desplegar. Lectura pública para usuarios autenticados; la escritura queda fuera del alcance del cliente.';

INSERT INTO public.app_settings (key, value, description)
VALUES ('checkin_geofence_radius_m', 150,
        'Distancia máxima al complejo para poder hacer check-in, en metros.')
ON CONFLICT (key) DO NOTHING;

ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS app_settings_select_authenticated ON public.app_settings;
CREATE POLICY app_settings_select_authenticated ON public.app_settings
  FOR SELECT TO authenticated USING (true);

-- Sin GRANT de INSERT/UPDATE/DELETE: se administra por dashboard o migración.
REVOKE ALL ON public.app_settings FROM anon, authenticated;
GRANT SELECT ON public.app_settings TO authenticated;


-- Helper: radio vigente, con fallback al valor histórico si la fila no está.
CREATE OR REPLACE FUNCTION public.checkin_geofence_radius_m()
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT coalesce(
    (SELECT value FROM app_settings WHERE key = 'checkin_geofence_radius_m'),
    150
  );
$$;

REVOKE EXECUTE ON FUNCTION public.checkin_geofence_radius_m() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.checkin_geofence_radius_m() TO authenticated;


-- ═══════════════════════════════════════════════════════════════
-- 2. checkin_team — check-in simple
-- ═══════════════════════════════════════════════════════════════
-- ⚠️ Base: la versión de 20260328150331 (fix_match_rpc_security), NO la de
-- 20260328022610. Aquella ya había hecho dos cosas que hay que conservar sí o
-- sí, porque CREATE OR REPLACE reemplaza el cuerpo entero:
--
--   · ÍTEM 4 — el caller tiene que ser miembro de p_team_id, y el equipo tiene
--     que jugar ese partido. Sin eso, cualquier usuario autenticado podía
--     marcarle el check-in a un equipo ajeno. Lo fija el test
--     100-rls-security.spec.sql (P1-4).
--   · ÍTEM 7 — las coordenadas ya eran obligatorias acá cuando el venue tiene
--     ubicación registrada.
--
-- Es decir: en esta RPC el agujero de "coords opcionales" ya estaba cerrado. Lo
-- que agrega esta migración es el prefijo de error estable (antes el mensaje era
-- texto libre y el cliente caía en el error genérico de Supabase) y el radio
-- configurable. El agujero real seguía abierto en submit_team_checkin, que es la
-- RPC que usa el flujo de convocatoria — ver bloque 3.
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
  v_radius_m   numeric;
BEGIN
  SELECT * INTO v_match FROM matches WHERE id = p_match_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'MATCH_NOT_FOUND: partido % inexistente', p_match_id;
  END IF;

  SELECT id INTO v_profile_id FROM profiles WHERE auth_user_id = auth.uid();
  IF v_profile_id IS NULL THEN
    RAISE EXCEPTION 'PROFILE_NOT_FOUND: perfil no encontrado para el usuario actual';
  END IF;

  -- ÍTEM 4 (heredado de 20260328150331): el caller tiene que ser miembro del
  -- equipo por el que hace check-in. El literal 'No autorizado' lo verifica
  -- 100-rls-security.spec.sql (P1-4) — no cambiar el texto sin tocar el test.
  IF NOT EXISTS (
    SELECT 1 FROM team_members
    WHERE team_id = p_team_id AND profile_id = v_profile_id
  ) THEN
    RAISE EXCEPTION 'No autorizado: no sos miembro del equipo que intentás hacer check-in';
  END IF;

  IF v_match.team_a_id <> p_team_id AND v_match.team_b_id <> p_team_id THEN
    RAISE EXCEPTION 'TEAM_NOT_IN_MATCH: el equipo no participa en este partido';
  END IF;

  -- Geofence. Las coordenadas ya eran obligatorias acá; lo que cambia es que el
  -- error ahora lleva prefijo estable y el radio sale de app_settings.
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
        -- Prefijo estable (antes el mensaje era texto libre y el cliente no
        -- podía mapearlo: caía en el error genérico de Supabase).
        RAISE EXCEPTION 'GEOFENCE_FAILED: estás a %m de la cancha, el máximo es %m',
          round(v_distance_m), round(v_radius_m);
      END IF;
    END IF;
  END IF;

  IF v_match.team_a_id = p_team_id THEN
    UPDATE matches SET checkin_team_a_at = now() WHERE id = p_match_id;
  ELSE
    UPDATE matches SET checkin_team_b_at = now() WHERE id = p_match_id;
  END IF;

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

  SELECT * INTO v_match FROM matches WHERE id = p_match_id;
  IF v_match.checkin_team_a_at IS NOT NULL
     AND v_match.checkin_team_b_at IS NOT NULL
     AND v_match.status = 'CONFIRMADO'
  THEN
    UPDATE matches SET status = 'EN_VIVO', started_at = now() WHERE id = p_match_id;
  END IF;
END;
$$;

COMMENT ON FUNCTION public.checkin_team(uuid, uuid, numeric, numeric) IS
  'Check-in simple de un equipo. Exige que el caller sea miembro del equipo y que el equipo juegue el partido. Si hay venue con coordenadas, exige ubicación (LOCATION_REQUIRED) y valida distancia contra app_settings.checkin_geofence_radius_m (GEOFENCE_FAILED).';

GRANT EXECUTE ON FUNCTION public.checkin_team(uuid, uuid, numeric, numeric) TO authenticated;


-- ═══════════════════════════════════════════════════════════════
-- 3. submit_team_checkin — bloque 7 (geofence)
-- ═══════════════════════════════════════════════════════════════
-- Se reemplaza SÓLO el bloque de geofence; el resto de la RPC
-- (20260714201000) queda idéntico y se reproduce completo porque
-- CREATE OR REPLACE requiere el cuerpo entero.
CREATE OR REPLACE FUNCTION public.submit_team_checkin(
  p_match_id uuid,
  p_team_id  uuid,
  p_players  jsonb,
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

  -- 7. Geofence — ahora la ubicación es obligatoria si hay cancha del catálogo.
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
$$;

REVOKE EXECUTE ON FUNCTION public.submit_team_checkin(uuid, uuid, jsonb, numeric, numeric) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.submit_team_checkin(uuid, uuid, jsonb, numeric, numeric) TO authenticated;


-- ═══════════════════════════════════════════════════════════════
-- 4. confirm_match_proposal — un RANKING no se confirma sin cancha
-- ═══════════════════════════════════════════════════════════════
-- Cierra la puerta (a) del encabezado. Sin esto, el endurecimiento de arriba se
-- evade simplemente proponiendo un partido sin venue: `venue_id` queda NULL, el
-- geofence no aplica y el check-in vuelve a ser incondicional.
--
-- Sólo para RANKING: los amistosos no mueven ELO y pueden jugarse en una cancha
-- no catalogada. Ahí el check-in queda sin verificación geográfica a propósito.
CREATE OR REPLACE FUNCTION public.assert_ranking_match_has_venue()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.status = 'CONFIRMADO'
     AND NEW.match_type = 'RANKING'
     AND NEW.venue_id IS NULL
  THEN
    RAISE EXCEPTION 'VENUE_REQUIRED: un partido de ranking necesita una cancha del catálogo para validar el check-in';
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.assert_ranking_match_has_venue() IS
  'Impide confirmar un partido de RANKING sin venue_id. Sin cancha catalogada no hay coordenadas contra las cuales medir el geofence del check-in.';

DROP TRIGGER IF EXISTS trg_matches_ranking_requires_venue ON public.matches;
CREATE TRIGGER trg_matches_ranking_requires_venue
  BEFORE UPDATE ON public.matches
  FOR EACH ROW
  -- Sólo en la transición a CONFIRMADO: no invalida partidos históricos ya
  -- confirmados con texto libre, que siguen su curso normal.
  WHEN (NEW.status = 'CONFIRMADO' AND OLD.status IS DISTINCT FROM 'CONFIRMADO')
  EXECUTE FUNCTION public.assert_ranking_match_has_venue();
