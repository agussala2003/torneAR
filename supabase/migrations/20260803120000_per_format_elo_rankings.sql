-- ============================================================
-- ELO INDEPENDIENTE POR FORMATO — 2026-08-03
-- ------------------------------------------------------------
-- Hasta hoy un equipo tenía UN solo `teams.elo_rating`, mezclando en el mismo
-- número partidos de Fútbol 5, 7 y 11. Un plantel fuerte en F5 y flojo en F11
-- terminaba con un rating promedio que no describía ninguno de los dos, y el
-- emparejamiento por ELO ("Rivales Ideales") proponía cruces desparejos.
--
-- A partir de acá el rating vive en `team_rankings`, una fila por
-- (equipo, formato).
--
-- ─── Estrategia: expand / contract (esta migración es sólo el EXPAND) ────────
--
-- NO se eliminan `teams.elo_rating` / `matches_played` / `season_*`. La tarea
-- las daba como opcionales ("evaluá si es seguro"): **hoy no lo es**. Esas
-- columnas las leen 11 funciones vivas del catálogo —get_match_detail,
-- get_my_matches, get_player_badges, get_team_badges, get_player_global_stats,
-- get_team_challenges_inbox, send_challenge, search_teams, transition_season,
-- apply_match_outcome— más las vistas `v_team_ranking` y `v_player_stats`, más
-- ~24 archivos del frontend. Dropearlas en el mismo paso convierte un refactor
-- acotado en una reescritura de todo el dominio, y encima contra la base de
-- PRODUCCIÓN (Free Tier, sin staging: ver docs/WORKFLOW.md), donde un DROP
-- COLUMN no tiene vuelta atrás sin restore.
--
-- Entonces: **doble escritura**. El motor sigue actualizando el ELO global
-- exactamente como antes (nadie que lo lea se entera de nada) y además lleva el
-- ELO por formato en la tabla nueva. La única superficie que ya lee lo nuevo es
-- `get_team_ranking`. El CONTRACT (dropear columnas, migrar el resto de los
-- lectores) queda para una migración posterior, cuando todos los consumidores
-- estén movidos.
--
-- ─── Qué queda pendiente para el CONTRACT (deuda declarada) ──────────────────
--   · `search_teams` sigue filtrando/devolviendo el ELO global: el filtro
--     "Rivales Ideales" y el ranking pueden diferir hasta que se migre.
--   · `elo_history` sigue registrando el movimiento del ELO global (el gráfico
--     de evolución no cambia). Para historial por formato hace falta agregarle
--     una columna `format`.
--   · `team_rankings` no lleva goles a favor/en contra: `v_team_ranking` los
--     usa para `points` y `goal_diff`, así que hay que sumarlos antes de poder
--     dropear `teams.season_goals_*`.
--
-- Idempotente: se puede re-aplicar sin efectos.
-- ============================================================


-- ═══════════════════════════════════════════════════════════════
-- 1. Tabla team_rankings
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.team_rankings (
  team_id        uuid        NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  format         team_format NOT NULL,
  -- Mismo piso que el ELO global: todo equipo arranca en 1000 en cada formato
  -- que estrena.
  elo_score      integer     NOT NULL DEFAULT 1000,
  -- Contador de por vida (no lo resetea el cambio de temporada), igual que
  -- `teams.matches_played`.
  matches_played integer     NOT NULL DEFAULT 0,
  -- Contadores DE TEMPORADA: los resetea `transition_season`, igual que
  -- `teams.season_wins/draws/losses`. Mantener la misma semántica es lo que
  -- permite que la doble escritura no se desincronice.
  wins           integer     NOT NULL DEFAULT 0,
  draws          integer     NOT NULL DEFAULT 0,
  losses         integer     NOT NULL DEFAULT 0,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (team_id, format)
);

COMMENT ON TABLE public.team_rankings IS
  'ELO y estadísticas de un equipo EN UN FORMATO concreto (F5/F6/F7/F8/F9/F11). Una fila por (team_id, format); la crea el motor la primera vez que el equipo juega ese formato. Escribe únicamente apply_match_outcome.';
