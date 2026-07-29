-- ============================================================
-- D13 — FECHA FUTURA Y SOLAPAMIENTO AL AGENDAR — 2026-07-28
-- ------------------------------------------------------------
-- Hallazgo (auditoria_dominio.md, D13 🔵):
--   `submitProposal` (lib/match-actions.ts) es un INSERT directo. Ni el
--   cliente ni la RLS validaban que `scheduled_at` fuera futura, ni que el
--   equipo no tuviera ya otro partido CONFIRMADO en la misma franja. Un equipo
--   podía terminar con dos partidos confirmados solapados y enterarse recién
--   con las notificaciones de 24 h.
--
-- ── Dónde va la regla, y por qué en los dos lados ───────────────────────────
-- El daño real no lo hace proponer: lo hace CONFIRMAR. Entre la propuesta y la
-- confirmación pueden pasar días, y en el medio el equipo pudo confirmar otro
-- partido para esa misma hora. Por eso la validación va en los dos puntos, con
-- una única función compartida (`match_schedule_conflict`) para que no puedan
-- divergir:
--
--   | Punto                        | Qué evita                                |
--   |------------------------------|------------------------------------------|
--   | trigger BEFORE INSERT en     | proponer algo imposible: fecha pasada o  |
--   | match_proposals              | franja ya comprometida (feedback         |
--   |                              | inmediato, sin esperar al rival)         |
--   | confirm_match_proposal       | el compromiso real. Es la guarda que     |
--   |                              | sostiene la invariante                   |
--
-- Sólo con el trigger, la invariante quedaba abierta en el hueco temporal.
-- Sólo en el confirm, el proponente descubría el problema días después y por
-- boca del rival.
--
-- ── Qué cuenta como conflicto ───────────────────────────────────────────────
-- Otro partido (distinto de éste) en estado CONFIRMADO o EN_VIVO, de cualquiera
-- de los dos equipos, cuya ventana [scheduled_at, +duración) se superpone con
-- la propuesta. PENDIENTE no cuenta: un partido sin fecha acordada no
-- compromete a nadie.
--
-- La duración ausente se completa con `app_settings.match_default_duration_minutes`
-- (90). Sin ese default, un partido viejo con duration_minutes NULL no habría
-- solapado nunca y el chequeo se volvía opcional según la calidad del dato.
--
-- ⚠️ Se validan LOS DOS equipos, igual que E1: un partido es un compromiso de
-- dos, y que el rival esté doblemente comprometido rompe la agenda idéntico.
--
-- Sin migraciones de datos: no se tocan partidos ni propuestas existentes. Si
-- hoy hay solapamientos en la base, siguen ahí — esto impide los nuevos.
-- ============================================================


-- ─── 1. Duración por defecto (DATA, no código) ──────────────────────────────
INSERT INTO public.app_settings (key, value, description)
VALUES ('match_default_duration_minutes', 90,
        'Duración asumida de un partido sin duration_minutes, para detectar solapamientos de agenda (D13).')
ON CONFLICT (key) DO NOTHING;


-- ─── 2. Detector de conflicto de agenda, compartido ─────────────────────────
-- Devuelve el NOMBRE del equipo que ya está comprometido (para poder decírselo
-- al usuario), o NULL si la franja está libre.
CREATE OR REPLACE FUNCTION public.match_schedule_conflict(
  p_match_id         uuid,
  p_team_ids         uuid[],
  p_start            timestamptz,
  p_duration_minutes integer
)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $$
  WITH def AS (
    SELECT coalesce(
      (SELECT value::integer FROM app_settings WHERE key = 'match_default_duration_minutes'),
      90
    ) AS minutes
  )
  SELECT t.name
  FROM matches m
  CROSS JOIN def
  JOIN teams t
    ON t.id = CASE WHEN m.team_a_id = ANY(p_team_ids) THEN m.team_a_id ELSE m.team_b_id END
  WHERE m.id <> p_match_id
    AND m.status IN ('CONFIRMADO', 'EN_VIVO')
    AND m.scheduled_at IS NOT NULL
    AND (m.team_a_id = ANY(p_team_ids) OR m.team_b_id = ANY(p_team_ids))
    -- Solapamiento clásico: A empieza antes de que B termine, y viceversa.
    AND m.scheduled_at < p_start + make_interval(mins => coalesce(p_duration_minutes, def.minutes))
    AND p_start < m.scheduled_at + make_interval(mins => coalesce(m.duration_minutes, def.minutes))
  LIMIT 1;
