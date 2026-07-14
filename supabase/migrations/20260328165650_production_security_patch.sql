-- ============================================================
-- PARCHE DE SEGURIDAD DE PRODUCCIÓN — v1.0
-- Fecha: 2026-03-28
-- Ref: docs/auditoria.md — Pasos 1, 2, 3 y 5 del Plan de Acción
--
-- Resuelve:
--   CRÍTICO-1  → get_my_matches y get_match_detail sin auth check
--               (cualquier usuario podía leer datos de cualquier equipo)
--   CRÍTICO-2  → resolve_match_elo sin LIMIT 1 en SELECT de goles
--               (no-determinista ante doble fila; constraint ya existe en schema)
--   CRÍTICO-3  → confirm_match_proposal y resolve_match_dispute con TOCTOU
--               (falta SELECT FOR UPDATE); send_challenge sin lock concurrente
--   CRÍTICO-4  → match_results sin policy INSERT (RLS bloqueaba todo)
--               y sin validación de estado del partido
--   AMARILLO-3 → Índices de performance faltantes
-- ============================================================


-- ═══════════════════════════════════════════════════════════════
-- FIX CRÍTICO-1a: get_my_matches — Agregar verificación de autorización
--
-- Antes: LANGUAGE sql, sin chequeo de membresía → cualquier usuario
--        autenticado podía pasar cualquier team_id y leer todos sus
--        partidos, incluyendo unique_code, venue, costos y rivales.
-- Ahora: LANGUAGE plpgsql, verifica que auth.uid() sea miembro de
--        p_team_id antes de retornar datos.
-- ═══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.get_my_matches(p_team_id uuid)
RETURNS TABLE (
  id                    uuid,
  status                match_status,
  match_type            match_type,
  scheduled_at          timestamptz,
  format                team_format,
  venue_id              uuid,
  venue_name            text,
  location              text,
  signal_amount         numeric,
  total_cost            numeric,
  unique_code           text,
  started_at            timestamptz,
  finished_at           timestamptz,
  checkin_team_a_at     timestamptz,
  checkin_team_b_at     timestamptz,
  team_a_id             uuid,
  team_a_name           text,
  team_a_shield_url     text,
  team_a_elo            integer,
  team_b_id             uuid,
  team_b_name           text,
  team_b_shield_url     text,
  team_b_elo            integer,
  result_team_a         integer,
  result_team_b         integer,
  proposal_id           uuid,
  proposal_from_team_id uuid,
  proposal_scheduled_at timestamptz,
  proposal_format       team_format,
  proposal_location     text,
  proposal_status       proposal_status,
  has_pending_cancellation boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_profile_id uuid;
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

  -- ── Retornar partidos (misma query que la versión anterior) ────────────────
  RETURN QUERY
  SELECT
    m.id,
    m.status,
    m.match_type,
    m.scheduled_at,
    m.format,
    m.venue_id,
    v.name                                       AS venue_name,
    m.location,
    m.signal_amount,
    m.total_cost,
    m.unique_code,
    m.started_at,
    m.finished_at,
    m.checkin_team_a_at,
    m.checkin_team_b_at,
    ta.id                                        AS team_a_id,
    ta.name                                      AS team_a_name,
    ta.shield_url                                AS team_a_shield_url,
    ta.elo_rating                                AS team_a_elo,
    tb.id                                        AS team_b_id,
    tb.name                                      AS team_b_name,
    tb.shield_url                                AS team_b_shield_url,
    tb.elo_rating                                AS team_b_elo,
    ra.goals_scored                              AS result_team_a,
    rb.goals_scored                              AS result_team_b,
    p.id                                         AS proposal_id,
    p.from_team_id                               AS proposal_from_team_id,
    p.scheduled_at                               AS proposal_scheduled_at,
    p.format                                     AS proposal_format,
    p.location                                   AS proposal_location,
    p.status                                     AS proposal_status,
    EXISTS(
      SELECT 1 FROM cancellation_requests cr
      WHERE cr.match_id = m.id AND cr.status = 'PENDIENTE'
    )                                            AS has_pending_cancellation
  FROM matches m
  JOIN teams ta ON ta.id = m.team_a_id
  JOIN teams tb ON tb.id = m.team_b_id
  LEFT JOIN venues v ON v.id = m.venue_id
  LEFT JOIN match_results ra ON ra.match_id = m.id AND ra.team_id = m.team_a_id
  LEFT JOIN match_results rb ON rb.match_id = m.id AND rb.team_id = m.team_b_id
  LEFT JOIN LATERAL (
    SELECT * FROM match_proposals
    WHERE match_id = m.id AND status = 'PENDIENTE'
    ORDER BY created_at DESC
    LIMIT 1
  ) p ON true
  WHERE m.team_a_id = p_team_id OR m.team_b_id = p_team_id
  ORDER BY
    CASE WHEN m.status = 'EN_VIVO'                        THEN 0
         WHEN m.status IN ('CONFIRMADO', 'PENDIENTE')     THEN 1
         ELSE 2
    END,
    m.scheduled_at DESC NULLS LAST;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_my_matches(uuid) TO authenticated;


-- ═══════════════════════════════════════════════════════════════
-- FIX CRÍTICO-1b: get_match_detail — Agregar verificación de autorización
--
-- Antes: LANGUAGE sql STABLE, sin verificar que auth.uid() sea miembro
--        de p_team_id → exponía unique_code, coords del venue, lista
--        completa de participantes y resultados a cualquier usuario.
-- Ahora: LANGUAGE plpgsql, verifica membresía antes de retornar.
--        (La cláusula WHERE ya filtraba por partido correcto, pero no
--        verificaba que el caller pertenezca al equipo pasado como arg.)
-- ═══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.get_match_detail(p_match_id uuid, p_team_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_profile_id uuid;
  v_result     json;
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

  -- ── Construir respuesta JSON (misma estructura que la versión anterior) ─────
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

GRANT EXECUTE ON FUNCTION public.get_match_detail(uuid, uuid) TO authenticated;


-- ═══════════════════════════════════════════════════════════════
-- FIX CRÍTICO-2: resolve_match_elo — LIMIT 1 defensivo en SELECT de goles
--
-- La tabla match_results ya tiene UNIQUE(match_id, team_id) desde schema.sql,
-- así que solo puede haber 1 fila por equipo. Agregamos LIMIT 1 como
-- medida defensiva ante cualquier inconsistencia futura y para que el
-- comportamiento sea siempre determinista aunque el constraint faltara.
--
-- Nota: NO se agrega ALTER TABLE ... ADD CONSTRAINT UNIQUE porque el
-- constraint ya existe (creado en schema.sql como constraint inline sin nombre,
-- lo que genera "match_results_match_id_team_id_key"). Intentar agregar
-- otro UNIQUE sobre las mismas columnas lanzaría error de duplicado.
-- ═══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.resolve_match_elo()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_elo_a    integer;
  v_elo_b    integer;
  v_played_a integer;
  v_played_b integer;
  v_goals_a  integer := 0;
  v_goals_b  integer := 0;
  v_s_a      numeric;
  v_s_b      numeric;
  v_e_a      numeric;
  v_e_b      numeric;
  v_diff_a   integer;
  v_diff_b   integer;
  v_k        CONSTANT numeric := 40;
BEGIN
  -- ── Guardia 1: solo partidos de RANKING ─────────────────────────────────────
  IF NEW.match_type <> 'RANKING' THEN
    RETURN NEW;
  END IF;

  -- ── Guardia 2: solo transición a estado terminal, una sola vez ───────────────
  IF NEW.status NOT IN ('FINALIZADO', 'WO_A', 'WO_B') THEN
    RETURN NEW;
  END IF;
  IF OLD.status IN ('FINALIZADO', 'WO_A', 'WO_B') THEN
    RETURN NEW;
  END IF;

  -- ── Cargar ELO actual de ambos equipos ──────────────────────────────────────
  SELECT elo_rating, matches_played
    INTO v_elo_a, v_played_a
    FROM teams WHERE id = NEW.team_a_id;

  SELECT elo_rating, matches_played
    INTO v_elo_b, v_played_b
    FROM teams WHERE id = NEW.team_b_id;

  v_elo_a := COALESCE(v_elo_a, 1000);
  v_elo_b := COALESCE(v_elo_b, 1000);

  -- ── Determinar resultado ─────────────────────────────────────────────────────
  IF NEW.status = 'WO_A' THEN
    v_s_a := 1.0; v_s_b := 0.0;

  ELSIF NEW.status = 'WO_B' THEN
    v_s_a := 0.0; v_s_b := 1.0;

  ELSE
    -- LIMIT 1: defensivo. El UNIQUE(match_id, team_id) garantiza 1 fila,
    -- pero si por alguna razón hubiera inconsistencia, LIMIT 1 evita que
    -- el SELECT INTO falle silenciosamente con datos no-deterministas.
    SELECT goals_scored INTO v_goals_a
      FROM match_results
      WHERE match_id = NEW.id AND team_id = NEW.team_a_id
      LIMIT 1;

    SELECT goals_scored INTO v_goals_b
      FROM match_results
      WHERE match_id = NEW.id AND team_id = NEW.team_b_id
      LIMIT 1;

    IF v_goals_a IS NULL OR v_goals_b IS NULL THEN
      RETURN NEW;
    END IF;

    IF v_goals_a > v_goals_b THEN
      v_s_a := 1.0; v_s_b := 0.0;
    ELSIF v_goals_b > v_goals_a THEN
      v_s_a := 0.0; v_s_b := 1.0;
    ELSE
      v_s_a := 0.5; v_s_b := 0.5;
    END IF;
  END IF;

  -- ── Fórmula ELO ──────────────────────────────────────────────────────────────
  v_e_a := 1.0 / (1.0 + power(10.0, (v_elo_b - v_elo_a)::numeric / 400.0));
  v_e_b := 1.0 - v_e_a;

  v_diff_a := ROUND(LEAST(v_k, GREATEST(-v_k, v_k * (v_s_a - v_e_a))))::integer;
  v_diff_b := ROUND(LEAST(v_k, GREATEST(-v_k, v_k * (v_s_b - v_e_b))))::integer;

  -- ── Actualizar equipo A ───────────────────────────────────────────────────────
  UPDATE teams SET
    elo_rating           = elo_rating + v_diff_a,
    matches_played       = matches_played + 1,
    in_ranking           = (matches_played + 1) >= 5,
    season_wins          = season_wins   + CASE WHEN v_s_a = 1.0 THEN 1 ELSE 0 END,
    season_draws         = season_draws  + CASE WHEN v_s_a = 0.5 THEN 1 ELSE 0 END,
    season_losses        = season_losses + CASE WHEN v_s_a = 0.0 THEN 1 ELSE 0 END,
    season_goals_for     = season_goals_for     + v_goals_a,
    season_goals_against = season_goals_against + v_goals_b
  WHERE id = NEW.team_a_id;

  -- ── Actualizar equipo B ───────────────────────────────────────────────────────
  UPDATE teams SET
    elo_rating           = elo_rating + v_diff_b,
    matches_played       = matches_played + 1,
    in_ranking           = (matches_played + 1) >= 5,
    season_wins          = season_wins   + CASE WHEN v_s_b = 1.0 THEN 1 ELSE 0 END,
    season_draws         = season_draws  + CASE WHEN v_s_b = 0.5 THEN 1 ELSE 0 END,
    season_losses        = season_losses + CASE WHEN v_s_b = 0.0 THEN 1 ELSE 0 END,
    season_goals_for     = season_goals_for     + v_goals_b,
    season_goals_against = season_goals_against + v_goals_a
  WHERE id = NEW.team_b_id;

  RETURN NEW;
END;
$$;

-- El trigger ya existe; recrearlo para que use la función actualizada.
DROP TRIGGER IF EXISTS resolve_match ON public.matches;
CREATE TRIGGER resolve_match
  AFTER UPDATE ON public.matches
  FOR EACH ROW
  EXECUTE FUNCTION public.resolve_match_elo();


-- ═══════════════════════════════════════════════════════════════
-- FIX CRÍTICO-4: match_results — Policy INSERT con validación de estado
--
-- Antes: No existía ninguna policy INSERT. Con RLS habilitado, el INSERT
--        directo desde el cliente fallaba (o trabajaba solo via service_role).
--        El comentario en match-actions.ts asumía una policy que no estaba
--        definida en migraciones ni en schema.sql.
--
-- Ahora: Se crea la policy INSERT con dos validaciones:
--   1. El partido debe estar en estado EN_VIVO, FINALIZADO o EN_DISPUTA.
--      Evita que un capitán pre-inserte resultados mientras el partido
--      aún está PENDIENTE o CONFIRMADO.
--   2. Solo CAPITAN/SUBCAPITAN del equipo que reporta, o el jugador
--      designado como result_loader, pueden insertar.
-- ═══════════════════════════════════════════════════════════════

-- Eliminar toda policy INSERT existente en match_results de forma segura
-- (puede haber sido creada via dashboard con nombre desconocido)
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'match_results'
      AND cmd        = 'INSERT'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.match_results', r.policyname);
  END LOOP;
END;
$$;

CREATE POLICY "match_results_insert_by_authorized_member"
  ON public.match_results FOR INSERT
  WITH CHECK (
    -- Requisito 1: el partido debe estar en estado operativo (no pre-partido)
    EXISTS (
      SELECT 1 FROM matches m
      WHERE m.id = match_results.match_id
        AND m.status IN ('EN_VIVO', 'FINALIZADO', 'EN_DISPUTA')
    )
    AND
    -- Requisito 2: el caller debe estar autorizado para el equipo reportante
    (
      -- Opción A: CAPITAN o SUBCAPITAN del equipo
      EXISTS (
        SELECT 1 FROM team_members tm
        JOIN profiles p ON p.id = tm.profile_id
        WHERE tm.team_id = match_results.team_id
          AND p.auth_user_id = auth.uid()
          AND tm.role IN ('CAPITAN', 'SUBCAPITAN')
      )
      OR
      -- Opción B: jugador designado como result_loader (hizo check-in)
      EXISTS (
        SELECT 1 FROM match_participants mp
        JOIN profiles p ON p.id = mp.profile_id
        WHERE mp.match_id = match_results.match_id
          AND mp.team_id  = match_results.team_id
          AND mp.is_result_loader = true
          AND p.auth_user_id = auth.uid()
      )
    )
  );


-- ═══════════════════════════════════════════════════════════════
-- FIX CRÍTICO-3a: confirm_match_proposal — SELECT FOR UPDATE (TOCTOU)
--
-- Antes: SELECT sin lock → dos transacciones concurrentes podían pasar
--        el chequeo status = 'PENDIENTE' simultáneamente y ambas
--        actualizar la propuesta, generando estado inconsistente.
-- Ahora: SELECT ... FOR UPDATE serializa el acceso a la fila de la
--        propuesta. La segunda transacción espera a que la primera
--        commitee; cuando la adquiere, ve status = 'ACEPTADA' y falla.
-- ═══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.confirm_match_proposal(p_proposal_id uuid, p_match_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_proposal match_proposals%rowtype;
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

  -- Autorización: solo el equipo que NO propuso puede confirmar
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

GRANT EXECUTE ON FUNCTION public.confirm_match_proposal(uuid, uuid) TO authenticated;


-- ═══════════════════════════════════════════════════════════════
-- FIX CRÍTICO-3b: resolve_match_dispute — SELECT FOR UPDATE (TOCTOU)
--
-- Antes: SELECT sin lock → dos capitanes podrían llamar resolve al mismo
--        tiempo, ambos leer status = 'EN_DISPUTA' y ejecutar dos veces
--        la transición a FINALIZADO, potencialmente calculando ELO doble.
-- Ahora: FOR UPDATE en la fila del partido serializa las llamadas.
--        El trigger de ELO ya tiene guardia de idempotencia (OLD.status),
--        pero este lock es la defensa en la capa correcta.
-- ═══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.resolve_match_dispute(p_match_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_profile_id           uuid;
  v_match                matches%rowtype;
  v_votes_a              integer;
  v_votes_b              integer;
  v_fps_a                numeric;
  v_fps_b                numeric;
  v_winner_team_id       uuid;
  v_loser_team_id        uuid;
  v_winner_goals_for     integer;
  v_winner_goals_against integer;
  v_resolution_method    text;
BEGIN
  -- ── Resolver perfil del usuario ────────────────────────────────────────────
  SELECT id INTO v_profile_id
    FROM profiles WHERE auth_user_id = auth.uid();
  IF v_profile_id IS NULL THEN
    RAISE EXCEPTION 'Perfil no encontrado para el usuario actual';
  END IF;

  -- ── FOR UPDATE: bloquea la fila para serializar resoluciones concurrentes ──
  SELECT * INTO v_match FROM matches WHERE id = p_match_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Partido no encontrado: %', p_match_id;
  END IF;
  IF v_match.status <> 'EN_DISPUTA' THEN
    RAISE EXCEPTION 'El partido no está en estado EN_DISPUTA (estado actual: %)', v_match.status;
  END IF;

  -- ── Autorización: CAPITAN/SUBCAPITAN de cualquiera de los dos equipos ──────
  IF NOT EXISTS (
    SELECT 1 FROM team_members
    WHERE profile_id = v_profile_id
      AND team_id IN (v_match.team_a_id, v_match.team_b_id)
      AND role IN ('CAPITAN', 'SUBCAPITAN')
  ) THEN
    RAISE EXCEPTION 'Solo el capitán o subcapitán de uno de los equipos puede resolver la disputa';
  END IF;

  -- ── Contar votos ──────────────────────────────────────────────────────────
  SELECT COUNT(*) INTO v_votes_a
    FROM match_dispute_votes
    WHERE match_id = p_match_id AND voted_team_id = v_match.team_a_id;

  SELECT COUNT(*) INTO v_votes_b
    FROM match_dispute_votes
    WHERE match_id = p_match_id AND voted_team_id = v_match.team_b_id;

  -- ── Determinar ganador ─────────────────────────────────────────────────────
  IF v_votes_a > v_votes_b THEN
    v_winner_team_id    := v_match.team_a_id;
    v_loser_team_id     := v_match.team_b_id;
    v_resolution_method := 'votes';

  ELSIF v_votes_b > v_votes_a THEN
    v_winner_team_id    := v_match.team_b_id;
    v_loser_team_id     := v_match.team_a_id;
    v_resolution_method := 'votes';

  ELSE
    SELECT fair_play_score INTO v_fps_a FROM teams WHERE id = v_match.team_a_id;
    SELECT fair_play_score INTO v_fps_b FROM teams WHERE id = v_match.team_b_id;

    IF v_fps_a > v_fps_b THEN
      v_winner_team_id    := v_match.team_a_id;
      v_loser_team_id     := v_match.team_b_id;
      v_resolution_method := 'fair_play_score';

    ELSIF v_fps_b > v_fps_a THEN
      v_winner_team_id    := v_match.team_b_id;
      v_loser_team_id     := v_match.team_a_id;
      v_resolution_method := 'fair_play_score';

    ELSE
      RAISE EXCEPTION
        'Empate total: % votos cada equipo, FPS idéntico (%). Requiere revisión manual del administrador.',
        v_votes_a, v_fps_a;
    END IF;
  END IF;

  -- ── Leer goles del equipo ganador ──────────────────────────────────────────
  SELECT goals_scored, goals_against
    INTO v_winner_goals_for, v_winner_goals_against
    FROM match_results
    WHERE match_id = p_match_id AND team_id = v_winner_team_id
    LIMIT 1;

  IF v_winner_goals_for IS NULL THEN
    RAISE EXCEPTION 'No se encontraron resultados del equipo ganador para este partido';
  END IF;

  -- ── Corregir resultado del perdedor ────────────────────────────────────────
  UPDATE match_results
  SET
    goals_scored  = v_winner_goals_against,
    goals_against = v_winner_goals_for
  WHERE match_id = p_match_id AND team_id = v_loser_team_id;

  -- ── Transicionar a FINALIZADO (dispara ELO + FPS triggers) ─────────────────
  UPDATE matches SET status = 'FINALIZADO' WHERE id = p_match_id;

  RETURN json_build_object(
    'winnerTeamId',     v_winner_team_id,
    'loserTeamId',      v_loser_team_id,
    'votesA',           v_votes_a,
    'votesB',           v_votes_b,
    'resolutionMethod', v_resolution_method
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.resolve_match_dispute(uuid) TO authenticated;


-- ═══════════════════════════════════════════════════════════════
-- FIX CRÍTICO-3c: send_challenge — Advisory lock + índice parcial único
--
-- El TOCTOU en send_challenge es diferente al de los otros RPCs: no hay
-- una fila existente que bloquear con FOR UPDATE, sino que se chequea
-- la NO-existencia de un desafío activo. Dos transacciones concurrentes
-- pueden pasar el chequeo simultáneamente y ambas insertar.
--
-- Solución en dos capas:
--   1. pg_advisory_xact_lock: lock transaccional sobre el par de equipos,
--      serializa llamadas concurrentes al nivel de sesión de PG.
--   2. Índice UNIQUE parcial: garantía a nivel de datos. Si el lock falla
--      o se bypasea, el INSERT violará el índice y fallará con error claro.
-- ═══════════════════════════════════════════════════════════════

-- Índice parcial que hace imposible tener dos desafíos activos entre el
-- mismo par de equipos (en cualquier dirección).
CREATE UNIQUE INDEX IF NOT EXISTS uq_challenges_active_pair
  ON public.challenges(
    LEAST(from_team_id::text, to_team_id::text),
    GREATEST(from_team_id::text, to_team_id::text)
  )
  WHERE status = 'ENVIADA';

CREATE OR REPLACE FUNCTION public.send_challenge(
  p_from_team_id uuid,
  p_to_team_id   uuid,
  p_match_type   text
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_profile_id   uuid;
  v_season_id    uuid;
  v_challenge_id uuid;
  v_from_elo     integer;
  v_to_elo       integer;
  v_elo_diff_warn boolean := false;
  v_shared_count integer;
  v_recent_count integer;
  v_season_count integer;
BEGIN
  -- ── 1. Resolver perfil del usuario ────────────────────────────────────────
  SELECT id INTO v_profile_id FROM profiles WHERE auth_user_id = auth.uid();
  IF v_profile_id IS NULL THEN
    RAISE EXCEPTION 'Perfil no encontrado para el usuario actual';
  END IF;

  -- ── 2. Autorización ───────────────────────────────────────────────────────
  IF NOT EXISTS (
    SELECT 1 FROM team_members
    WHERE team_id   = p_from_team_id
      AND profile_id = v_profile_id
      AND role IN ('CAPITAN', 'SUBCAPITAN')
  ) THEN
    RAISE EXCEPTION 'No autorizado: solo el capitán o subcapitán puede enviar un desafío';
  END IF;

  -- ── 3. Advisory lock transaccional sobre el par de equipos ────────────────
  -- Serializa llamadas concurrentes con el mismo par. El lock se libera
  -- automáticamente al final de la transacción.
  -- Usamos dos int4 (namespace=42 para "challenge locks" + hash del par)
  -- para minimizar colisiones con otros locks de advisory en el sistema.
  PERFORM pg_advisory_xact_lock(
    42,
    hashtext(
      LEAST(p_from_team_id::text, p_to_team_id::text) ||
      '|' ||
      GREATEST(p_from_team_id::text, p_to_team_id::text)
    )
  );

  -- ── 4. Verificar que no haya desafío activo (ahora serializado) ───────────
  IF EXISTS (
    SELECT 1 FROM challenges
    WHERE status = 'ENVIADA'
      AND (
        (from_team_id = p_from_team_id AND to_team_id = p_to_team_id)
        OR
        (from_team_id = p_to_team_id   AND to_team_id = p_from_team_id)
      )
  ) THEN
    RAISE EXCEPTION 'Ya hay un desafío activo con este equipo. Esperá que sea respondido o cancelado primero.';
  END IF;

  -- ── 5. Validaciones específicas de RANKING ────────────────────────────────
  IF p_match_type = 'RANKING' THEN

    SELECT COUNT(*) INTO v_shared_count
    FROM team_members tm1
    JOIN team_members tm2 ON tm2.profile_id = tm1.profile_id
    WHERE tm1.team_id = p_from_team_id
      AND tm2.team_id = p_to_team_id;

    IF v_shared_count >= 2 THEN
      RAISE EXCEPTION 'Los equipos comparten % jugadores. No se permiten partidos de ranking entre ellos.', v_shared_count;
    END IF;

    SELECT COUNT(*) INTO v_recent_count
    FROM matches
    WHERE match_type = 'RANKING'
      AND status IN ('FINALIZADO', 'WO_A', 'WO_B')
      AND created_at >= now() - INTERVAL '30 days'
      AND (
        (team_a_id = p_from_team_id AND team_b_id = p_to_team_id)
        OR
        (team_a_id = p_to_team_id   AND team_b_id = p_from_team_id)
      );

    IF v_recent_count > 0 THEN
      RAISE EXCEPTION 'Deben pasar 30 días desde el último partido de ranking entre estos equipos.';
    END IF;

    SELECT id INTO v_season_id FROM seasons WHERE is_active = true LIMIT 1;

    IF v_season_id IS NOT NULL THEN
      SELECT COUNT(*) INTO v_season_count
      FROM matches
      WHERE match_type = 'RANKING'
        AND season_id   = v_season_id
        AND status IN ('PENDIENTE', 'CONFIRMADO', 'EN_VIVO', 'FINALIZADO', 'EN_DISPUTA', 'WO_A', 'WO_B')
        AND (
          (team_a_id = p_from_team_id AND team_b_id = p_to_team_id)
          OR
          (team_a_id = p_to_team_id   AND team_b_id = p_from_team_id)
        );

      IF v_season_count >= 3 THEN
        RAISE EXCEPTION 'Máximo 3 partidos de ranking por temporada entre los mismos equipos.';
      END IF;
    END IF;

    SELECT elo_rating INTO v_from_elo FROM teams WHERE id = p_from_team_id;
    SELECT elo_rating INTO v_to_elo   FROM teams WHERE id = p_to_team_id;
    v_elo_diff_warn := abs(COALESCE(v_from_elo, 1000) - COALESCE(v_to_elo, 1000)) > 400;

  END IF;

  -- ── 6. INSERT del desafío ─────────────────────────────────────────────────
  -- El índice parcial uq_challenges_active_pair actúa como segunda capa
  -- de defensa: si el advisory lock no fuera suficiente, el INSERT
  -- fallaría con una violación de constraint explícita y clara.
  INSERT INTO challenges (from_team_id, to_team_id, created_by, match_type, status)
  VALUES (
    p_from_team_id,
    p_to_team_id,
    v_profile_id,
    p_match_type::match_type,
    'ENVIADA'
  )
  RETURNING id INTO v_challenge_id;

  RETURN json_build_object(
    'challengeId',    v_challenge_id,
    'eloDiffWarning', v_elo_diff_warn
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.send_challenge(uuid, uuid, text) TO authenticated;


-- ═══════════════════════════════════════════════════════════════
-- FIX AMARILLO-3: Índices de performance faltantes
--
-- Los 4 índices del parche anterior cubrían hot paths de lectura.
-- Estos 4 cubren los hot paths de las funciones de triggers (FPS)
-- y los sub-queries más costosos en get_my_matches y submit_dispute_vote.
-- ═══════════════════════════════════════════════════════════════

-- Sub-query EXISTS en get_my_matches (has_pending_cancellation)
CREATE INDEX IF NOT EXISTS idx_cancellation_requests_match_status
  ON public.cancellation_requests(match_id, status);

-- Lookup de check-in en submit_dispute_vote
-- (ya existe idx_match_participants_match_team en (match_id, team_id);
--  este cubre el lookup por profile_id dentro del match)
CREATE INDEX IF NOT EXISTS idx_match_participants_match_profile
  ON public.match_participants(match_id, profile_id);

-- Full-recalc de FPS en recalculate_team_fps (WO queries y FINALIZADO)
CREATE INDEX IF NOT EXISTS idx_matches_status_team_a
  ON public.matches(status, team_a_id);

CREATE INDEX IF NOT EXISTS idx_matches_status_team_b
  ON public.matches(status, team_b_id);
