-- ============================================================
-- E5 — `FALTA_QUORUM` DEJA DE SER TEXTO LIBRE TIPADO — 2026-07-30
-- ------------------------------------------------------------
-- Hallazgo (auditoria_dominio.md · E5 🟡):
--   El caso "no juntamos gente" aparece como motivo de cancelación
--   (`CancellationReason`) y de reclamo de WO (`WoClaimEntry['reason']`) — el
--   dominio ya lo había identificado como el escenario central del fútbol
--   amateur. Pero no tenía **ninguna consecuencia diferenciada**: no cambiaba
--   la penalización de Fair Play, no eximía de nada, no habilitaba
--   reprogramación. Era texto libre tipado.
--
--   La pregunta que quedó abierta: *¿avisar con horas de anticipación que no
--   llegás a juntar los once debería costar lo mismo que dejar al rival
--   esperando en la cancha?*
--
-- ── Decisión de producto tomada: NO cuesta lo mismo ─────────────────────────
--
--   | Situación                                   | Multa FPS |
--   |---------------------------------------------|-----------|
--   | Cancelación tardía (< 24 h), cualquier motivo|    −5     |
--   | WO en contra con motivo `FALTA_QUORUM`       |    −5     |
--   | WO en contra, cualquier otro motivo          |   −15     |
--   | Partido `EN_DISPUTA`                         |    −2     |
--   | Partido `FINALIZADO` limpio                  |    +1     |
--
--   El eje de la escala es **avisar o no avisar**, no la gravedad del motivo:
--   un equipo que no llega a juntar gente y lo registra deja al rival con
--   tiempo de reorganizarse; uno que directamente no aparece, no.
--
-- ── Implementación ──────────────────────────────────────────────────────────
-- La multa por ausencia deja de ser una constante y pasa a depender del motivo
-- registrado, resuelto por `fair_play_absence_penalty(reason)`. Los valores
-- viven en `app_settings` (misma mecánica que los umbrales del barrido y el
-- radio del geofence): producto ajusta la escala sin desplegar.
--
-- El motivo de un WO sale de `wo_claims.reason` — la tabla tiene
-- `unique (match_id)`, así que hay a lo sumo una fila por partido y el LEFT
-- JOIN no puede multiplicar filas ni inflar la multa.
--
-- ── Tres decisiones que se apartan de la lectura literal ────────────────────
--
-- (a) **Sin reclamo, la multa es la severa.** El WO automático de
--     `sweep_stale_matches` (D4) no crea `wo_claims`: nadie declaró un motivo
--     porque el equipo directamente no apareció ni avisó. `coalesce` a la multa
--     por defecto (−15) es el resultado correcto, no un caso sin cubrir.
--
-- (b) **La cancelación tardía NO pasa por la escala por motivo.** Ya cuesta −5
--     para todos los motivos, que es exactamente lo que la decisión pide para
--     `FALTA_QUORUM`. Ruteársela por `fair_play_absence_penalty` habría
--     encarecido a −15 todas las demás cancelaciones tardías (UNILATERAL,
--     LESION, FUERZA_MAYOR...), que nadie pidió y que endurecería el sistema
--     por un efecto colateral. La constante queda igualmente en `app_settings`
--     para poder revisarla.
--
-- (c) **El motivo lo declara quien reclama, no quien falta.** Es una asimetría
--     real: el rival elige la etiqueta y podría poner `NO_PRESENTACION` sobre
--     un equipo que sí avisó. Se aceptó a sabiendas por dos razones: hoy el
--     castigo es −15 para todos, así que la escala sólo puede mejorar la
--     situación del ausente; y `resolve_wo_claim` pasa por un admin que puede
--     rechazar el reclamo. La alternativa —dejar que el ausente se autodeclare
--     `FALTA_QUORUM` con una solicitud de cancelación rechazada— habría creado
--     un atajo trivial para bajar la multa de −15 a −5 sin presentarse.
--
-- ⚠️ La función es un **full-recalc idempotente**: al aplicarse, la primera
-- corrida de cada equipo con WO por `FALTA_QUORUM` le sube el Fair Play. Es el
-- efecto buscado (la escala es retroactiva), pero conviene saberlo antes de
-- mirar el ranking al día siguiente.
-- ============================================================


-- ─── Escala configurable ────────────────────────────────────────────────────
INSERT INTO public.app_settings (key, value, description) VALUES
  ('fps_penalty_absence_default', 15,
   'Puntos de Fair Play que descuenta un WO en contra cuando el motivo registrado NO es FALTA_QUORUM (no presentarse).'),
  ('fps_penalty_absence_quorum', 5,
   'Puntos de Fair Play que descuenta un WO en contra con motivo FALTA_QUORUM: el equipo avisó que no juntaba gente.'),
  ('fps_penalty_late_cancel', 5,
   'Puntos de Fair Play que descuenta una cancelación tardía (< 24 h) ACEPTADA, cualquiera sea el motivo.')
ON CONFLICT (key) DO NOTHING;


