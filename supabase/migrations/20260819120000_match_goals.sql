-- ============================================================
-- match_goals — goles individuales normalizados por partido — 2026-08-19
-- (Backlog Post-Lanzamiento · Tarea 1)
-- ------------------------------------------------------------
-- ⚠️ LEER ANTES DE TOCAR: los goles individuales YA EXISTEN en la base.
--
-- `match_results.scorers` (jsonb, 20240101000000_initial_schema.sql) guarda
-- `[{"profile_id": uuid, "goals": n}]` desde el día uno, lo escriben
-- `submit_match_result` y el circuito de WO (`lib/match-actions.ts`), y
-- `get_match_detail` (20260804120000) ya lo devuelve resuelto con
-- `full_name`. O sea: esta tabla NO desbloquea la `MatchShareCard` — eso lo
-- resuelve un mapeo en `lib/match-share-data.ts` sin tocar SQL.
--
-- Lo que sí resuelve esta tabla es lo que el jsonb no puede:
--   · Integridad referencial real (hoy un `profile_id` inventado en el jsonb
--     no lo rechaza nadie).
--   · Agregación indexable — "goleador histórico del equipo / de la liga"
--     sobre jsonb obliga a un seq scan con `jsonb_array_elements` sobre toda
--     `match_results`. Con esta tabla es un `GROUP BY player_id` con índice.
--   · Unicidad por (partido, equipo, jugador), que el jsonb tampoco garantiza.
--
-- MODELO ELEGIDO: PROYECCIÓN, NO SEGUNDA FUENTE DE VERDAD.
-- `match_goals` se mantiene por trigger desde `match_results.scorers`. La
-- fuente de verdad sigue siendo el jsonb y NO se toca ninguna de las RPCs de
-- escritura (`submit_match_result`, `resolve_wo_claim`, `admin_resolve_*`),
-- que son código de seguridad crítica y muy auditado. Dos writers
-- independientes sobre el mismo hecho es exactamente cómo se diverge en
-- silencio; acá hay uno solo y el otro es una vista materializada por trigger.
--
-- FAIL-SAFE: el trigger corre DENTRO de la transacción de carga de resultado.
-- Si la proyección explota (un jsonb malformado, un profile_id que no existe),
-- NO puede tumbar la carga del resultado — se traga la excepción, deja el
-- rastro en `app_logs` y devuelve NEW. Un partido que no se puede cerrar es
-- un incidente de producto; una fila faltante en una tabla de lectura, no.
--
-- Idempotente: se puede re-aplicar sin efectos.
-- ============================================================


-- ════════════════════════════════════════════════════════════
-- 1. Tabla
-- ════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.match_goals (
  -- `extensions.uuid_generate_v4()` y no `gen_random_uuid()`: convención del
  -- schema (las extensiones viven en `extensions`, no en `public`).
  id          uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),

  match_id    uuid NOT NULL REFERENCES public.matches(id)  ON DELETE CASCADE,
  team_id     uuid NOT NULL REFERENCES public.teams(id)    ON DELETE CASCADE,
  -- ON DELETE CASCADE y no SET NULL: un gol sin jugador no significa nada.
  -- Hoy `delete_own_account()` anonimiza en vez de borrar la fila, así que en
  -- la práctica esto no se dispara — está por si esa política cambia.
  player_id   uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,

  -- Cantidad de goles de ESE jugador en ESE partido (no acumulado histórico).
  -- `> 0` y no `>= 0`: una fila con 0 goles es ruido, la ausencia de fila ya
  -- dice lo mismo. El trigger de abajo filtra esos casos antes de insertar.
  goals_count integer NOT NULL CHECK (goals_count > 0),

  created_at  timestamptz NOT NULL DEFAULT now(),

  -- Un jugador aparece UNA vez por partido y equipo, con el total agregado.
  -- Es la garantía que el jsonb no da: el trigger hace `GROUP BY player_id`
  -- justamente para que un array con el mismo profile_id repetido colapse acá
  -- en vez de violar esta constraint.
  CONSTRAINT match_goals_unique_player_per_match UNIQUE (match_id, team_id, player_id)
);

COMMENT ON TABLE public.match_goals IS
  'Proyección normalizada de match_results.scorers (jsonb). Read-model: la escriben SÓLO los triggers de sync_match_goals_from_result(); ningún rol de PostgREST tiene INSERT/UPDATE/DELETE. Fuente de verdad = match_results.scorers.';

COMMENT ON COLUMN public.match_goals.goals_count IS
  'Goles del jugador EN ESTE partido, ya agregados. No acumulado de temporada.';


-- ════════════════════════════════════════════════════════════
-- 2. Índices
-- ════════════════════════════════════════════════════════════

