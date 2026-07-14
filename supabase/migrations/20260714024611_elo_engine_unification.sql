-- ============================================================
-- UNIFICACIÓN DEL MOTOR DE ELO — 2026-07-13
-- ------------------------------------------------------------
-- Audit 360° del 13-jul-2026, hallazgo ROJO #1: convivían DOS motores de
-- ELO/stats y cada partido de RANKING computaba DOBLE:
--
--   Motor A: match_result_submitted (trigger en match_results)
--            -> trg_on_result_submitted() -> resolve_match(uuid)
--            sumaba stats de temporada + ELO (calculate_elo_delta) +
--            elo_history, y seteaba matches.status = 'FINALIZADO'.
--   Motor B: resolve_match (trigger en matches, AFTER UPDATE)
--            -> resolve_match_elo()
--            al ver la transición a FINALIZADO volvía a sumar stats + ELO
--            (fórmula K=40) en la misma transacción.
--
-- Evidencia en producción: equipos con matches_played = 2 y 2 victorias tras
-- UN solo partido; ELO 1000 -> 1033 en un partido (+20 del motor B, +13 del
-- motor A); elo_history registrando sólo el movimiento del motor A.
--
-- Diseño nuevo (una sola fuente de verdad):
--
--   1. apply_match_outcome(matches, timestamptz) — NÚCLEO único del motor:
--      stats de temporada (todos los tipos de partido, como el dominio
--      original), ELO K=40 + elo_history (sólo RANKING), y manejo de
--      FINALIZADO / WO_A / WO_B (WO = 3-0). Lo comparten el trigger y el
--      script de reparación: el replay es por construcción idéntico al vivo.
--
--   2. resolve_match(uuid) — queda SOLO como validador: chequea que ambos
--      resultados existan y crucen (si no, EN_DISPUTA) y setea
--      status = 'FINALIZADO'. CERO lógica de stats/ELO/history.
--
--   3. resolve_match_elo() (trigger en matches) — guardas de transición
--      (una sola vez, sólo hacia estado terminal) + delega en el núcleo.
--
--   4. Reparación de datos: reset total de stats/ELO + DELETE de elo_history
--      + replay cronológico de todos los partidos terminales con el motor
--      nuevo. Nota deliberada: el reset de temporada del 1-jul (season_reset)
--      NO se reproduce — el replay establece una línea base limpia; los datos
--      previos estaban inflados 2x y eran irrecuperables como estaban.
--
-- calculate_elo_delta() queda sin uso por el motor (la conserva el schema por
-- compatibilidad); el ELO oficial es la fórmula estándar con K = 40.
-- ============================================================

