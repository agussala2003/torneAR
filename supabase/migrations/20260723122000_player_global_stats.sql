-- ============================================================
-- BUG 7 — STATS GLOBALES DEL PERFIL — 2026-07-23
-- ------------------------------------------------------------
-- Sintoma QA: el usuario `goleador` (el_goleador / Martin "Canon" Batigol)
-- tiene 150 goles y 40 MVPs en su trayectoria, pero su Perfil principal
-- muestra 0 en las cuatro tarjetas.
--
-- Causa raiz: v_player_stats (20240101000000_initial_schema.sql) arranca con
--   from profiles p join match_participants mp on mp.profile_id = p.id
-- Un jugador cuyo historial vive en ciclos CERRADOS de team_stints no tiene
-- filas en match_participants (club disuelto, datos migrados, backfill 4/4):
-- el JOIN no matchea nada y la vista devuelve cero filas. La vista y el ledger
-- de trayectoria son dos universos que nunca se cruzan.
--
-- ── Por que NO una vista materializada ──────────────────────────────────────
-- Obliga a un REFRESH programado y muestra datos viejos justo despues de un
-- partido, que es exactamente el momento en que el jugador entra a mirar sus
-- stats. El costo de correccion (un refresh cada N minutos) se paga en el peor
-- momento posible de la experiencia.
--
-- ── Por que NO sumar v_player_stats + snapshots ─────────────────────────────
-- Doble conteo garantizado: los ciclos cerrados de clubes que siguen existiendo
-- conservan intactas sus filas en match_participants, asi que esos partidos se
-- contarian dos veces (una por la vista, otra por el snapshot congelado).
--
-- ── Solucion ────────────────────────────────────────────────────────────────
-- Agregar sobre team_stints. Los ciclos son ventanas DISJUNTAS por
-- (profile_id, team_id) — compute_stint_stats filtra por ambas columnas — asi
-- que sumarlos es exacto aun con dos clubes simultaneos. Y get_player_career ya
-- resuelve la parte dificil: stats en vivo para el ciclo vigente, snapshot
-- congelado para los cerrados. Reusamos esa logica canonica en lugar de
-- reimplementarla y arriesgar que las dos derivaciones diverjan.
--
-- ── STABLE, no IMMUTABLE ────────────────────────────────────────────────────
-- El plan de ejecucion pedia la funcion como "inmutable". No es correcto aca:
-- IMMUTABLE le promete al planner que la salida depende SOLO de los argumentos,
-- y esta funcion lee team_stints, match_participants, match_results y matches.
-- Postgres acepta la etiqueta sin validarla, pero habilita constant-folding y
-- cacheo de resultados dentro de la misma query: las stats podrian quedar
-- congeladas tras un partido nuevo. STABLE es la categoria correcta (misma que
-- get_player_career y compute_stint_stats) y no cuesta performance en este uso.
--
-- SECURITY INVOKER a proposito: hereda la RLS del usuario autenticado, igual
-- que get_player_career.
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_player_global_stats(p_profile_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path TO 'public'
AS $$
  WITH career AS (
    SELECT public.get_player_career(p_profile_id) AS c
  ),
  -- Totales de los ciclos (vigente en vivo + cerrados desde snapshot).
  -- Sobre un array vacio los agregados devuelven una fila con NULL, que el
  -- coalesce baja a 0: la funcion nunca retorna NULL ni cero filas.
  stint AS (
    SELECT
      coalesce(sum((s->'stats'->'total'->>'pj_ranking')::int),   0) AS pj_ranking,
      coalesce(sum((s->'stats'->'total'->>'pj_amistoso')::int),  0) AS pj_amistoso,
      coalesce(sum((s->'stats'->'total'->>'goals')::int),        0) AS goals,
      coalesce(sum((s->'stats'->'total'->>'mvps')::int),         0) AS mvps,
      coalesce(sum((s->'stats'->'total'->>'wins')::int),         0) AS wins,
      coalesce(sum((s->'stats'->'total'->>'draws')::int),        0) AS draws,
      coalesce(sum((s->'stats'->'total'->>'losses')::int),       0) AS losses,
      coalesce(sum((s->'stats'->'total'->>'clean_sheets')::int), 0) AS clean_sheets,
      count(*)                                                      AS teams_count,
      count(*) FILTER (WHERE (s->>'is_current')::boolean)           AS active_teams_count
    FROM career, jsonb_array_elements(career.c -> 'stints') s
  ),
  -- Apariciones como invitado (unique_code): suman a los totales porque el gol
  -- se convirtio, pero NO abren ciclo y por eso viajan tambien desglosadas.
  -- get_player_career no expone V/E/D ni vallas invictas para invitados, asi
  -- que esas cuatro metricas quedan solo con lo derivado de los ciclos.
  guest AS (
    SELECT
      coalesce(sum((g->>'pj_ranking')::int),  0) AS pj_ranking,
      coalesce(sum((g->>'pj_amistoso')::int), 0) AS pj_amistoso,
      coalesce(sum((g->>'goals')::int),       0) AS goals,
      coalesce(sum((g->>'mvps')::int),        0) AS mvps,
      count(*)                                   AS teams_count
    FROM career, jsonb_array_elements(career.c -> 'guest_appearances') g
  )
  SELECT jsonb_build_object(
    'profile_id',      p_profile_id,

    -- KPIs que consume ProfileStatsGrid
    'matches_played',  stint.pj_ranking + stint.pj_amistoso
                       + guest.pj_ranking + guest.pj_amistoso,
    'total_goals',     stint.goals + guest.goals,
    'total_mvps',      stint.mvps  + guest.mvps,
    'total_wins',      stint.wins,

    -- Desglose extendido (pantalla de stats detalladas)
    'pj_ranking',      stint.pj_ranking  + guest.pj_ranking,
    'pj_amistoso',     stint.pj_amistoso + guest.pj_amistoso,
    'total_draws',     stint.draws,
    'total_losses',    stint.losses,
    'clean_sheets',    stint.clean_sheets,
    'teams_count',     stint.teams_count,
    'active_teams_count', stint.active_teams_count,

    -- Para que el perfil pueda aclarar "incluye X partidos como invitado".
    'guest_breakdown', jsonb_build_object(
      'matches_played', guest.pj_ranking + guest.pj_amistoso,
      'goals',          guest.goals,
      'mvps',           guest.mvps,
      'teams_count',    guest.teams_count
    )
  )
  FROM stint, guest;
$$;

COMMENT ON FUNCTION public.get_player_global_stats(uuid) IS
  'Acumulado global del perfil derivado de team_stints (+ invitados), reusando get_player_career. Reemplaza a v_player_stats en la pantalla de Perfil: la vista deriva solo de match_participants e ignora la trayectoria, devolviendo 0 a jugadores con historial en ciclos cerrados.';

-- Convencion A2: sin superficie para anon/PUBLIC; solo authenticated.
REVOKE EXECUTE ON FUNCTION public.get_player_global_stats(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_player_global_stats(uuid) TO authenticated;


-- ─── Deuda señalada, no ejecutada ────────────────────────────────────────────
-- v_player_stats sigue viva y ahora puede divergir de esta RPC (la vista cuenta
-- solo FINALIZADO con ambos resultados; los stints aplican las reglas de
-- compute_stint_stats). El comentario deja el rastro para la Fase 2: migrar los
-- leaderboards o renombrar la vista a v_player_match_stats para que su nombre
-- deje de sugerir que es la verdad del perfil.
COMMENT ON VIEW public.v_player_stats IS
  'DEPRECADA para la pantalla de Perfil (usar get_player_global_stats). Deriva solo de match_participants: ignora team_stints y devuelve 0 a jugadores con historial en ciclos cerrados. Sigue en uso por leaderboards/badges.';