-- Query de la MatchShareCard y del detalle de partido: "goleadores de MI
-- equipo en ESTE partido". Compuesto y en ese orden porque match_id sola ya
-- es altamente selectiva y team_id termina de partir en dos.
CREATE INDEX IF NOT EXISTS match_goals_match_team_idx
  ON public.match_goals (match_id, team_id);

-- La razón de ser de la tabla: `SUM(goals_count) GROUP BY player_id` para el
-- ranking de goleadores, sin desarmar jsonb de toda match_results.
CREATE INDEX IF NOT EXISTS match_goals_player_idx
  ON public.match_goals (player_id);

-- Goleador histórico POR EQUIPO (el corte que pide el perfil de equipo).
CREATE INDEX IF NOT EXISTS match_goals_team_player_idx
  ON public.match_goals (team_id, player_id);


-- ════════════════════════════════════════════════════════════
-- 3. RLS + grants
-- ════════════════════════════════════════════════════════════
-- Lectura: `using (true)` para `authenticated`, DELIBERADAMENTE igual de
-- permisiva que `match_results_select_all` (20240101000000). Poner una policy
-- más estricta acá sería seguridad de teatro: el mismo dato ya es legible en
-- la tabla de la que se deriva, y en `get_match_detail`. Si algún día se
-- angosta el acceso a los resultados, se angosta acá en la misma migración.
--
-- Escritura: NINGUNA policy y REVOKE explícito. La tabla la escribe sólo el
-- trigger SECURITY DEFINER, que corre como owner y no evalúa RLS.

ALTER TABLE public.match_goals ENABLE ROW LEVEL SECURITY;

-- Sin estos grants RLS ni llega a evaluarse: PostgREST corta antes con
-- "permission denied for table match_goals" (mismo drift que arregló
-- 20260719120500_fix_core_tables_grants.sql).
GRANT SELECT ON public.match_goals TO authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.match_goals FROM anon, authenticated;
REVOKE ALL ON public.match_goals FROM anon;

DROP POLICY IF EXISTS "match_goals_select_authenticated" ON public.match_goals;
CREATE POLICY "match_goals_select_authenticated"
  ON public.match_goals FOR SELECT TO authenticated
  USING (true);

COMMENT ON POLICY "match_goals_select_authenticated" ON public.match_goals IS
  'Espeja match_results_select_all: el mismo dato ya es legible en la tabla origen y en get_match_detail. No hay policies de escritura a propósito — sólo escribe el trigger SECURITY DEFINER.';


-- ════════════════════════════════════════════════════════════
-- 4. Proyección: match_results.scorers → match_goals
-- ════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.sync_match_goals_from_result()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  -- DELETE + INSERT y no UPSERT: una corrección de resultado puede SACAR un
  -- goleador que antes estaba, y un upsert dejaría esa fila huérfana viva.
  -- Reproyectar el par (match, team) entero es la única forma de que el
  -- estado final refleje exactamente el jsonb actual.
  DELETE FROM public.match_goals
  WHERE match_id = NEW.match_id
    AND team_id  = NEW.team_id;

  INSERT INTO public.match_goals (match_id, team_id, player_id, goals_count)
  SELECT
    NEW.match_id,
    NEW.team_id,
    (sc->>'profile_id')::uuid,
    SUM((sc->>'goals')::int)
  FROM jsonb_array_elements(COALESCE(NEW.scorers, '[]'::jsonb)) AS sc
  WHERE
    -- Defensa de tipos ANTES de castear: un cast que falla acá abortaría la
    -- transacción de carga de resultado, no sólo la proyección.
    jsonb_typeof(sc->'goals') = 'number'
    AND (sc->>'goals')::int > 0
    AND sc->>'profile_id' IS NOT NULL
    AND sc->>'profile_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    -- El FK a profiles lo exigiría igual; chequearlo antes convierte un abort
    -- de transacción en una fila simplemente omitida.
    AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = (sc->>'profile_id')::uuid)
  -- Colapsa entradas repetidas del mismo jugador en el array (el jsonb no lo
  -- impide) para no violar match_goals_unique_player_per_match.
  GROUP BY (sc->>'profile_id')::uuid;

  RETURN NEW;

EXCEPTION WHEN OTHERS THEN
  -- Regla innegociable: la proyección NUNCA tumba la carga del resultado.
  -- El bloque de arriba se revierte solo (subtransacción implícita del
  -- EXCEPTION), acá se deja rastro y se sigue como si nada.
  INSERT INTO public.app_logs (level, message, details, user_id)
  VALUES (
    'error',
    'match_goals.projection_failed',
    jsonb_build_object(
      'match_id',   NEW.match_id,
      'team_id',    NEW.team_id,
      'sqlstate',   SQLSTATE,
      'sqlerrm',    SQLERRM
    ),
    NULL
  );
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.sync_match_goals_from_result() IS
  'Reproyecta match_results.scorers (jsonb) sobre match_goals para el par (match_id, team_id) de la fila. Fail-safe: si la proyección falla, loguea en app_logs y devuelve NEW sin abortar la carga del resultado.';


