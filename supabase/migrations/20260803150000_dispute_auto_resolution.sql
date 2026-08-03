-- ============================================================
-- RESOLUCIÓN AUTOMÁTICA DE DISPUTAS POR TIEMPO — 2026-08-03
-- ------------------------------------------------------------
-- La disputa se resolvía cuando un CAPITÁN/SUBCAPITÁN apretaba un botón
-- (`resolve_match_dispute`). El escrutinio corría en ese instante, y como el
-- desempate cae en Fair Play cuando los votos están igualados —y 0 a 0 es el
-- estado en que NACE toda disputa— el primero en apretar se llevaba el partido.
-- No era un empate que se rompía por mérito: era una carrera por el botón.
--
-- La UI intentaba tapar el agujero escondiendo el botón cuando el desempate
-- caía en contra (DisputeSection: `wouldLoseByFairPlay`), pero eso es una
-- barrera de pantalla sobre una RPC con GRANT a `authenticated`: cualquier
-- capitán podía llamarla por REST y cobrar el partido igual.
--
-- ── Diseño nuevo ────────────────────────────────────────────────────────────
-- El escrutinio deja de ser una acción de usuario y pasa a ser un evento de
-- tiempo: la votación cierra sola a las 24 h de abierta la disputa. Nadie puede
-- adelantarla, así que no hay carrera que ganar.
--
--   1. `matches.disputed_at` — cuándo entró en disputa. No existía, y sin eso
--      no hay forma de medir "24 h en ese estado": `updated_at` lo pisa
--      cualquier UPDATE posterior.
--   2. `sweep_disputed_matches()` — el escrutinio, en su propio cron.
--   3. `resolve_match_dispute` — SE ELIMINA. No se revoca: se dropea.
--
-- ── Por qué una función y un cron dedicados, y no una rama más de
--    `sweep_stale_matches` ────────────────────────────────────────────────────
-- Porque en plpgsql una excepción aborta la función ENTERA, no la rama. Ese
-- riesgo no es teórico acá: el hotfix 20260731001000 documenta exactamente ese
-- fallo (un cast faltante en la rama de WO dejaba sin procesar también las
-- ramas de PENDIENTE y EN_VIVO). Meter el escrutinio —que toca ELO, Fair Play y
-- marcadores— dentro del mismo bloque haría que un partido raro pueda apagar el
-- barrido de partidos huérfanos. Separados, cada uno falla solo.
--
-- ── Los dos casos que NO se resuelven solos ─────────────────────────────────
-- Quedan intactos, en EN_DISPUTA, para `admin_resolve_dispute` (D2):
--
--   (a) Votos empatados Y Fair Play empatado. Es el carve-out pedido: sin
--       criterio, el sistema no inventa uno.
--   (b) Falta el marcador de alguno de los dos equipos. Pasa cuando la disputa
--       la abrió el barrido (`sweep_stale_matches` manda a EN_DISPUTA todo
--       EN_VIVO vencido con UN solo resultado cargado). Si el ganador por votos
--       es justamente el que nunca cargó, no hay marcador que adoptar —y
--       fabricar un 3-0 es una decisión administrativa, no automática. D2 ya
--       cubre este caso con criterio explícito y un admin detrás.
--
--   ⚠️ La RPC vieja resolvía (b) distinto y peor: si al perdedor le faltaba la
--   fila, su UPDATE afectaba 0 filas, el partido pasaba igual a FINALIZADO y
--   `apply_match_outcome` se iba sin aplicar NADA — ni ELO ni stats. Un partido
--   cerrado que no computaba, en silencio. Acá se exige que las dos filas
--   existan antes de tocar el estado.
-- ============================================================


-- ═══════════════════════════════════════════════════════════════
-- 1. Cuándo entró en disputa
-- ═══════════════════════════════════════════════════════════════
ALTER TABLE public.matches
  ADD COLUMN IF NOT EXISTS disputed_at timestamptz;

COMMENT ON COLUMN public.matches.disputed_at IS
  'Momento en que el partido entró en EN_DISPUTA por última vez. Lo sella un trigger en la transición. Es el reloj del cierre automático de la votación (sweep_disputed_matches); no usar updated_at, que lo pisa cualquier UPDATE.';


-- El trigger cubre TODOS los caminos hacia EN_DISPUTA —resolve_match cuando los
-- marcadores no cruzan, y sweep_stale_matches cuando un EN_VIVO vence con un
-- solo resultado— sin tener que tocar ninguna de las dos funciones.
CREATE OR REPLACE FUNCTION public.trg_matches_stamp_disputed_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = 'public'
AS $$
BEGIN
  NEW.disputed_at := now();
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.trg_matches_stamp_disputed_at()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS matches_stamp_disputed_at ON public.matches;
CREATE TRIGGER matches_stamp_disputed_at
  BEFORE UPDATE ON public.matches
  FOR EACH ROW
  -- Sólo en la ENTRADA al estado: si el partido vuelve a disputarse más
  -- adelante, el reloj se reinicia, que es lo correcto. El valor NO se limpia al
  -- salir: queda como rastro de cuándo se abrió la disputa que se resolvió.
  WHEN (NEW.status = 'EN_DISPUTA' AND OLD.status IS DISTINCT FROM 'EN_DISPUTA')
  EXECUTE FUNCTION public.trg_matches_stamp_disputed_at();


