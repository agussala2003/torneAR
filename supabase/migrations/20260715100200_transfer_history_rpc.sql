-- ============================================================
-- HISTORIAL DE TRANSFERENCIAS (3/4) — RPC de lectura — 2026-07-15
-- ------------------------------------------------------------
-- get_player_career(p_profile_id) → jsonb con TODO el currículum deportivo
-- en una sola llamada (patrón mobile: una query por pantalla):
--
--   {
--     "profile_id": "...",
--     "stints": [            -- vigente primero, luego cerrados desc
--       { "stint_id", "team_id", "team_name", "shield_url",
--         "started_at", "ended_at", "is_current", "leave_reason",
--         "last_role", "is_reconstructed",
--         "stats": { "total": {...}, "by_season": [...], "computed_at" } }
--     ],
--     "guest_appearances": [ -- decisión 2026-07-15: se muestran aparte,
--       { "team_id", "team_name", "shield_url", "pj_ranking",
--         "pj_amistoso", "goals", "mvps", "first_played_at",
--         "last_played_at" }  --  no abren stint
--     ]
--   }
--
--   · Ciclo vigente  → stats EN VIVO (compute_stint_stats sin cota superior).
--   · Ciclo cerrado  → snapshot congelado ts.stats; fallback a recomputar si
--     el snapshot faltara (robustez, no debería pasar tras el backfill 4/4).
--   · Nombre/escudo: si el club sigue existiendo se usa el valor vivo (pudo
--     renombrarse); si fue disuelto, el desnormalizado del ledger.
--   · SECURITY INVOKER a propósito: respeta la RLS de team_stints, matches,
--     match_results y match_participants del usuario autenticado (misma
--     visibilidad que get_player_leaderboard).
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_player_career(p_profile_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $$
  SELECT jsonb_build_object(
    'profile_id', p_profile_id,

    'stints', (
      SELECT coalesce(jsonb_agg(jsonb_build_object(
        'stint_id',         ts.id,
        'team_id',          ts.team_id,
        'team_name',        coalesce(t.name, ts.team_name),
        'shield_url',       CASE WHEN t.id IS NOT NULL THEN t.shield_url ELSE ts.shield_url END,
        'started_at',       ts.started_at,
        'ended_at',         ts.ended_at,
        'is_current',       (ts.ended_at IS NULL),
        'leave_reason',     ts.leave_reason,
        'last_role',        ts.last_role,
        'is_reconstructed', ts.is_reconstructed,
        'stats', CASE
          WHEN ts.ended_at IS NULL
            THEN compute_stint_stats(ts.profile_id, ts.team_id, ts.started_at, NULL)
          ELSE coalesce(
            ts.stats,
            compute_stint_stats(ts.profile_id, ts.team_id, ts.started_at, ts.ended_at)
          )
        END
      ) ORDER BY (ts.ended_at IS NULL) DESC, coalesce(ts.ended_at, ts.started_at) DESC), '[]'::jsonb)
      FROM team_stints ts
      LEFT JOIN teams t ON t.id = ts.team_id
      WHERE ts.profile_id = p_profile_id
    ),

    'guest_appearances', (
      SELECT coalesce(jsonb_agg(jsonb_build_object(
        'team_id',         g.team_id,
        'team_name',       g.team_name,
        'shield_url',      g.shield_url,
        'pj_ranking',      g.pj_ranking,
        'pj_amistoso',     g.pj_amistoso,
        'goals',           g.goals,
        'mvps',            g.mvps,
        'first_played_at', g.first_played_at,
        'last_played_at',  g.last_played_at
      ) ORDER BY g.last_played_at DESC), '[]'::jsonb)
      FROM (
        SELECT
          mp.team_id,
          t.name       AS team_name,
          t.shield_url AS shield_url,
          count(*) FILTER (WHERE m.match_type = 'RANKING')  AS pj_ranking,
          count(*) FILTER (WHERE m.match_type = 'AMISTOSO') AS pj_amistoso,
          coalesce(sum(
            (SELECT coalesce(sum((s->>'goals')::integer), 0)
               FROM jsonb_array_elements(coalesce(mr_own.scorers, '[]'::jsonb)) s
              WHERE (s->>'profile_id')::uuid = p_profile_id)
          ), 0)                                              AS goals,
          count(*) FILTER (WHERE mr_own.mvp_id = p_profile_id) AS mvps,
          min(coalesce(m.finished_at, m.scheduled_at, m.created_at)) AS first_played_at,
          max(coalesce(m.finished_at, m.scheduled_at, m.created_at)) AS last_played_at
        FROM match_participants mp
        JOIN matches m ON m.id = mp.match_id
        JOIN teams  t ON t.id = mp.team_id
        LEFT JOIN match_results mr_own
          ON mr_own.match_id = m.id AND mr_own.team_id = mp.team_id
        WHERE mp.profile_id = p_profile_id
          AND mp.is_guest   = true
          AND m.status      = 'FINALIZADO'   -- WO tampoco cuenta como invitado
        GROUP BY mp.team_id, t.name, t.shield_url
      ) g
    )
  );
$$;

COMMENT ON FUNCTION public.get_player_career(uuid) IS
  'Currículum deportivo completo de un jugador: stints (vigente en vivo + cerrados desde snapshot) y apariciones como invitado. Una sola llamada por pantalla de perfil.';

-- Convención A2: sin superficie para anon/PUBLIC; sólo authenticated.
REVOKE EXECUTE ON FUNCTION public.get_player_career(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_player_career(uuid) TO authenticated;
