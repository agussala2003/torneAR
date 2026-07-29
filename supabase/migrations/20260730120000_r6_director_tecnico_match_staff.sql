-- ============================================================
-- R6 — EL DIRECTOR TÉCNICO DEJA DE SER DECORATIVO — 2026-07-30
-- ------------------------------------------------------------
-- Hallazgo (auditoria_dominio.md · R6 🟡):
--   `DIRECTOR_TECNICO` existe en el enum `team_role`, se puede asignar, tiene
--   color propio, tiene lugar en el orden de la convocatoria y viaja en
--   `MatchRosterEntry.teamRole`. **Pero no aparece en ninguna policy ni en
--   ninguna RPC.** Un DT no podía proponer, confirmar, presentar la lista,
--   cargar el resultado, cancelar ni resolver una disputa: era un `JUGADOR`
--   con una etiqueta distinta.
--
-- ── Decisión de producto tomada ─────────────────────────────────────────────
-- El DT recibe **permisos operativos del día del partido** y **ninguno de
-- gestión del club**. El corte no es de confianza, es de naturaleza del acto:
--
--   ✅ presentar la lista de buena fe   (submit_team_checkin)
--   ✅ cargar el resultado              (INSERT en match_results)
--
--   ❌ proponer / confirmar / cancelar un partido  → compromete al club frente
--      a otro club: fecha, cancha, seña. Es de la conducción.
--   ❌ responder solicitudes de cancelación, reclamar o resolver un WO,
--      resolver una disputa                        → cierran un resultado.
--   ❌ administrar miembros, ceder la capitanía, aceptar postulantes del
--      Mercado                                     → gestión de club, fuera de
--      todo lo que toca esta migración.
--
-- ── Qué se toca, exactamente ────────────────────────────────────────────────
--   1. `submit_team_checkin` — bloque 3 (autorización). Cuerpo completo
--      reproducido desde `20260728140000` (geofence), que es la última versión.
--   2. `match_results_insert_by_authorized_member` — la policy que decide quién
--      puede cargar un resultado. Reescrita desde `20260714144056`.
--
-- ── Qué NO se toca, y por qué ───────────────────────────────────────────────
-- · `match_results_update_by_loader_or_admin` **queda igual**. El DT ya puede
--   corregir lo que él mismo cargó por la rama `submitted_by = yo`; pisar el
--   resultado que cargó OTRO es una atribución distinta —sobre un marcador que
--   ya movió ELO— y sigue siendo del capitán.
-- · `checkin_team` (llegada individual) **no necesitaba cambios**: sólo exige
--   ser miembro del equipo, así que el DT siempre pudo marcar su llegada.
-- · Ninguna policy de `team_members`, `team_join_requests` ni del Mercado entra
--   en esta migración. Es deliberado y es la mitad más importante del fix.
--
-- ⚠️ El literal `NOT_TEAM_ADMIN` del error se conserva: `lib/checkin-data.ts`
-- mapea ese prefijo a su mensaje de usuario. Cambia el texto que lo acompaña
-- (ahora nombra al DT), no el código.
-- ============================================================


-- ═══════════════════════════════════════════════════════════════
-- 1. submit_team_checkin — el DT presenta la lista
-- ═══════════════════════════════════════════════════════════════
-- Cuerpo idéntico a 20260728140000_geofence_hardening.sql; cambia SÓLO el
-- bloque 3. Se reproduce entero porque CREATE OR REPLACE lo exige.
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
$$;

COMMENT ON FUNCTION public.submit_team_checkin(uuid, uuid, jsonb, numeric, numeric) IS
  'Presentación de la lista de buena fe. R6: la autoriza el cuerpo técnico (CAPITAN/SUBCAPITAN/DIRECTOR_TECNICO). Valida cupos contra format_rules y geofence contra app_settings.checkin_geofence_radius_m.';

REVOKE EXECUTE ON FUNCTION public.submit_team_checkin(uuid, uuid, jsonb, numeric, numeric) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.submit_team_checkin(uuid, uuid, jsonb, numeric, numeric) TO authenticated;


-- ═══════════════════════════════════════════════════════════════
-- 2. match_results (INSERT) — el DT carga el resultado
-- ═══════════════════════════════════════════════════════════════
-- Reescrita desde 20260714144056 (que la optimizó envolviendo auth.uid() en
-- subquery). Cambia SÓLO la lista de roles de la primera rama; la segunda
-- (is_result_loader) y la guarda de estado quedan intactas.
DROP POLICY IF EXISTS match_results_insert_by_authorized_member ON public.match_results;
CREATE POLICY match_results_insert_by_authorized_member ON public.match_results
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM matches m
      WHERE m.id = match_results.match_id
        AND m.status IN ('EN_VIVO', 'FINALIZADO', 'EN_DISPUTA')
    )
    AND (
      EXISTS (
        SELECT 1 FROM team_members tm JOIN profiles p ON p.id = tm.profile_id
        WHERE tm.team_id = match_results.team_id
          AND p.auth_user_id = (SELECT auth.uid())
          AND tm.role IN ('CAPITAN', 'SUBCAPITAN', 'DIRECTOR_TECNICO')
      )
      OR EXISTS (
        SELECT 1 FROM match_participants mp JOIN profiles p ON p.id = mp.profile_id
        WHERE mp.match_id = match_results.match_id
          AND mp.team_id = match_results.team_id
          AND mp.is_result_loader = true
          AND p.auth_user_id = (SELECT auth.uid())
      )
    )
  );

COMMENT ON POLICY match_results_insert_by_authorized_member ON public.match_results IS
  'R6: carga el resultado el cuerpo técnico del equipo (CAPITAN/SUBCAPITAN/DIRECTOR_TECNICO) o quien haya quedado marcado como is_result_loader al hacer check-in. El UPDATE de un resultado ajeno sigue siendo sólo del capitán.';