-- ─── La escala, una sola vez ────────────────────────────────────────────────
-- STABLE (lee app_settings). `NULL` cae en la rama severa: ver decisión (a).
CREATE OR REPLACE FUNCTION public.fair_play_absence_penalty(p_reason text)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN p_reason = 'FALTA_QUORUM' THEN
      coalesce((SELECT value FROM app_settings WHERE key = 'fps_penalty_absence_quorum'), 5)
    ELSE
      coalesce((SELECT value FROM app_settings WHERE key = 'fps_penalty_absence_default'), 15)
  END;
$$;

COMMENT ON FUNCTION public.fair_play_absence_penalty(text) IS
  'E5 — Multa de Fair Play por un WO en contra según el motivo registrado en wo_claims.reason: FALTA_QUORUM descuenta menos (avisó) que NO_PRESENTACION (no apareció). NULL = sin reclamo = multa severa (WO automático del barrido).';

-- Función interna: la usa recalculate_team_fps, que ya es SECURITY DEFINER.
REVOKE EXECUTE ON FUNCTION public.fair_play_absence_penalty(text) FROM PUBLIC, anon, authenticated;


-- ─── recalculate_team_fps con la escala por motivo ──────────────────────────
-- Cuerpo de 20260708181125 (que corrigió el conteo de cancelaciones RECHAZADAS)
-- + la multa variable. Se reproduce entero porque CREATE OR REPLACE lo exige.
CREATE OR REPLACE FUNCTION public.recalculate_team_fps(p_team_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_clean_matches   integer;
  v_late_cancels    integer;
  v_wo_penalty      numeric;
  v_disputes        integer;
  v_late_cancel_fee numeric := coalesce(
    (SELECT value FROM app_settings WHERE key = 'fps_penalty_late_cancel'), 5);
  v_fps             numeric;
BEGIN
  SELECT COUNT(*) INTO v_clean_matches
  FROM matches
  WHERE status = 'FINALIZADO'
    AND (team_a_id = p_team_id OR team_b_id = p_team_id);

  -- Sólo las ACEPTADAS: una solicitud RECHAZADA no penaliza (fix de P3).
  SELECT COUNT(*) INTO v_late_cancels
  FROM cancellation_requests
  WHERE requested_by_team_id = p_team_id
    AND is_late = true
    AND status = 'ACEPTADA';

  -- E5: la ausencia deja de valer siempre lo mismo. Se SUMAN multas en vez de
  -- contar ausencias, porque cada una puede costar distinto según su motivo.
  --   WO_A → el ausente fue el equipo B
  --   WO_B → el ausente fue el equipo A
  -- `wo_claims` tiene unique(match_id): el LEFT JOIN no multiplica filas.
  SELECT coalesce(SUM(public.fair_play_absence_penalty(wc.reason)), 0)
    INTO v_wo_penalty
  FROM matches m
  LEFT JOIN wo_claims wc ON wc.match_id = m.id
  WHERE (m.status = 'WO_A' AND m.team_b_id = p_team_id)
     OR (m.status = 'WO_B' AND m.team_a_id = p_team_id);

  SELECT COUNT(*) INTO v_disputes
  FROM matches
  WHERE status = 'EN_DISPUTA'
    AND (team_a_id = p_team_id OR team_b_id = p_team_id);

  v_fps := 100.0
          + (v_clean_matches * 1)
          - (v_late_cancels  * v_late_cancel_fee)
          - v_wo_penalty
          - (v_disputes      * 2);

  v_fps := GREATEST(0, LEAST(100, v_fps));

  UPDATE teams SET fair_play_score = v_fps WHERE id = p_team_id;
END;
$function$;

COMMENT ON FUNCTION public.recalculate_team_fps(uuid) IS
  'Full-recalc idempotente del Fair Play [0-100]. E5: la multa por WO en contra depende del motivo (fair_play_absence_penalty). Escala en app_settings (fps_penalty_*).';

-- Régimen A2 (20260711012137): interna, sólo la llaman triggers SECURITY
-- DEFINER y jobs con service role.
REVOKE EXECUTE ON FUNCTION public.recalculate_team_fps(uuid) FROM PUBLIC, anon, authenticated;


-- ─── Recálculo de los equipos ya afectados ──────────────────────────────────
-- La escala es retroactiva: sin este backfill, un equipo con un WO por
-- FALTA_QUORUM seguiría arrastrando −15 hasta que otro evento suyo disparara
-- el trigger. Se limita a los equipos que tienen al menos un WO en contra con
-- ese motivo — nadie más cambia de valor.
DO $$
DECLARE
  t record;
BEGIN
  FOR t IN
    SELECT DISTINCT CASE WHEN m.status = 'WO_A' THEN m.team_b_id ELSE m.team_a_id END AS team_id
    FROM matches m
    JOIN wo_claims wc ON wc.match_id = m.id
    WHERE m.status IN ('WO_A', 'WO_B')
      AND wc.reason = 'FALTA_QUORUM'
  LOOP
    PERFORM public.recalculate_team_fps(t.team_id);
  END LOOP;
END $$;