-- Backfill de las disputas ya abiertas.
--
-- ⚠️ `updated_at` es una APROXIMACIÓN: para las filas viejas no existe el dato
-- real. En la práctica el último UPDATE de un partido EN_DISPUTA suele ser
-- justamente el que lo dejó ahí, así que es la mejor estimación disponible.
--
-- ⚠️ CONSECUENCIA AL DESPLEGAR: toda disputa abierta hace más de 24 h queda
-- elegible en la PRIMERA corrida del cron. Es deliberado —son exactamente los
-- partidos que llevan meses colgados bloqueando ELO, Fair Play y la salida de
-- los convocados— pero conviene mirar el resultado de esa primera corrida.
UPDATE public.matches
   SET disputed_at = coalesce(updated_at, created_at)
 WHERE status = 'EN_DISPUTA'
   AND disputed_at IS NULL;


-- Índice parcial: la query del barrido es siempre "disputas vencidas".
CREATE INDEX IF NOT EXISTS idx_matches_disputed_sweep
  ON public.matches (disputed_at)
  WHERE status = 'EN_DISPUTA';


-- ═══════════════════════════════════════════════════════════════
-- 2. Umbral configurable
-- ═══════════════════════════════════════════════════════════════
-- Mismo régimen que el resto de los umbrales operativos (sweep_*, radio del
-- geofence): es DATA. Producto puede acortar o alargar la votación sin desplegar.
INSERT INTO public.app_settings (key, value, description)
VALUES ('sweep_dispute_timeout_hours', 24,
        'Horas que dura abierta la votación de una disputa antes de que el escrutinio automático la cierre.')
ON CONFLICT (key) DO NOTHING;


-- ═══════════════════════════════════════════════════════════════
-- 3. El escrutinio automático
-- ═══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.sweep_disputed_matches()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
declare
  v_timeout_hours numeric := coalesce(
    (select value from app_settings where key = 'sweep_dispute_timeout_hours'), 24);

  v_resolved_votes int := 0;
  v_resolved_fps   int := 0;
  v_deadlocked     int := 0;
  v_incomplete     int := 0;

  r              record;
  v_match        matches%rowtype;
  v_votes_a      integer;
  v_votes_b      integer;
  v_fps_a        numeric;
  v_fps_b        numeric;
  v_winner_id    uuid;
  v_loser_id     uuid;
  v_method       text;
  v_win_for      integer;
  v_win_against  integer;
  v_loser_exists boolean;
  v_winner_name  text;
