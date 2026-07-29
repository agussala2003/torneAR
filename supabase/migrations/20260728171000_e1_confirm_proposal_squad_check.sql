-- ============================================================
-- E1 — CUPO MÍNIMO AL CONFIRMAR EL PARTIDO — 2026-07-28
-- ------------------------------------------------------------
-- Hallazgo (auditoria_dominio.md, E1 🟠):
--   Ni send_challenge, ni accept_challenge, ni confirm_match_proposal miraban
--   el tamaño del plantel. La validación de cupos (`format_rules`) aparecía
--   UNA sola vez, en submit_team_checkin — es decir en la cancha, dentro de la
--   ventana de 2 h previa al partido.
--
--   Secuencia real: un equipo de 3 acepta un desafío de ranking a F11, lo
--   confirma, ambos coordinan cancha y seña, y el sábado el capitán descubre
--   MIN_STARTERS_NOT_MET. No puede presentar lista, el rival reclama WO, y el
--   equipo se come −15 de Fair Play. La regla existía; se aplicaba tarde.
--
-- ── Qué agrega esta migración ───────────────────────────────────────────────
-- confirm_match_proposal es EL punto donde el partido deja de ser una
-- intención y pasa a ser un compromiso (fija fecha, cancha, seña y costo).
-- Ahí se verifica que AMBOS planteles lleguen al mínimo del formato acordado.
--
-- ⚠️ Se validan LOS DOS equipos, no sólo el que confirma. Validar únicamente
-- al confirmante dejaba viva la mitad del hallazgo: el equipo PROPONENTE es
-- justamente el que eligió el formato, y nada garantizaba que pudiera
-- fielearlo — el caso del texto del hallazgo (equipo de 3 que propone un F11)
-- habría pasado igual.
--
-- ── Alcance de la cuenta ────────────────────────────────────────────────────
-- Se cuentan las filas de `team_members`, sin discriminar rol. Es exactamente
-- el mismo universo que acepta submit_team_checkin al validar pertenencia, así
-- que las dos reglas hablan del mismo conjunto y no pueden contradecirse.
--
-- LIMITACIÓN CONOCIDA (decisión de producto pendiente): los INVITADOS
-- (match_participants.is_guest, que entran por unique_code) NO se cuentan,
-- porque al momento de confirmar todavía no existen. Un equipo de 6 que
-- habitualmente completa con 5 invitados no va a poder confirmar un F11. Si
-- eso resulta demasiado estricto para el amateur, la palanca es
-- `format_rules.min_players_to_start`, que es configurable por formato y no
-- requiere tocar esta función.
--
-- ── Guardas de integridad que se agregan de paso (hallazgo D7) ──────────────
-- La función recibía `p_match_id` del cliente y NUNCA verificaba que la
-- propuesta perteneciera a ese partido: se usaba el id recibido tanto para el
-- EXISTS de autorización como para el UPDATE. Un capitán podía tomar una
-- propuesta legible de otro partido y aplicarla a uno suyo, confirmándolo con
-- fecha/cancha/costos ajenos sin que el rival hubiera propuesto nada. Tampoco
-- verificaba el estado del partido, lo que permitía "re-confirmar" uno ya
-- CANCELADO a partir de una propuesta zombi (D8).
-- Son dos IF y estamos reescribiendo el cuerpo entero: dejarlos afuera sería
-- reintroducir a mano un agujero conocido.
--
-- ── Orden de las guardas (importa para los tests) ───────────────────────────
-- El chequeo de cupo va DESPUÉS del de autorización. supabase/tests/
-- 100-rls-security.spec.sql (P1-3) espera 'No autorizado' cuando el equipo
-- proponente intenta confirmar su propia propuesta; si el cupo se evaluara
-- antes, ese caso fallaría con SQUAD_TOO_SMALL y el test dejaría de proteger
-- lo que protege.
--
-- Se preserva el FOR UPDATE de 20260328165650 (serializa confirmaciones
-- concurrentes sobre la misma propuesta).
-- ============================================================

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
  'Confirma una propuesta y fija los detalles del partido. Exige: propuesta PENDIENTE y perteneciente a p_match_id (D7), partido PENDIENTE (D8), caller CAPITAN/SUBCAPITAN del equipo receptor, y que AMBOS planteles lleguen a format_rules.min_players_to_start del formato acordado (E1). Los invitados por unique_code no cuentan: al confirmar todavía no existen.';

GRANT EXECUTE ON FUNCTION public.confirm_match_proposal(uuid, uuid) TO authenticated;
