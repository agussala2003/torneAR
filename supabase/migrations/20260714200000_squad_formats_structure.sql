-- ============================================================
-- SQUAD FORMATS (1/2) — Estructura y catálogo — 2026-07-14
-- ------------------------------------------------------------
-- Feature: Gestión de Planteles, Formatos (F5/F7/F11) y Suplentes.
--
--   1. format_rules — catálogo de cupos por formato (titulares exactos,
--      mínimo para presentar equipo, máximo de convocados). Es DATA, no
--      código: ajustar cupos es un UPDATE, no un deploy. El frontend lo
--      lee para pintar contadores; la RPC submit_team_checkin (migración
--      2/2) lo usa como única fuente de verdad de la validación.
--   2. lineup_role — enum TITULAR/SUPLENTE en match_participants.
--      Backfill: las filas históricas quedan TITULAR (comportamiento
--      implícito hasta hoy). Enum y no boolean para poder crecer
--      (p. ej. NO_CONVOCADO) sin migrar el tipo.
--   3. matches.format endurecido: obligatorio al CONFIRMAR un partido.
--      Se aplica por trigger sólo en la transición de estado, así los
--      9 partidos históricos terminales con format NULL siguen siendo
--      actualizables (verificado en prod 2026-07-14: 0 partidos abiertos
--      con format NULL).
--
-- Nota: el UNIQUE (match_id, profile_id) de match_participants ya existe
-- desde el schema inicial (lo usan los ON CONFLICT de checkin_team y
-- join_match_as_guest); se agrega guarda idempotente por paridad de
-- entornos, no como fix.
-- ============================================================


-- ─── 1. Catálogo de cupos por formato ────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.format_rules (
  format               team_format PRIMARY KEY,
  players_on_field     integer NOT NULL CHECK (players_on_field > 0),
  min_players_to_start integer NOT NULL,
  max_squad_size       integer NOT NULL,
  updated_at           timestamptz NOT NULL DEFAULT now(),
  CHECK (min_players_to_start > 0 AND min_players_to_start <= players_on_field),
  CHECK (max_squad_size >= players_on_field)
);

COMMENT ON TABLE  public.format_rules IS
  'Cupos por formato de fútbol. Fuente de verdad de submit_team_checkin y de los contadores de la UI de convocatoria.';
COMMENT ON COLUMN public.format_rules.players_on_field IS
  'Titulares exactos en cancha (5, 6, 7, 8, 9, 11)';
COMMENT ON COLUMN public.format_rules.min_players_to_start IS
  'Mínimo de titulares para presentar equipo sin WO';
COMMENT ON COLUMN public.format_rules.max_squad_size IS
  'Máximo de convocados por partido (titulares + suplentes, incluye invitados)';

INSERT INTO public.format_rules (format, players_on_field, min_players_to_start, max_squad_size) VALUES
  ('FUTBOL_5',   5, 4, 10),
  ('FUTBOL_6',   6, 5, 12),
  ('FUTBOL_7',   7, 6, 14),
  ('FUTBOL_8',   8, 6, 15),
  ('FUTBOL_9',   9, 7, 16),
  ('FUTBOL_11', 11, 7, 18)
ON CONFLICT (format) DO UPDATE SET
  players_on_field     = EXCLUDED.players_on_field,
  min_players_to_start = EXCLUDED.min_players_to_start,
  max_squad_size       = EXCLUDED.max_squad_size,
  updated_at           = now();

-- RLS: catálogo de sólo lectura para usuarios autenticados. Sin políticas de
-- escritura: los ajustes de cupos se hacen por service role / dashboard.
ALTER TABLE public.format_rules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS format_rules_select_authenticated ON public.format_rules;
CREATE POLICY format_rules_select_authenticated ON public.format_rules
  FOR SELECT TO authenticated USING (true);

-- Defensa en profundidad: sin grants de escritura heredados para los roles API.
REVOKE INSERT, UPDATE, DELETE ON public.format_rules FROM anon, authenticated;


-- ─── 2. Titulares vs. suplentes en match_participants ────────────────────────

DO $$
BEGIN
  CREATE TYPE public.lineup_role AS ENUM ('TITULAR', 'SUPLENTE');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE public.match_participants
  ADD COLUMN IF NOT EXISTS lineup_role public.lineup_role NOT NULL DEFAULT 'TITULAR';

COMMENT ON COLUMN public.match_participants.lineup_role IS
  'TITULAR arranca en cancha, SUPLENTE va al banco. Histórico backfilleado a TITULAR.';

-- Guarda idempotente del UNIQUE (existe desde el schema inicial; ver header).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.match_participants'::regclass
      AND contype = 'u'
  ) THEN
    ALTER TABLE public.match_participants
      ADD CONSTRAINT match_participants_match_id_profile_id_key UNIQUE (match_id, profile_id);
  END IF;
END $$;


-- ─── 3. matches.format obligatorio al confirmar ──────────────────────────────
-- Sólo se exige en la TRANSICIÓN hacia CONFIRMADO/EN_VIVO (o en un INSERT que
-- ya nace en esos estados). Un UPDATE que no cambia el estado pasa siempre:
-- los partidos históricos con format NULL son todos terminales y no vuelven
-- a transicionar. El flujo real nunca choca con esto: confirm_match_proposal
-- copia el format de la propuesta (donde es NOT NULL) al confirmar.

CREATE OR REPLACE FUNCTION public.enforce_match_format_required()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = 'public'
AS $$
BEGIN
  IF NEW.status IN ('CONFIRMADO', 'EN_VIVO')
     AND NEW.format IS NULL
     AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM NEW.status)
  THEN
    RAISE EXCEPTION 'FORMAT_REQUIRED: un partido no puede pasar a % sin formato definido', NEW.status;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.enforce_match_format_required() FROM PUBLIC;

DROP TRIGGER IF EXISTS trg_matches_format_required ON public.matches;
CREATE TRIGGER trg_matches_format_required
  BEFORE INSERT OR UPDATE ON public.matches
  FOR EACH ROW EXECUTE FUNCTION public.enforce_match_format_required();
