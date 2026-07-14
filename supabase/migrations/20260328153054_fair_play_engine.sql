-- ============================================================
-- FASE 3: Motor de Fair Play Score
-- Fecha: 2026-03-28
-- Reporte: docs/auditoria.md — Ítem 9
-- ============================================================
--
-- El Fair Play Score (FPS) es una métrica pública [0–100] que
-- refleja el comportamiento competitivo de un equipo.
--
-- Factores de penalización (full-recalc desde 100):
--   -15  por cada ausencia (WO en contra)
--    -5  por cada cancelación tardía (< 24hs)
--    -2  por cada conflicto histórico (EN_DISPUTA)
--
-- Factor de amortiguación positiva:
--    +1  por cada partido FINALIZADO limpiamente
--
-- Resultado siempre contenido en [0, 100].
--
-- Triggers que mantienen el FPS actualizado:
--   fps_on_match_resolve   — AFTER UPDATE ON matches
--   fps_on_cancellation    — AFTER INSERT ON cancellation_requests
-- ============================================================

-- ─── 1. Función de cálculo full-recalc (idempotente) ─────────────────────────

CREATE OR REPLACE FUNCTION public.recalculate_team_fps(p_team_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_clean_matches integer;
  v_late_cancels  integer;
  v_wo_absences   integer;
  v_disputes      integer;
  v_fps           numeric;
BEGIN
  -- Partidos FINALIZADO en los que participó el equipo (cualquier tipo)
  SELECT COUNT(*) INTO v_clean_matches
  FROM matches
  WHERE status = 'FINALIZADO'
    AND (team_a_id = p_team_id OR team_b_id = p_team_id);

  -- Cancelaciones tardías solicitadas por este equipo
  SELECT COUNT(*) INTO v_late_cancels
  FROM cancellation_requests
  WHERE requested_by_team_id = p_team_id
    AND is_late = true;

  -- WO en contra: partidos donde este equipo fue el ausente
  --   WO_A → equipo B no se presentó
  --   WO_B → equipo A no se presentó
  SELECT COUNT(*) INTO v_wo_absences
  FROM matches
  WHERE (status = 'WO_A' AND team_b_id = p_team_id)
     OR (status = 'WO_B' AND team_a_id = p_team_id);

  -- Conflictos históricos: partidos EN_DISPUTA donde participó el equipo
  SELECT COUNT(*) INTO v_disputes
  FROM matches
  WHERE status = 'EN_DISPUTA'
    AND (team_a_id = p_team_id OR team_b_id = p_team_id);

  -- ── Fórmula ───────────────────────────────────────────────────────────────
  v_fps := 100.0
          + (v_clean_matches * 1)
          - (v_late_cancels  * 5)
          - (v_wo_absences   * 15)
          - (v_disputes      * 2);

  -- Contener en [0, 100]
  v_fps := GREATEST(0, LEAST(100, v_fps));

  UPDATE teams SET fair_play_score = v_fps WHERE id = p_team_id;
END;
$$;

-- ─── 2. Función envoltura para triggers ──────────────────────────────────────

CREATE OR REPLACE FUNCTION public.trigger_update_fps()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  -- ── Disparado desde cancellation_requests (INSERT) ─────────────────────────
  IF TG_TABLE_NAME = 'cancellation_requests' THEN
    IF NEW.is_late THEN
      PERFORM public.recalculate_team_fps(NEW.requested_by_team_id);
    END IF;
    RETURN NEW;
  END IF;

  -- ── Disparado desde matches (UPDATE) ───────────────────────────────────────
  IF TG_TABLE_NAME = 'matches' THEN
    -- Solo cuando el status transiciona a uno de los estados que afectan el FPS
    IF NEW.status IN ('FINALIZADO', 'WO_A', 'WO_B', 'EN_DISPUTA')
       AND (OLD.status IS DISTINCT FROM NEW.status)
    THEN
      PERFORM public.recalculate_team_fps(NEW.team_a_id);
      PERFORM public.recalculate_team_fps(NEW.team_b_id);
    END IF;
    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$;

-- ─── 3. Trigger en cancellation_requests ─────────────────────────────────────

DROP TRIGGER IF EXISTS fps_on_cancellation ON public.cancellation_requests;

CREATE TRIGGER fps_on_cancellation
  AFTER INSERT ON public.cancellation_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_update_fps();

-- ─── 4. Trigger en matches ────────────────────────────────────────────────────

DROP TRIGGER IF EXISTS fps_on_match_resolve ON public.matches;

CREATE TRIGGER fps_on_match_resolve
  AFTER UPDATE ON public.matches
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_update_fps();