CREATE OR REPLACE FUNCTION public.cleanup_match_goals_on_result_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  DELETE FROM public.match_goals
  WHERE match_id = OLD.match_id
    AND team_id  = OLD.team_id;

  RETURN OLD;
END;
$$;

COMMENT ON FUNCTION public.cleanup_match_goals_on_result_delete() IS
  'Borra la proyección de match_goals cuando se elimina la fila de match_results de la que derivaba. Sin esto quedarían goles de un resultado que ya no existe.';

-- Trigger functions: no son invocables por PostgREST (devuelven `trigger`),
-- pero el REVOKE va igual por higiene — misma línea que el resto del catálogo.
REVOKE EXECUTE ON FUNCTION public.sync_match_goals_from_result()      FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.cleanup_match_goals_on_result_delete() FROM PUBLIC, anon, authenticated;

-- `UPDATE OF scorers` y no `UPDATE` a secas: `match_results` se actualiza
-- también por cambios de `status` (CARGADO → CONFIRMADO / EN_DISPUTA), y
-- reproyectar en cada uno de esos sería trabajo puro al pedo.
DROP TRIGGER IF EXISTS trg_match_goals_sync ON public.match_results;
CREATE TRIGGER trg_match_goals_sync
  AFTER INSERT OR UPDATE OF scorers ON public.match_results
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_match_goals_from_result();

DROP TRIGGER IF EXISTS trg_match_goals_cleanup ON public.match_results;
CREATE TRIGGER trg_match_goals_cleanup
  AFTER DELETE ON public.match_results
  FOR EACH ROW
  EXECUTE FUNCTION public.cleanup_match_goals_on_result_delete();


-- ════════════════════════════════════════════════════════════
-- 5. Backfill de lo ya cargado
-- ════════════════════════════════════════════════════════════
-- Mismos filtros defensivos que el trigger. `ON CONFLICT DO NOTHING` hace la
-- migración re-aplicable: si ya corrió, el segundo pase no duplica nada.

INSERT INTO public.match_goals (match_id, team_id, player_id, goals_count)
SELECT
  r.match_id,
  r.team_id,
  (sc->>'profile_id')::uuid,
  SUM((sc->>'goals')::int)
FROM public.match_results r
CROSS JOIN LATERAL jsonb_array_elements(COALESCE(r.scorers, '[]'::jsonb)) AS sc
WHERE
  jsonb_typeof(sc->'goals') = 'number'
  AND (sc->>'goals')::int > 0
  AND sc->>'profile_id' IS NOT NULL
  AND sc->>'profile_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = (sc->>'profile_id')::uuid)
GROUP BY r.match_id, r.team_id, (sc->>'profile_id')::uuid
ON CONFLICT ON CONSTRAINT match_goals_unique_player_per_match DO NOTHING;


-- ════════════════════════════════════════════════════════════
-- 6. RPC de lectura para la tarjeta compartible
-- ════════════════════════════════════════════════════════════
-- SECURITY INVOKER (el default): la RLS de match_goals y el grant de columna
-- de `profiles.full_name` (20260819100000) ya alcanzan, así que no hay motivo
-- para elevar privilegios. Mismo criterio que la vista del censo
-- (20260811150000).
--
-- Existe para que el cliente NO tenga que conocer el nombre de la FK del
-- embed de PostgREST ni repetir el `ORDER BY` en cada llamador: devuelve el
-- array ya en el orden en que la tarjeta lo pinta.

CREATE OR REPLACE FUNCTION public.get_match_scorers(
  p_match_id uuid,
  p_team_id  uuid
)
RETURNS TABLE (
  player_id   uuid,
  full_name   text,
  goals_count integer
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = 'public'
AS $$
  SELECT
    g.player_id,
    p.full_name,
    g.goals_count
  FROM public.match_goals g
  JOIN public.profiles p ON p.id = g.player_id
  WHERE g.match_id = p_match_id
    AND g.team_id  = p_team_id
  -- Más goles primero, y el nombre como desempate estable: sin el segundo
  -- criterio, dos jugadores con la misma cantidad podían salir en distinto
  -- orden entre dos llamadas y la tarjeta "cambiaba" sin que cambiara nada.
  ORDER BY g.goals_count DESC, p.full_name ASC;
$$;

REVOKE EXECUTE ON FUNCTION public.get_match_scorers(uuid, uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_match_scorers(uuid, uuid) TO authenticated;

COMMENT ON FUNCTION public.get_match_scorers(uuid, uuid) IS
  'Goleadores de un equipo en un partido, desde la proyección match_goals, ordenados por goles desc + nombre asc. SECURITY INVOKER: se apoya en la RLS de match_goals y en el grant de columna de profiles.full_name.';