$$;

COMMENT ON FUNCTION public.match_schedule_conflict(uuid, uuid[], timestamptz, integer) IS
  'Nombre del equipo que ya tiene un partido CONFIRMADO/EN_VIVO solapado con la ventana dada, o NULL. Fuente única de la regla de solapamiento (D13): la usan el trigger de match_proposals y confirm_match_proposal.';

REVOKE EXECUTE ON FUNCTION public.match_schedule_conflict(uuid, uuid[], timestamptz, integer) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.match_schedule_conflict(uuid, uuid[], timestamptz, integer) TO authenticated;


-- ─── 3. Trigger de validación de la propuesta ───────────────────────────────
CREATE OR REPLACE FUNCTION public.validate_match_proposal_schedule()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_match     matches%rowtype;
  v_conflict  text;
BEGIN
  IF NEW.scheduled_at IS NULL THEN
    RAISE EXCEPTION 'PROPOSAL_DATE_REQUIRED: la propuesta necesita fecha y hora';
  END IF;

  IF NEW.scheduled_at <= now() THEN
    RAISE EXCEPTION 'PROPOSAL_DATE_IN_PAST: la fecha propuesta (%) ya pasó', NEW.scheduled_at;
  END IF;

  SELECT * INTO v_match FROM matches WHERE id = NEW.match_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'MATCH_NOT_FOUND: partido % inexistente', NEW.match_id;
  END IF;

  v_conflict := public.match_schedule_conflict(
    NEW.match_id,
    ARRAY[v_match.team_a_id, v_match.team_b_id],
    NEW.scheduled_at,
    NEW.duration_minutes
  );

  IF v_conflict IS NOT NULL THEN
    RAISE EXCEPTION 'TEAM_SCHEDULE_CONFLICT: % ya tiene un partido confirmado en ese horario', v_conflict;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS match_proposals_validate_schedule ON public.match_proposals;
CREATE TRIGGER match_proposals_validate_schedule
  BEFORE INSERT ON public.match_proposals
  FOR EACH ROW EXECUTE FUNCTION public.validate_match_proposal_schedule();


