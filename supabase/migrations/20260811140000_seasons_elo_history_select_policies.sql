-- ============================================================
-- RLS sin policies en `seasons` y `elo_history` — 2026-08-11
-- ------------------------------------------------------------
-- Detectado validando D4 (evolución del Rating) después de la transición de
-- temporada: "Clausura 2026" quedó creada y con `is_active = true` en la base,
-- pero la app seguía diciendo «No hay temporada activa» incluso tras cerrarla
-- y reabrirla del todo.
--
-- ─── Causa raíz ──────────────────────────────────────────────────────────────
-- La migración 20240101000001_prod_parity_gap replicó el `ENABLE ROW LEVEL
-- SECURITY` que producción había activado a mano sobre 5 tablas. Tres de ellas
-- (match_proposals, result_dispute_votes, wo_claims) recibieron sus policies
-- después; `seasons` y `elo_history` nunca las recibieron.
--
-- Una tabla con RLS activo y CERO policies es deny-all: `authenticated` no ve
-- ninguna fila. Y no falla — RLS filtra, no lanza error. La query devuelve 0
-- filas y el cliente lo interpreta como «no hay datos»:
--
--   · fetchActiveSeasonInfo / fetchActiveSeason → `.maybeSingle()` → null
--     → «No hay temporada activa».
--   · fetchTeamStatsViewData → elo_history → [] → «Todavía no jugó ningún
--     partido de ranking» en el gráfico de Evolución del Rating.
--
-- Nada de esto se notaba desde el panel admin porque `transition_season` es
-- SECURITY DEFINER: corre como owner y el owner no está sujeto a RLS (la tabla
-- no tiene FORCE). Escribía perfecto y el cliente no podía leer lo escrito.
--
-- ─── Por qué `using (true)` ──────────────────────────────────────────────────
-- Las dos son catálogo competitivo público, sin datos personales, y ya son
-- visibles por otras vías: el ranking expone `teams.elo_rating` con
-- `teams_select_all`, y `elo_history` es su derivada partido a partido. Mismo
-- criterio que teams/matches/venues.
--
-- Sólo SELECT. Las escrituras siguen cerradas para el cliente: `seasons` la
-- escribe `transition_season` y `elo_history` la escriben `apply_match_outcome`
-- y `resolve_match`, las tres SECURITY DEFINER.
--
-- Idempotente.
-- ============================================================

ALTER TABLE public.seasons     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.elo_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS seasons_select_all ON public.seasons;
CREATE POLICY seasons_select_all
  ON public.seasons
  FOR SELECT
  USING (true);

DROP POLICY IF EXISTS elo_history_select_all ON public.elo_history;
CREATE POLICY elo_history_select_all
  ON public.elo_history
  FOR SELECT
  USING (true);