COMMENT ON COLUMN public.team_rankings.elo_score IS
  'ELO del equipo en ese formato. Continuo entre temporadas (misma regla de dominio que teams.elo_rating).';
COMMENT ON COLUMN public.team_rankings.matches_played IS
  'Partidos jugados en ese formato, de por vida. No se resetea entre temporadas.';
COMMENT ON COLUMN public.team_rankings.wins IS
  'Victorias en ese formato EN LA TEMPORADA ACTUAL. transition_season las vuelve a 0.';

-- La query de ranking es siempre "dame el formato F ordenado por ELO desc".
CREATE INDEX IF NOT EXISTS team_rankings_format_elo_idx
  ON public.team_rankings (format, elo_score DESC);


-- ═══════════════════════════════════════════════════════════════
-- 2. Seguridad: lectura pública, escritura sólo del motor
-- ═══════════════════════════════════════════════════════════════
ALTER TABLE public.team_rankings ENABLE ROW LEVEL SECURITY;

-- Sin estos grants RLS ni llega a evaluarse (mismo drift que arregló
-- 20260719120500_fix_core_tables_grants.sql).
GRANT SELECT ON public.team_rankings TO anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.team_rankings FROM anon, authenticated;

-- El ranking es público, igual que `teams_select_all`.
DROP POLICY IF EXISTS "team_rankings_select_all" ON public.team_rankings;
CREATE POLICY "team_rankings_select_all"
  ON public.team_rankings FOR SELECT
  USING (true);

-- Sin policies de INSERT/UPDATE/DELETE a propósito: el único escritor legítimo
-- es apply_match_outcome (SECURITY DEFINER), que las saltea. Vía PostgREST la
-- tabla es de sólo lectura.


-- ═══════════════════════════════════════════════════════════════
-- 3. Backfill: el ELO de hoy pasa al formato preferido de cada equipo
-- ═══════════════════════════════════════════════════════════════
-- Nota de honestidad sobre el dato: el ELO global de hoy se acumuló con
-- partidos de CUALQUIER formato, y acá se lo atribuye entero al
-- `preferred_format`. No es reconstruible de otra forma sin re-jugar el
-- historial partido por partido, y tiene la ventaja de que ningún equipo ve
-- cambiar su número el día del deploy. Los demás formatos arrancan en 1000
-- cuando el equipo los estrena.
INSERT INTO public.team_rankings (
  team_id, format, elo_score, matches_played, wins, draws, losses
)
SELECT
  t.id,
  t.preferred_format,
  t.elo_rating,
  t.matches_played,
  t.season_wins,
  t.season_draws,
  t.season_losses
FROM public.teams t
ON CONFLICT (team_id, format) DO NOTHING;


-- ═══════════════════════════════════════════════════════════════
-- 4. Helpers del motor
-- ═══════════════════════════════════════════════════════════════