-- ─── 4. confirm_match_proposal — se agrega la guarda de agenda ──────────────
-- Cuerpo completo de 20260728171000 (E1 + D7 + D8) con UN bloque nuevo, entre
-- la validación de cupos y el UPDATE. Va último a propósito: es la única guarda
-- cuyo resultado puede haber cambiado desde que se creó la propuesta, así que
-- se evalúa lo más cerca posible del commit.
CREATE OR REPLACE FUNCTION public.confirm_match_proposal(p_proposal_id uuid, p_match_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_proposal    match_proposals%rowtype;
  v_match       matches%rowtype;
  v_rules       format_rules%rowtype;
  v_count_a     integer;
  v_count_b     integer;
  v_name_a      text;
  v_name_b      text;
  v_conflict    text;
BEGIN
  -- FOR UPDATE: bloquea la fila durante la transacción para serializar
  -- llamadas concurrentes sobre la misma propuesta.
  SELECT * INTO v_proposal
    FROM match_proposals
    WHERE id = p_proposal_id
    FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Propuesta no encontrada: %', p_proposal_id;
  END IF;

  IF v_proposal.status <> 'PENDIENTE' THEN
    RAISE EXCEPTION 'La propuesta ya no está pendiente (estado: %)', v_proposal.status;
  END IF;

  -- D7: la propuesta tiene que ser DE ESTE partido. `p_match_id` viene del
  -- cliente y gobierna tanto la autorización como el UPDATE de abajo.
  IF v_proposal.match_id <> p_match_id THEN
    RAISE EXCEPTION 'PROPOSAL_MATCH_MISMATCH: la propuesta no pertenece a este partido';
  END IF;

  SELECT * INTO v_match FROM matches WHERE id = p_match_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'MATCH_NOT_FOUND: partido % inexistente', p_match_id;
  END IF;

  -- D8: sólo se confirma lo que todavía está por jugarse. Sin esto, una
  -- propuesta que quedó PENDIENTE revivía un partido CANCELADO.
  IF v_match.status <> 'PENDIENTE' THEN
    RAISE EXCEPTION 'INVALID_MATCH_STATUS: el partido ya no está pendiente (estado: %)', v_match.status;
  END IF;

  -- Autorización: solo el equipo que NO propuso puede confirmar.
  -- ⚠️ El literal 'No autorizado' lo verifica 100-rls-security.spec.sql (P1-3).
  IF NOT EXISTS (
    SELECT 1 FROM team_members tm
    JOIN profiles p ON p.id = tm.profile_id
    WHERE tm.team_id IN (
      SELECT team_a_id FROM matches WHERE id = p_match_id
      UNION
      SELECT team_b_id FROM matches WHERE id = p_match_id
    )
    AND tm.team_id <> v_proposal.from_team_id
    AND p.auth_user_id = auth.uid()
    AND tm.role IN ('CAPITAN', 'SUBCAPITAN')
  ) THEN
    RAISE EXCEPTION 'No autorizado: solo el equipo receptor puede confirmar esta propuesta';
  END IF;

  -- ── E1: cupo mínimo del formato acordado, para los DOS planteles ──────────
  SELECT * INTO v_rules FROM format_rules WHERE format = v_proposal.format;

  -- Sin reglas cargadas no se inventa un mínimo: se deja pasar, igual que hace
  -- apply_match_outcome cuando le falta un dato. El catálogo lo administra el
  -- equipo de torneAR, no el usuario, y bloquear acá por un hueco del catálogo
  -- sería castigar al capitán por algo que no puede resolver.
  IF FOUND THEN
    SELECT count(*) INTO v_count_a FROM team_members WHERE team_id = v_match.team_a_id;
    SELECT count(*) INTO v_count_b FROM team_members WHERE team_id = v_match.team_b_id;

    SELECT name INTO v_name_a FROM teams WHERE id = v_match.team_a_id;
    SELECT name INTO v_name_b FROM teams WHERE id = v_match.team_b_id;

    IF v_count_a < v_rules.min_players_to_start THEN
      RAISE EXCEPTION
        'SQUAD_TOO_SMALL: % tiene % jugador(es) y % necesita al menos % para presentarse',
        v_name_a, v_count_a, v_proposal.format, v_rules.min_players_to_start;
    END IF;

    IF v_count_b < v_rules.min_players_to_start THEN
      RAISE EXCEPTION
        'SQUAD_TOO_SMALL: % tiene % jugador(es) y % necesita al menos % para presentarse',
        v_name_b, v_count_b, v_proposal.format, v_rules.min_players_to_start;
    END IF;
  END IF;

  -- ── D13: la fecha sigue siendo futura y la franja sigue libre ─────────────
  -- Entre el INSERT de la propuesta y este confirm pueden haber pasado días.
  -- La propuesta pudo nacer válida y estar vencida ahora, o el equipo pudo
  -- confirmar otro partido para esa misma hora en el medio.
  IF v_proposal.scheduled_at <= now() THEN
    RAISE EXCEPTION 'PROPOSAL_DATE_IN_PAST: la fecha de esta propuesta (%) ya pasó', v_proposal.scheduled_at;
  END IF;

  v_conflict := public.match_schedule_conflict(
    p_match_id,
    ARRAY[v_match.team_a_id, v_match.team_b_id],
    v_proposal.scheduled_at,
    v_proposal.duration_minutes
  );

  IF v_conflict IS NOT NULL THEN
    RAISE EXCEPTION 'TEAM_SCHEDULE_CONFLICT: % ya tiene un partido confirmado en ese horario', v_conflict;
  END IF;

  UPDATE match_proposals SET status = 'ACEPTADA' WHERE id = p_proposal_id;

  UPDATE matches SET
    status           = 'CONFIRMADO',
    scheduled_at     = v_proposal.scheduled_at,
    format           = v_proposal.format,
    duration_minutes = v_proposal.duration_minutes,
    location         = v_proposal.location,
    venue_id         = v_proposal.venue_id,
    signal_amount    = v_proposal.signal_amount,
    total_cost       = v_proposal.total_cost
  WHERE id = p_match_id;
END;
$$;

COMMENT ON FUNCTION public.confirm_match_proposal(uuid, uuid) IS
  'Confirma una propuesta y fija los detalles del partido. Exige: propuesta PENDIENTE y perteneciente a p_match_id (D7), partido PENDIENTE (D8), caller CAPITAN/SUBCAPITAN del equipo receptor, que AMBOS planteles lleguen a format_rules.min_players_to_start (E1) y que la fecha siga siendo futura y sin solapamiento con otro partido confirmado de cualquiera de los dos equipos (D13).';

GRANT EXECUTE ON FUNCTION public.confirm_match_proposal(uuid, uuid) TO authenticated;
