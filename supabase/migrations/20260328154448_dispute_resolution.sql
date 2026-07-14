-- ============================================================
-- FASE 4: Flujo de Resolución de Disputas (EN_DISPUTA)
-- Fecha: 2026-03-28
-- Reporte: docs/auditoria.md — Ítem 10
-- ============================================================
--
-- Implementa el flujo completo de la Sección 6.3 del dominio:
--   1. Tabla match_dispute_votes — un voto por jugador con check-in
--   2. RPC submit_dispute_vote   — emitir voto (solo participantes con check-in)
--   3. RPC resolve_match_dispute — contar votos, desempate por FPS,
--      corregir match_results y transicionar a FINALIZADO
--      (lo que dispara automáticamente ELO + FPS triggers)
-- ============================================================

-- ─── 1. Tabla match_dispute_votes ────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.match_dispute_votes (
  id             uuid        PRIMARY KEY DEFAULT uuid_generate_v4(),
  match_id       uuid        NOT NULL REFERENCES matches(id)  ON DELETE CASCADE,
  profile_id     uuid        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  voted_team_id  uuid        NOT NULL REFERENCES teams(id)    ON DELETE CASCADE,
  created_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_dispute_vote UNIQUE (match_id, profile_id)
);

ALTER TABLE public.match_dispute_votes ENABLE ROW LEVEL SECURITY;

-- Los participantes del partido pueden ver todos los votos de ese partido
CREATE POLICY "dispute_votes_select_by_participant"
  ON public.match_dispute_votes FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM match_participants mp
      JOIN profiles p ON p.id = mp.profile_id
      WHERE mp.match_id = match_dispute_votes.match_id
        AND p.auth_user_id = auth.uid()
    )
  );

-- INSERT se gestiona únicamente vía RPC SECURITY DEFINER (no política directa)
-- No se crea política INSERT aquí para forzar el uso del RPC.

-- ─── 2. RPC submit_dispute_vote ──────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.submit_dispute_vote(
  p_match_id      uuid,
  p_voted_team_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_profile_id uuid;
  v_match      matches%rowtype;
BEGIN
  -- ── Resolver perfil del usuario ────────────────────────────────────────────
  SELECT id INTO v_profile_id
  FROM profiles WHERE auth_user_id = auth.uid();
  IF v_profile_id IS NULL THEN
    RAISE EXCEPTION 'Perfil no encontrado para el usuario actual';
  END IF;

  -- ── Verificar que el partido esté EN_DISPUTA ───────────────────────────────
  SELECT * INTO v_match FROM matches WHERE id = p_match_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Partido no encontrado: %', p_match_id;
  END IF;
  IF v_match.status <> 'EN_DISPUTA' THEN
    RAISE EXCEPTION 'El partido no está en disputa (estado actual: %)', v_match.status;
  END IF;

  -- ── Verificar que voted_team_id es uno de los dos equipos del partido ──────
  IF p_voted_team_id NOT IN (v_match.team_a_id, v_match.team_b_id) THEN
    RAISE EXCEPTION 'El equipo votado no pertenece a este partido';
  END IF;

  -- ── Verificar que el usuario hizo check-in en el partido ──────────────────
  IF NOT EXISTS (
    SELECT 1 FROM match_participants
    WHERE match_id   = p_match_id
      AND profile_id = v_profile_id
      AND did_checkin = true
  ) THEN
    RAISE EXCEPTION 'Solo los jugadores que hicieron check-in pueden votar en una disputa';
  END IF;

  -- ── Insertar voto (UNIQUE constraint previene votos duplicados) ───────────
  -- ON CONFLICT DO NOTHING: idempotente — si el jugador ya votó, no se lanza error.
  INSERT INTO match_dispute_votes (match_id, profile_id, voted_team_id)
  VALUES (p_match_id, v_profile_id, p_voted_team_id)
  ON CONFLICT ON CONSTRAINT uq_dispute_vote
  DO NOTHING;
END;
$$;

GRANT EXECUTE ON FUNCTION public.submit_dispute_vote(uuid, uuid) TO authenticated;

-- ─── 3. RPC resolve_match_dispute ────────────────────────────────────────────

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

  -- ── Cargar y validar partido ───────────────────────────────────────────────
  SELECT * INTO v_match FROM matches WHERE id = p_match_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Partido no encontrado: %', p_match_id;
  END IF;
  IF v_match.status <> 'EN_DISPUTA' THEN
    RAISE EXCEPTION 'El partido no está en estado EN_DISPUTA (estado actual: %)', v_match.status;
  END IF;

  -- ── Autorización: solo CAPITAN/SUBCAPITAN de uno de los dos equipos ────────
  IF NOT EXISTS (
    SELECT 1 FROM team_members
    WHERE profile_id = v_profile_id
      AND team_id IN (v_match.team_a_id, v_match.team_b_id)
      AND role IN ('CAPITAN', 'SUBCAPITAN')
  ) THEN
    RAISE EXCEPTION 'Solo el capitán o subcapitán de uno de los equipos puede solicitar la resolución';
  END IF;

  -- ── Contar votos por equipo ────────────────────────────────────────────────
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
    -- ── Empate en votos: desempate por Fair Play Score ─────────────────────
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
      -- Empate total: requiere revisión del administrador
      RAISE EXCEPTION
        'Empate total: % votos cada equipo, FPS idéntico (%). Requiere revisión manual del administrador.',
        v_votes_a, v_fps_a;
    END IF;
  END IF;

  -- ── Leer goles del equipo ganador ──────────────────────────────────────────
  SELECT goals_scored, goals_against
    INTO v_winner_goals_for, v_winner_goals_against
    FROM match_results
    WHERE match_id = p_match_id AND team_id = v_winner_team_id;

  IF v_winner_goals_for IS NULL THEN
    RAISE EXCEPTION 'No se encontraron resultados del equipo ganador para este partido';
  END IF;

  -- ── Corregir resultado del equipo perdedor ─────────────────────────────────
  -- El perdedor adopta la versión del ganador:
  --   goals_scored  = lo que el ganador dijo que el perdedor anotó (goals_against del ganador)
  --   goals_against = lo que el ganador dijo que ganó (goals_scored del ganador)
  UPDATE match_results
  SET
    goals_scored  = v_winner_goals_against,
    goals_against = v_winner_goals_for
  WHERE match_id = p_match_id AND team_id = v_loser_team_id;

  -- ── Transicionar a FINALIZADO (dispara resolve_match ELO + fps_on_match_resolve) ──
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