-- ─── 4.1 Alta perezosa de la fila (equipo, formato) ─────────────────────────
-- El equipo entra al ranking de un formato recién cuando juega su primer
-- partido ahí, con el ELO base. Así el ranking de F11 no se llena de equipos
-- que nunca jugaron F11.
CREATE OR REPLACE FUNCTION public.ensure_team_ranking_row(
  p_team_id uuid,
  p_format  team_format
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = 'public'
AS $$
  INSERT INTO team_rankings (team_id, format)
  VALUES (p_team_id, p_format)
  ON CONFLICT (team_id, format) DO NOTHING;
$$;

REVOKE EXECUTE ON FUNCTION public.ensure_team_ranking_row(uuid, team_format)
  FROM PUBLIC, anon, authenticated;

-- ─── 4.2 Alta de la fila al crear el equipo / al cambiar de formato ─────────
-- El backfill le da fila a todos los equipos que existen HOY, pero sin esto un
-- equipo creado mañana no tendría ninguna hasta jugar su primer partido, y
-- `get_team_ranking` —que ahora hace JOIN contra esta tabla— lo dejaría afuera
-- del ranking. Antes del cambio ese equipo aparecía con 1000 desde el minuto
-- cero; el trigger conserva ese comportamiento.
--
-- El UPDATE cubre el otro agujero: si el capitán cambia el formato preferido,
-- la consulta sin filtro pasa a buscar una fila que puede no existir. La fila
-- del formato viejo NO se borra —esos partidos se jugaron— y queda visible al
-- filtrar por ese formato.
CREATE OR REPLACE FUNCTION public.trg_team_ranking_seed()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  PERFORM ensure_team_ranking_row(NEW.id, NEW.preferred_format);
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.trg_team_ranking_seed() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS team_ranking_seed_on_insert ON public.teams;
CREATE TRIGGER team_ranking_seed_on_insert
  AFTER INSERT ON public.teams
  FOR EACH ROW EXECUTE FUNCTION public.trg_team_ranking_seed();

DROP TRIGGER IF EXISTS team_ranking_seed_on_format_change ON public.teams;
CREATE TRIGGER team_ranking_seed_on_format_change
  AFTER UPDATE OF preferred_format ON public.teams
  FOR EACH ROW
  WHEN (NEW.preferred_format IS DISTINCT FROM OLD.preferred_format)
  EXECUTE FUNCTION public.trg_team_ranking_seed();

-- ─── 4.3 La fórmula del ELO, en un solo lugar ───────────────────────────────
-- Extraída tal cual del motor unificado (20260714024611): ELO estándar con
-- K = 40 y delta acotado a ±K.
--
--   E_self = 1 / (1 + 10 ^ ((Elo_rival − Elo_self) / 400))
--   delta  = ROUND(clamp(K × (S − E_self), −K, +K))
--
-- Antes vivía escrita dos veces dentro de apply_match_outcome (una por equipo,
-- la del equipo B usando `1 − E_A`). Con el ELO por formato pasaban a ser
-- cuatro copias, así que se extrae. Es la MISMA cuenta: `1 − 1/(1+10^x)` es
-- idénticamente `1/(1+10^-x)`, que es lo que devuelve esta función al invertir
-- los argumentos.
CREATE OR REPLACE FUNCTION public.elo_delta(
  p_elo_self  integer,
  p_elo_rival integer,
  p_score     numeric   -- 1.0 ganó / 0.5 empató / 0.0 perdió
)
RETURNS integer
LANGUAGE sql
IMMUTABLE
SET search_path = 'public'
AS $$
  SELECT ROUND(
    LEAST(40::numeric, GREATEST(-40::numeric,
      40::numeric * (
        p_score - (1.0 / (1.0 + power(10.0, (p_elo_rival - p_elo_self)::numeric / 400.0)))
      )
    ))
  )::integer;
$$;

REVOKE EXECUTE ON FUNCTION public.elo_delta(integer, integer, numeric)
  FROM PUBLIC, anon, authenticated;


-- ═══════════════════════════════════════════════════════════════
-- 5. Motor: apply_match_outcome con ELO por formato
-- ═══════════════════════════════════════════════════════════════
-- Sigue siendo el ÚNICO lugar donde se tocan stats y ELO (invariante que
-- estableció 20260714024611_elo_engine_unification y que esta migración
-- conserva). Lo que cambia:
--
--   · Resuelve el formato del partido y garantiza la fila (equipo, formato).
--   · Suma las stats del formato — todos los tipos de partido, igual que las
--     globales.
--   · Mueve el ELO del formato — sólo RANKING, igual que el global.
--   · Sigue escribiendo las columnas globales de `teams` y `elo_history` sin
--     ningún cambio de comportamiento (fase EXPAND: nadie que lea lo viejo se
--     entera).
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
  v_diff_a  integer;
  v_diff_b  integer;
  v_format      team_format;
  v_fmt_elo_a   integer;
  v_fmt_elo_b   integer;
  v_fmt_diff_a  integer;
  v_fmt_diff_b  integer;
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

  -- ── 0) Formato del partido ─────────────────────────────────────────────────
  -- `matches.format` es NULLABLE en el esquema, pero
  -- `trg_matches_format_required` prohíbe llegar a CONFIRMADO o EN_VIVO sin
  -- formato, y todo estado terminal pasa antes por uno de esos dos: en el flujo
  -- vivo esto NUNCA es null. El COALESCE es una red para el replay de partidos
  -- viejos (los que se sellaron antes de aquel trigger).
  --
  -- Se resuelve UN formato por partido, no uno por equipo: si cada equipo
  -- sumara en la tabla de su propio formato preferido, el ELO dejaría de ser
  -- suma cero y ninguno de los dos rankings querría decir nada.
  -- `teams.preferred_format` es NOT NULL, así que el fallback siempre resuelve.
  SELECT COALESCE(p_match.format, t.preferred_format)
    INTO v_format
    FROM teams t
   WHERE t.id = p_match.team_a_id;

  IF v_format IS NULL THEN
    RETURN;  -- equipo A inexistente: no hay nada coherente que registrar
  END IF;

  PERFORM ensure_team_ranking_row(p_match.team_a_id, v_format);
  PERFORM ensure_team_ranking_row(p_match.team_b_id, v_format);

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

  -- ── 1-bis) Las mismas stats, pero del formato ──────────────────────────────
  UPDATE team_rankings SET
    matches_played = matches_played + 1,
    wins           = wins   + CASE WHEN v_s_a = 1.0 THEN 1 ELSE 0 END,
    draws          = draws  + CASE WHEN v_s_a = 0.5 THEN 1 ELSE 0 END,
    losses         = losses + CASE WHEN v_s_a = 0.0 THEN 1 ELSE 0 END,
    updated_at     = COALESCE(p_at, now())
  WHERE team_id = p_match.team_a_id AND format = v_format;

  UPDATE team_rankings SET
    matches_played = matches_played + 1,
    wins           = wins   + CASE WHEN v_s_b = 1.0 THEN 1 ELSE 0 END,
    draws          = draws  + CASE WHEN v_s_b = 0.5 THEN 1 ELSE 0 END,
    losses         = losses + CASE WHEN v_s_b = 0.0 THEN 1 ELSE 0 END,
    updated_at     = COALESCE(p_at, now())
  WHERE team_id = p_match.team_b_id AND format = v_format;

  -- ── 2) ELO + historial — sólo partidos de RANKING ──────────────────────────
  IF p_match.match_type = 'RANKING' THEN
    -- 2.a) ELO global (comportamiento intacto: lo siguen leyendo search_teams,
    --      v_team_ranking, el H2H, los badges y el gráfico de evolución).
    SELECT elo_rating INTO v_elo_a FROM teams WHERE id = p_match.team_a_id;
    SELECT elo_rating INTO v_elo_b FROM teams WHERE id = p_match.team_b_id;
    v_elo_a := COALESCE(v_elo_a, 1000);
    v_elo_b := COALESCE(v_elo_b, 1000);

    v_diff_a := elo_delta(v_elo_a, v_elo_b, v_s_a);
    v_diff_b := elo_delta(v_elo_b, v_elo_a, v_s_b);

    INSERT INTO elo_history (team_id, season_id, match_id, elo_before, elo_after, delta, created_at)
    VALUES
      (p_match.team_a_id, p_match.season_id, p_match.id, v_elo_a, v_elo_a + v_diff_a, v_diff_a, COALESCE(p_at, now())),
      (p_match.team_b_id, p_match.season_id, p_match.id, v_elo_b, v_elo_b + v_diff_b, v_diff_b, COALESCE(p_at, now()));

    UPDATE teams SET elo_rating = elo_rating + v_diff_a WHERE id = p_match.team_a_id;
    UPDATE teams SET elo_rating = elo_rating + v_diff_b WHERE id = p_match.team_b_id;

    -- 2.b) ELO del formato. Se calcula con los ratings DE ESE FORMATO, no con
    --      los globales: son escalas distintas y mezclarlas daría deltas que no
    --      corresponden a ninguna de las dos.
    SELECT elo_score INTO v_fmt_elo_a
      FROM team_rankings WHERE team_id = p_match.team_a_id AND format = v_format;
    SELECT elo_score INTO v_fmt_elo_b
      FROM team_rankings WHERE team_id = p_match.team_b_id AND format = v_format;
    v_fmt_elo_a := COALESCE(v_fmt_elo_a, 1000);
    v_fmt_elo_b := COALESCE(v_fmt_elo_b, 1000);

    v_fmt_diff_a := elo_delta(v_fmt_elo_a, v_fmt_elo_b, v_s_a);
    v_fmt_diff_b := elo_delta(v_fmt_elo_b, v_fmt_elo_a, v_s_b);

    UPDATE team_rankings SET
      elo_score  = elo_score + v_fmt_diff_a,
      updated_at = COALESCE(p_at, now())
    WHERE team_id = p_match.team_a_id AND format = v_format;

    UPDATE team_rankings SET
      elo_score  = elo_score + v_fmt_diff_b,
      updated_at = COALESCE(p_at, now())
    WHERE team_id = p_match.team_b_id AND format = v_format;
  END IF;