-- ─── 1. Núcleo único del motor de stats/ELO ─────────────────────────────────
CREATE OR REPLACE FUNCTION public.apply_match_outcome(
  p_match public.matches,
  p_at    timestamptz DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_goals_a integer;
  v_goals_b integer;
  v_s_a     numeric;  -- outcome equipo A: 1 / 0.5 / 0
  v_s_b     numeric;
  v_elo_a   integer;
  v_elo_b   integer;
  v_e_a     numeric;  -- probabilidad esperada equipo A
  v_diff_a  integer;
  v_diff_b  integer;
  v_k       CONSTANT numeric := 40;
BEGIN
  -- ── Resultado según el estado terminal ─────────────────────────────────────
  IF p_match.status = 'WO_A' THEN
    v_s_a := 1.0; v_s_b := 0.0;
    v_goals_a := 3; v_goals_b := 0;          -- WO: 3-0 a favor de A
  ELSIF p_match.status = 'WO_B' THEN
    v_s_a := 0.0; v_s_b := 1.0;
    v_goals_a := 0; v_goals_b := 3;          -- WO: 3-0 a favor de B
  ELSIF p_match.status = 'FINALIZADO' THEN
    SELECT goals_scored INTO v_goals_a
      FROM match_results WHERE match_id = p_match.id AND team_id = p_match.team_a_id;
    SELECT goals_scored INTO v_goals_b
      FROM match_results WHERE match_id = p_match.id AND team_id = p_match.team_b_id;
    -- Sin ambos resultados no hay nada que aplicar (resolve_match garantiza
    -- que esto no pase en el flujo vivo; la guarda protege el replay).
    IF v_goals_a IS NULL OR v_goals_b IS NULL THEN
      RETURN;
    END IF;
    IF v_goals_a > v_goals_b THEN
      v_s_a := 1.0; v_s_b := 0.0;
    ELSIF v_goals_b > v_goals_a THEN
      v_s_a := 0.0; v_s_b := 1.0;
    ELSE
      v_s_a := 0.5; v_s_b := 0.5;
    END IF;
  ELSE
    RETURN;  -- estado no terminal: nada que aplicar
  END IF;

  -- ── 1) Stats de temporada — TODOS los tipos de partido ─────────────────────
  -- (regla de dominio original: los amistosos también cuentan partidos y
  --  goles; lo único exclusivo de RANKING es el ELO)
  UPDATE teams SET
    matches_played       = matches_played + 1,
    season_wins          = season_wins   + CASE WHEN v_s_a = 1.0 THEN 1 ELSE 0 END,
    season_draws         = season_draws  + CASE WHEN v_s_a = 0.5 THEN 1 ELSE 0 END,
    season_losses        = season_losses + CASE WHEN v_s_a = 0.0 THEN 1 ELSE 0 END,
    season_goals_for     = season_goals_for     + v_goals_a,
    season_goals_against = season_goals_against + v_goals_b
  WHERE id = p_match.team_a_id;

  UPDATE teams SET
    matches_played       = matches_played + 1,
    season_wins          = season_wins   + CASE WHEN v_s_b = 1.0 THEN 1 ELSE 0 END,
    season_draws         = season_draws  + CASE WHEN v_s_b = 0.5 THEN 1 ELSE 0 END,
    season_losses        = season_losses + CASE WHEN v_s_b = 0.0 THEN 1 ELSE 0 END,
    season_goals_for     = season_goals_for     + v_goals_b,
    season_goals_against = season_goals_against + v_goals_a
  WHERE id = p_match.team_b_id;

  -- ── 2) ELO + historial — sólo partidos de RANKING ──────────────────────────
  IF p_match.match_type = 'RANKING' THEN
    SELECT elo_rating INTO v_elo_a FROM teams WHERE id = p_match.team_a_id;
    SELECT elo_rating INTO v_elo_b FROM teams WHERE id = p_match.team_b_id;
    v_elo_a := COALESCE(v_elo_a, 1000);
    v_elo_b := COALESCE(v_elo_b, 1000);

    -- E_A = 1 / (1 + 10 ^ ((Elo_B − Elo_A) / 400)); Diff = K × (S − E), cap ±K
    v_e_a    := 1.0 / (1.0 + power(10.0, (v_elo_b - v_elo_a)::numeric / 400.0));
    v_diff_a := ROUND(LEAST(v_k, GREATEST(-v_k, v_k * (v_s_a - v_e_a))))::integer;
    v_diff_b := ROUND(LEAST(v_k, GREATEST(-v_k, v_k * (v_s_b - (1.0 - v_e_a)))))::integer;

    INSERT INTO elo_history (team_id, season_id, match_id, elo_before, elo_after, delta, created_at)
    VALUES
      (p_match.team_a_id, p_match.season_id, p_match.id, v_elo_a, v_elo_a + v_diff_a, v_diff_a, COALESCE(p_at, now())),
      (p_match.team_b_id, p_match.season_id, p_match.id, v_elo_b, v_elo_b + v_diff_b, v_diff_b, COALESCE(p_at, now()));

    UPDATE teams SET elo_rating = elo_rating + v_diff_a WHERE id = p_match.team_a_id;
    UPDATE teams SET elo_rating = elo_rating + v_diff_b WHERE id = p_match.team_b_id;
  END IF;
END;
$$;

-- Función interna: jamás ejecutable vía REST.
REVOKE EXECUTE ON FUNCTION public.apply_match_outcome(public.matches, timestamptz) FROM PUBLIC, anon, authenticated;

