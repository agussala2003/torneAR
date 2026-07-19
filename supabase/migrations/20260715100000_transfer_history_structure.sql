-- ============================================================
-- HISTORIAL DE TRANSFERENCIAS (1/4) — Estructura — 2026-07-15
-- ------------------------------------------------------------
-- Feature: Trayectoria del Jugador (team_stints).
--
-- team_stints es un LEDGER de ciclos jugador–equipo: se abre una fila al
-- entrar al equipo y se cierra (ended_at) al salir. Nunca se edita desde el
-- cliente — escriben sólo los triggers de la migración 2/4.
--
-- Decisiones de diseño (validadas 2026-07-15):
--   · Sin columnas de contadores mutables: la verdad canónica de las stats
--     es la derivación desde match_participants/match_results
--     (compute_stint_stats, migración 2/4). `stats` es un snapshot jsonb que
--     se congela al cerrar el ciclo — es caché de lectura, recomputable.
--   · Sin FK sobre team_id, A PROPÓSITO: la trayectoria debe sobrevivir a la
--     disolución del club. Un FK ON DELETE CASCADE borraría la historia y un
--     ON DELETE SET NULL corre una carrera con el trigger de cierre durante
--     el cascade de teams→team_members (el SET NULL puede pisar team_id
--     antes de que el cierre busque el stint por ese team_id). El nombre y
--     escudo viajan desnormalizados en team_name/shield_url.
--   · Sin FK a seasons: el desglose por temporada es DERIVADO intersectando
--     la ventana del stint con matches.season_id. Un stint = un ciclo de
--     club; el cambio de temporada no cierra nada.
--   · profile_id sí cascadea: si se borra la cuenta, se va su historia.
-- ============================================================


-- ─── Enum de motivo de salida ────────────────────────────────────────────────
-- NULL = desconocido (filas reconstruidas por el backfill 4/4).
DO $$
BEGIN
  CREATE TYPE public.stint_leave_reason AS ENUM
    ('ABANDONO', 'EXPULSADO', 'TRANSFERENCIA', 'EQUIPO_DISUELTO');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;


-- ─── Ledger de ciclos ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.team_stints (
  id                uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  profile_id        uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  team_id           uuid NOT NULL,            -- sin FK, deliberado (ver header)
  team_name         text NOT NULL,            -- desnormalizado al abrir, refrescado al cerrar
  shield_url        text,                     -- ídem team_name
  started_at        timestamptz NOT NULL,
  ended_at          timestamptz,              -- NULL = ciclo vigente
  leave_reason      public.stint_leave_reason,
  last_role         public.team_role,         -- rol al momento del cierre
  stats             jsonb,                    -- snapshot congelado al cierre (caché; la derivación es canónica)
  stats_computed_at timestamptz,
  is_reconstructed  boolean NOT NULL DEFAULT false, -- fila creada por backfill: fechas aproximadas por primer/último partido
  created_at        timestamptz NOT NULL DEFAULT now(),
  CHECK (ended_at IS NULL OR ended_at >= started_at)
);

COMMENT ON TABLE public.team_stints IS
  'Ledger inmutable de ciclos jugador–equipo (trayectoria estilo Wikipedia). Escriben sólo los triggers de team_members; el cliente sólo lee.';
COMMENT ON COLUMN public.team_stints.team_id IS
  'Sin FK a propósito: la trayectoria sobrevive a la disolución del club. Nombre/escudo desnormalizados.';
COMMENT ON COLUMN public.team_stints.ended_at IS
  'NULL = ciclo vigente. El cambio de temporada NO cierra ciclos; sólo la salida del equipo.';
COMMENT ON COLUMN public.team_stints.stats IS
  'Snapshot jsonb congelado por el trigger de cierre (compute_stint_stats). Para el ciclo vigente las stats se computan en vivo vía get_player_career.';
COMMENT ON COLUMN public.team_stints.is_reconstructed IS
  'true = creado por el backfill leyendo match_participants; started_at/ended_at son el primer/último partido, no fechas reales de alta/baja.';

-- Un solo ciclo ABIERTO por (jugador, equipo). Los cerrados pueden repetirse
-- (re-ingresos = nuevas filas, estilo Wikipedia).
CREATE UNIQUE INDEX IF NOT EXISTS team_stints_one_open_per_membership
  ON public.team_stints (profile_id, team_id)
  WHERE ended_at IS NULL;

-- Lectura del perfil (get_player_career) y de la vista de club.
CREATE INDEX IF NOT EXISTS team_stints_profile_id_idx ON public.team_stints (profile_id);
CREATE INDEX IF NOT EXISTS team_stints_team_id_idx    ON public.team_stints (team_id);


-- ─── RLS: lectura para autenticados, escritura sólo vía triggers ─────────────
ALTER TABLE public.team_stints ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS team_stints_select_authenticated ON public.team_stints;
CREATE POLICY team_stints_select_authenticated ON public.team_stints
  FOR SELECT TO authenticated USING (true);

-- Sin políticas de escritura + defensa en profundidad sin grants heredados:
-- los triggers (SECURITY DEFINER, owner) son el único camino de escritura.
REVOKE INSERT, UPDATE, DELETE ON public.team_stints FROM anon, authenticated;