END;
$$;

-- Función interna: jamás ejecutable vía REST.
REVOKE EXECUTE ON FUNCTION public.apply_match_outcome(public.matches, timestamptz)
  FROM PUBLIC, anon, authenticated;


-- ═══════════════════════════════════════════════════════════════
-- 6. get_team_ranking: ahora lee team_rankings
-- ═══════════════════════════════════════════════════════════════
-- La firma (nombres y tipos de las columnas devueltas) queda IDÉNTICA a propósito:
-- es lo que permite que `lib/ranking-data.ts`, la tab Ranking y la MiniRankingCard
-- de la Home sigan andando sin tocar una línea. Lo único que cambió es de dónde
-- sale cada número.
--
-- Dos decisiones que conviene tener presentes:
--
--   · `p_format IS NULL` (la tab Ranking sin filtro de formato) rankea a cada
--     equipo por su `preferred_format`. Es el equivalente más cercano al
--     comportamiento anterior: una fila por equipo, la de su formato principal.
--     Mezclar ELOs de formatos distintos en una misma tabla no significaría nada.
--
--   · Con `p_format` explícito sólo aparecen los equipos que tienen fila en ese
--     formato, es decir, los que efectivamente lo jugaron (o los que lo tienen
--     como preferido, por el backfill). Un equipo que nunca jugó F11 no ensucia
--     el ranking de F11 con un 1000 fantasma.
--
--   · La columna `preferred_format` del resultado devuelve el formato DE LA FILA
--     rankeada (`tr.format`). Cuando se filtra por formato es lo correcto —es el
--     formato en el que ese ELO fue ganado— y sin filtro coincide con el
--     preferido del equipo, así que la UI no cambia.
CREATE OR REPLACE FUNCTION public.get_team_ranking(
  p_zone     text          DEFAULT NULL::text,
  p_category team_category DEFAULT NULL::team_category,
  p_format   team_format   DEFAULT NULL::team_format
)
 RETURNS TABLE(rank_position bigint, team_id uuid, team_name text, shield_url text, zone text, category team_category, preferred_format team_format, elo_rating integer, fair_play_score numeric, season_wins integer, season_losses integer, season_draws integer, matches_played integer)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    row_number() over (order by tr.elo_score desc)::bigint,
    t.id, t.name, t.shield_url, t.zone, t.category, tr.format, tr.elo_score,
    t.fair_play_score, tr.wins, tr.losses, tr.draws, tr.matches_played
  FROM teams t
  JOIN team_rankings tr
    ON tr.team_id = t.id
   AND tr.format  = COALESCE(p_format, t.preferred_format)
  WHERE t.is_active
    AND (p_zone IS NULL OR t.zone = p_zone)
    AND (p_category IS NULL OR t.category = p_category)
  ORDER BY tr.elo_score DESC;