-- ─── 2. resolve_match: SOLO validación + transición de estado ───────────────
-- (el trigger match_result_submitted en match_results la sigue invocando)
CREATE OR REPLACE FUNCTION public.resolve_match(p_match_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
declare
  v_match    matches%rowtype;
  v_result_a match_results%rowtype;
  v_result_b match_results%rowtype;
begin
  -- FOR UPDATE: dos cargas de resultado simultáneas se serializan acá.
  select * into v_match from matches where id = p_match_id for update;

  -- Guarda: partido inexistente.
  if v_match.id is null then
    return;
  end if;

  -- Guarda anti-reentrada: nunca reprocesar un partido en estado terminal.
  if v_match.status in ('FINALIZADO', 'WO_A', 'WO_B', 'CANCELADO') then
    return;
  end if;

  select * into v_result_a from match_results
    where match_id = p_match_id and team_id = v_match.team_a_id;
  select * into v_result_b from match_results
    where match_id = p_match_id and team_id = v_match.team_b_id;

  -- Falta un resultado: seguimos esperando.
  if v_result_a is null or v_result_b is null then
    return;
  end if;

  -- Los resultados no cruzan: a disputa.
  if v_result_a.goals_scored <> v_result_b.goals_against
     or v_result_b.goals_scored <> v_result_a.goals_against then
    update matches set status = 'EN_DISPUTA' where id = p_match_id;
    return;
  end if;

  -- Transición de estado. El trigger resolve_match (en matches) aplica
  -- stats + ELO + elo_history vía apply_match_outcome — ÚNICO motor.
  update matches
    set status = 'FINALIZADO', finished_at = now()
    where id = p_match_id;
end;
$$;

-- Re-asertar el cierre de superficie (C1): sólo el trigger interno la invoca.
REVOKE EXECUTE ON FUNCTION public.resolve_match(uuid) FROM PUBLIC, anon, authenticated;

-- ─── 3. resolve_match_elo: guardas de transición + delegación al núcleo ─────
CREATE OR REPLACE FUNCTION public.resolve_match_elo()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  -- Sólo transición HACIA estado terminal, y una sola vez.
  IF NEW.status NOT IN ('FINALIZADO', 'WO_A', 'WO_B') THEN
    RETURN NEW;
  END IF;
  IF OLD.status IN ('FINALIZADO', 'WO_A', 'WO_B') THEN
    RETURN NEW;  -- idempotencia
  END IF;

  PERFORM public.apply_match_outcome(NEW);
  RETURN NEW;
END;
$$;

-- ─── 4. Reparación de datos: reset + replay cronológico ─────────────────────
DO $$
DECLARE
  v_match      matches%rowtype;
  v_replayed   integer := 0;
BEGIN
  -- 4.1 Reset total de stats/ELO (la línea base es el replay, no el seed).
  UPDATE teams SET
    elo_rating           = 1000,
    matches_played       = 0,
    season_wins          = 0,
    season_draws         = 0,
    season_losses        = 0,
    season_goals_for     = 0,
    season_goals_against = 0;

  -- 4.2 Historial de ELO: se reconstruye desde cero.
  DELETE FROM elo_history;

  -- 4.3 Replay cronológico de todos los partidos terminales con el motor
  --     unificado. El orden importa: el ELO de cada partido depende del
  --     rating acumulado hasta ese momento.
  FOR v_match IN
    SELECT *
      FROM matches
     WHERE status IN ('FINALIZADO', 'WO_A', 'WO_B')
     ORDER BY COALESCE(finished_at, scheduled_at, created_at), created_at, id
  LOOP
    PERFORM public.apply_match_outcome(
      v_match,
      COALESCE(v_match.finished_at, v_match.scheduled_at, v_match.created_at)
    );
    v_replayed := v_replayed + 1;
  END LOOP;

  RAISE NOTICE 'Reparación ELO: % partidos terminales re-aplicados.', v_replayed;
END;
$$;