begin
  for r in
    select m.id
    from matches m
    where m.status = 'EN_DISPUTA'
      and m.disputed_at is not null
      and m.disputed_at < now() - (v_timeout_hours || ' hours')::interval
    order by m.disputed_at asc
  loop
    -- Lock por fila y RE-LECTURA del estado: entre el SELECT de arriba y este
    -- punto, un admin pudo haber resuelto la disputa con admin_resolve_dispute
    -- (que también toma FOR UPDATE). Sin esta guarda, el barrido pisaría su
    -- resolución.
    select * into v_match from matches where id = r.id for update;
    if v_match.status <> 'EN_DISPUTA' then
      continue;
    end if;

    -- ── Escrutinio ────────────────────────────────────────────────────────────
    select count(*) into v_votes_a
      from match_dispute_votes
     where match_id = v_match.id and voted_team_id = v_match.team_a_id;

    select count(*) into v_votes_b
      from match_dispute_votes
     where match_id = v_match.id and voted_team_id = v_match.team_b_id;

    if v_votes_a > v_votes_b then
      v_winner_id := v_match.team_a_id; v_loser_id := v_match.team_b_id;
      v_method := 'votes';
    elsif v_votes_b > v_votes_a then
      v_winner_id := v_match.team_b_id; v_loser_id := v_match.team_a_id;
      v_method := 'votes';
    else
      -- Empate de votos → Fair Play. Incluye el 0-0 (nadie votó), que ahora es
      -- inofensivo: pasadas las 24 h ya no hay nadie corriendo a apretar nada.
      select fair_play_score into v_fps_a from teams where id = v_match.team_a_id;
      select fair_play_score into v_fps_b from teams where id = v_match.team_b_id;

      if v_fps_a > v_fps_b then
        v_winner_id := v_match.team_a_id; v_loser_id := v_match.team_b_id;
        v_method := 'fair_play_score';
      elsif v_fps_b > v_fps_a then
        v_winner_id := v_match.team_b_id; v_loser_id := v_match.team_a_id;
        v_method := 'fair_play_score';
      else
        -- Caso (a) del encabezado: sin criterio, no se inventa uno.
        v_deadlocked := v_deadlocked + 1;
        continue;
      end if;
    end if;

    -- ── Marcador ──────────────────────────────────────────────────────────────
    select goals_scored, goals_against
      into v_win_for, v_win_against
      from match_results
     where match_id = v_match.id and team_id = v_winner_id
     limit 1;

    select exists (
      select 1 from match_results
       where match_id = v_match.id and team_id = v_loser_id
    ) into v_loser_exists;

    -- Caso (b): sin las DOS filas, apply_match_outcome no aplicaría nada y el
    -- partido quedaría FINALIZADO sin computar. Se deja para el admin.
    if v_win_for is null or not v_loser_exists then
      v_incomplete := v_incomplete + 1;
      continue;
    end if;

    -- El perdedor adopta el espejo del marcador del ganador: misma
    -- transformación que aplicaba resolve_match_dispute.
    update match_results
       set goals_scored  = v_win_against,
           goals_against = v_win_for
     where match_id = v_match.id and team_id = v_loser_id;

    -- Dispara resolve_match_elo → apply_match_outcome (ELO + stats por formato)
    -- y el recálculo de Fair Play, igual que cualquier partido resuelto.
    -- `finished_at` importa: el cooldown de 30 días entre rivales (E9) lo lee.
    update matches
       set status = 'FINALIZADO',
           finished_at = coalesce(finished_at, now())
     where id = v_match.id;

    select name into v_winner_name from teams where id = v_winner_id;

    insert into notifications (profile_id, type, title, body, data, is_read)
    select tm.profile_id,
           'DISPUTA_RESUELTA',
           '⚖️ Disputa resuelta',
           'Cerró la votación del partido. Quedó ' || v_win_for || '-' || v_win_against
             || ' a favor de ' || coalesce(v_winner_name, 'uno de los equipos')
             || case when v_method = 'votes'
                     then ' por votación (' || v_votes_a || ' a ' || v_votes_b || ').'
                     else ' por Fair Play: la votación terminó empatada.'
                end,
           jsonb_build_object(
             'match_id', v_match.id,
             'resolution', 'AUTO',
             'method', v_method,
             'winner_team_id', v_winner_id
           ),
           false
    from team_members tm
    where tm.team_id in (v_match.team_a_id, v_match.team_b_id);

    if v_method = 'votes' then
      v_resolved_votes := v_resolved_votes + 1;
    else
      v_resolved_fps := v_resolved_fps + 1;
    end if;
  end loop;

  return jsonb_build_object(
    'resolvedByVotes',    v_resolved_votes,
    'resolvedByFairPlay', v_resolved_fps,
    'leftForAdminTie',    v_deadlocked,
    'leftForAdminNoScore', v_incomplete,
    'ranAt',              now()
  );
end;
$$;

COMMENT ON FUNCTION public.sweep_disputed_matches() IS
  'Escrutinio automático de disputas vencidas (app_settings.sweep_dispute_timeout_hours, 24 h). Cuenta votos, desempata por Fair Play y cierra el partido a FINALIZADO. Deja EN_DISPUTA —para admin_resolve_dispute— los empates totales y los partidos sin marcador de alguno de los dos equipos. Idempotente: cada resolución saca la fila del WHERE.';

-- Función de mantenimiento: jamás ejecutable desde la API REST. Si el escrutinio
-- fuera invocable por un usuario volveríamos exactamente a la carrera por el
-- botón que esta migración elimina.
REVOKE EXECUTE ON FUNCTION public.sweep_disputed_matches()
  FROM PUBLIC, anon, authenticated;


-- ═══════════════════════════════════════════════════════════════
-- 4. Cron
-- ═══════════════════════════════════════════════════════════════
-- A los :40 para no pisar los otros jobs de la hora: :00 mercado,
-- */15 recordatorios, :20 barrido de partidos huérfanos.
SELECT cron.schedule(
  'sweep-disputed-matches', '40 * * * *',
  $$select public.sweep_disputed_matches();$$
);


-- ═══════════════════════════════════════════════════════════════
-- 5. Baja de la resolución manual
-- ═══════════════════════════════════════════════════════════════
-- Se DROPEA en vez de revocarse. Revocar dejaría la función viva y ejecutable
-- por cualquier rol que en el futuro reciba un GRANT amplio —el drift de grants
-- ya pasó en este proyecto (ver 20260722123000)—, y dejaría además dos motores
-- de escrutinio con lógicas que pueden divergir. La resolución manual que sigue
-- existiendo es `admin_resolve_dispute`, que es admin-gated y auditada.
DROP FUNCTION IF EXISTS public.resolve_match_dispute(uuid);