$function$;


-- ═══════════════════════════════════════════════════════════════
-- 7. transition_season: resetear también los contadores por formato
-- ═══════════════════════════════════════════════════════════════
-- Sin esto, `team_rankings.wins/draws/losses` acumularía para siempre mientras
-- las columnas equivalentes de `teams` vuelven a 0 cada temporada, y las dos
-- mitades de la doble escritura se irían separando sin que nadie lo note.
-- El ELO y `matches_played` NO se tocan (ELO continuo entre temporadas: misma
-- decisión de dominio que ya tomaba esta función para `teams.elo_rating`).
CREATE OR REPLACE FUNCTION public.transition_season(
  p_new_name  text,
  p_starts_at date,
  p_ends_at   date
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  v_admin  uuid;
  v_old    seasons%rowtype;
  v_new_id uuid;
  v_slug   text;
begin
  -- Autorización: admin derivado de auth.uid() (patrón resolve_wo_claim).
  select id into v_admin
  from profiles where auth_user_id = auth.uid() and is_admin = true;
  if v_admin is null then
    raise exception 'No autorizado: se requiere rol de administrador';
  end if;

  -- Validaciones de entrada.
  if p_new_name is null or btrim(p_new_name) = '' then
    raise exception 'El nombre de la temporada es obligatorio';
  end if;
  if p_starts_at is null or p_ends_at is null or p_starts_at >= p_ends_at then
    raise exception 'Rango de fechas inválido (inicio: %, fin: %)', p_starts_at, p_ends_at;
  end if;

  -- Temporada activa, con lock: dos transiciones concurrentes se serializan
  -- y la segunda falla en la guarda de estado (además del índice único).
  select * into v_old from seasons where is_active = true limit 1 for update;
  if v_old.id is null then
    raise exception 'No hay temporada activa para cerrar';
  end if;

  v_slug := btrim(regexp_replace(lower(btrim(p_new_name)), '[^a-z0-9]+', '-', 'g'), '-');
  if exists (select 1 from seasons where slug = v_slug) then
    raise exception 'Ya existe una temporada con slug "%"', v_slug;
  end if;

  -- a) Cerrar la temporada vigente.
  update seasons set is_active = false where id = v_old.id;

  -- b) Crear y activar la nueva.
  insert into seasons (name, slug, starts_at, ends_at, is_active)
  values (btrim(p_new_name), v_slug, p_starts_at, p_ends_at, true)
  returning id into v_new_id;

  -- c) Contadores de temporada a 0. elo_rating y matches_played quedan
  --    INTACTOS por decisión de dominio (ELO continuo entre temporadas).
  update teams set
    season_wins          = 0,
    season_draws         = 0,
    season_losses        = 0,
    season_goals_for     = 0,
    season_goals_against = 0;

  -- c-bis) Lo mismo para los contadores por formato (elo_score y
  --        matches_played intactos, misma regla que arriba).
  update team_rankings set
    wins       = 0,
    draws      = 0,
    losses     = 0,
    updated_at = now();

  -- d) Partidos abiertos: pasan a la temporada nueva (sus stats caerán en
  --    los contadores nuevos cuando terminen; los terminales no se tocan).
  update matches set season_id = v_new_id
   where status in ('PENDIENTE', 'CONFIRMADO', 'EN_VIVO', 'EN_DISPUTA');

  -- e) Auditoría: notificación a todos los admins.
  insert into notifications (profile_id, type, title, body, data, is_read)
  select
    p.id,
    'TEMPORADA_INICIADA',
    '🏁 Nueva temporada: ' || btrim(p_new_name),
    'Se cerró "' || v_old.name || '" y comenzó "' || btrim(p_new_name)
      || '". Los contadores de temporada fueron reseteados (ELO intacto).',
    jsonb_build_object('season_id', v_new_id, 'previous_season_id', v_old.id, 'executed_by', v_admin),
    false
  from profiles p
  where p.is_admin = true;

  return v_new_id;
end;
$function$;
