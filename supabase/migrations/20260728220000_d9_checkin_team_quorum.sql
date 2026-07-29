-- ============================================================
-- D9 — EL CHECK-IN INDIVIDUAL DEJA DE SELLAR AL EQUIPO — 2026-07-28
-- ------------------------------------------------------------
-- Hallazgo (auditoria_dominio.md, D9 🟡):
--   `checkin_team` sellaba `matches.checkin_team_{a,b}_at` —es decir LA
--   PRESENCIA DEL EQUIPO ENTERO— con el tap de un solo miembro, sin rol, sin
--   cupo y sin lista. Conceptualmente confundía "yo llegué" con "mi equipo se
--   presentó".
--
-- ── Por qué esto no era 🟡 en la práctica ───────────────────────────────────
-- Desde el Bloque 3, `sweep_stale_matches()` (20260728181000:154-157) decide el
-- WO AUTOMÁTICO leyendo exactamente ese sello:
--
--     elsif r.checkin_team_a_at is not null and r.checkin_team_b_at is null then
--       v_winner_team_id := r.team_a_id;   -- 3-0, ELO K=40, −15 Fair Play
--
-- O sea: un jugador solo, parado dentro del geofence, se otorgaba un 3-0
-- automático si el rival no alcanzaba a sellar — o invalidaba un WO legítimo en
-- su contra presentándose él y nadie más. La automatización del Bloque 3 quedó
-- montada sobre un input falsificable con un tap. Ésa es la deuda que se paga
-- acá, y por eso se toca la RPC y no sólo la UI.
--
-- ── Qué cambia ──────────────────────────────────────────────────────────────
-- Se separan los dos hechos que la función mezclaba:
--
--   | Hecho                        | Dónde vive ahora                        |
--   |------------------------------|-----------------------------------------|
--   | "yo llegué"                  | match_participants.did_checkin (siempre)|
--   | "mi equipo se presentó"      | matches.checkin_team_X_at (sólo con     |
--   |                              | quórum: N >= min_players_to_start)      |
--
-- El jugador sigue pudiendo marcar su llegada — no se le pide rol, que habría
-- roto el flujo del JUGADOR por completo. Lo que ya no puede es hablar en
-- nombre de los diez que no vinieron.
--
-- ── El umbral es el mismo que ya usa la convocatoria ────────────────────────
-- `format_rules.min_players_to_start`, exactamente el que valida
-- `submit_team_checkin` para presentar la lista y el que `confirm_match_proposal`
-- exige a los dos planteles al confirmar (E1). Tres reglas que hablan del mismo
-- número: si el catálogo cambia, cambian las tres juntas.
--
-- ⚠️ Los INVITADOS (is_guest, alta por unique_code) SÍ cuentan para el quórum.
-- Están físicamente en la cancha, que es lo único que el sello afirma. Es
-- deliberadamente más laxo que E1 —que no los cuenta al confirmar porque
-- todavía no existen— y compensa en parte esa rigidez: el equipo de 6 que
-- completa con invitados puede sellar su presencia aunque no pudiera haber
-- confirmado el formato.
--
-- ── Guarda de estado, de paso ───────────────────────────────────────────────
-- La función no miraba `matches.status`: se podía hacer check-in sobre un
-- partido PENDIENTE, FINALIZADO o CANCELADO. Un sello sobre un PENDIENTE queda
-- latente y pre-sella el partido en cuanto se confirma. Mismo criterio que D6
-- aplicó a `claim_wo`.
--
-- ── Orden de las guardas (importa para los tests) ───────────────────────────
-- match existe → perfil → membresía ('No autorizado', literal verificado por
-- 100-rls-security.spec.sql P1-4) → equipo en el partido → estado → geofence.
-- El literal y su posición no se tocan.
--
-- ⚠️ CAMBIA LA FIRMA: la función pasa de RETURNS void a RETURNS json, así que
-- va DROP + CREATE (CREATE OR REPLACE no puede cambiar el tipo de retorno). El
-- cliente necesita la respuesta: sin ella, el jugador que marca llegada ve
-- "listo" mientras el casillero de su equipo sigue en "Pendiente" y no hay
-- forma de explicarle por qué. `types/supabase.ts` se actualizó a mano.
-- ============================================================


-- ─── 1. Umbral de respaldo para partidos sin reglas de formato ──────────────
-- Misma mecánica que `checkin_geofence_radius_m` y los `sweep_*`: el número es
-- DATA, no código. Un partido CONFIRMADO siempre tiene formato (lo garantiza el
-- trigger de 20260714200000), así que este fallback es para partidos históricos
-- o formatos sin fila en el catálogo. Nunca 1: el punto entero del hallazgo es
-- que una persona no alcanza.
INSERT INTO public.app_settings (key, value, description)
VALUES ('checkin_min_players_fallback', 4,
        'Mínimo de check-ins individuales para sellar la presencia de un equipo cuando el partido no tiene format_rules (D9).')
ON CONFLICT (key) DO NOTHING;


-- ─── 2. Helper: cuántos hacen falta para sellar ─────────────────────────────
CREATE OR REPLACE FUNCTION public.checkin_min_players(p_format team_format)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT coalesce(
    (SELECT min_players_to_start FROM format_rules WHERE format = p_format),
    (SELECT value::integer FROM app_settings WHERE key = 'checkin_min_players_fallback'),
    4
  );
$$;

COMMENT ON FUNCTION public.checkin_min_players(team_format) IS
  'Check-ins individuales necesarios para sellar la presencia de un equipo. format_rules.min_players_to_start, con fallback en app_settings para partidos sin formato (D9).';

REVOKE EXECUTE ON FUNCTION public.checkin_min_players(team_format) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.checkin_min_players(team_format) TO authenticated;


-- ─── 3. checkin_team: presencia individual + sello por quórum ───────────────
DROP FUNCTION IF EXISTS public.checkin_team(uuid, uuid, numeric, numeric);

CREATE FUNCTION public.checkin_team(
  p_match_id uuid,
  p_team_id  uuid,
  p_lat      numeric DEFAULT NULL,
  p_lng      numeric DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
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
$$;

COMMENT ON FUNCTION public.checkin_team(uuid, uuid, numeric, numeric) IS
  'Check-in INDIVIDUAL de un jugador. Registra su presencia en match_participants y sella checkin_team_X_at sólo cuando el equipo junta format_rules.min_players_to_start check-ins (D9) — un jugador solo ya no puede afirmar que el equipo se presentó. Exige membresía (o invitado registrado), partido CONFIRMADO/EN_VIVO y, con venue geolocalizado, ubicación dentro de app_settings.checkin_geofence_radius_m.';

REVOKE EXECUTE ON FUNCTION public.checkin_team(uuid, uuid, numeric, numeric) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.checkin_team(uuid, uuid, numeric, numeric) TO authenticated;
