-- ============================================================
-- Dynamic Badges System — v1.0
-- Date: 2026-03-30
-- ============================================================

-- ─── 1. Schema changes ───────────────────────────────────────

ALTER TABLE badges
  ADD COLUMN IF NOT EXISTS entity_type text NOT NULL DEFAULT 'PLAYER'
    CHECK (entity_type IN ('PLAYER', 'TEAM')),
  ADD COLUMN IF NOT EXISTS criteria_description text;

-- ─── 2. Clear legacy seed data and repopulate ────────────────

DELETE FROM profile_badges;
DELETE FROM badges;

INSERT INTO badges (slug, name, description, criteria_description, entity_type, icon_url) VALUES
  -- PLAYER badges
  ('debut',           'Debutante',      'Jugó el primer partido oficial',             'Jugá tu primer partido oficial en TorneAR.',                              'PLAYER', 'star-shooting-outline'),
  ('artillero',       'Artillero',      'Anotó 10 goles históricos',                  'Acumulá 10 goles en toda tu historia en TorneAR.',                        'PLAYER', 'football'),
  ('canonero',        'Cañonero',       'Top 5 goleadores históricos',                'Quedate en el Top 5 de goleadores históricos.',                           'PLAYER', 'rocket-launch-outline'),
  ('mvp_recurrente',  'MVP de Oro',     'MVP en 5 partidos distintos',                'Ganá el MVP en 5 partidos distintos.',                                    'PLAYER', 'trophy-award'),
  ('veterano',        'Veterano',       'Jugó 20 partidos oficiales',                 'Disputá 20 partidos oficiales en TorneAR.',                               'PLAYER', 'shield-star-outline'),
  -- TEAM badges
  ('debut_equipo',        'Primer Partido',     'El equipo jugó su primer partido oficial',   'Disputá el primer partido oficial de tu equipo.',                         'TEAM', 'flag-checkered'),
  ('muro_infranqueable',  'Muro Infranqueable', '0 goles en contra en los últimos 3 partidos','No recibas goles en 3 partidos consecutivos FINALIZADO.',                 'TEAM', 'wall'),
  ('fair_play_oro',       'Fair Play Oro',      'FPS 100 con más de 10 partidos',             'Mantené el Fair Play Score en 100 con más de 10 partidos jugados.',       'TEAM', 'hand-heart-outline'),
  ('invicto',             'Invicto',            'Sin derrotas en los últimos 5 partidos',     'No perdás en los últimos 5 partidos terminales (FINALIZADO o WO).',      'TEAM', 'sword-cross'),
  ('maquina_goleadora',   'Máquina Goleadora',  'Ganó un partido por 5 goles o más',          'Ganá al menos un partido con 5 goles o más de diferencia.',               'TEAM', 'lightning-bolt')
ON CONFLICT (slug) DO UPDATE SET
  name                 = EXCLUDED.name,
  description          = EXCLUDED.description,
  criteria_description = EXCLUDED.criteria_description,
  entity_type          = EXCLUDED.entity_type,
  icon_url             = EXCLUDED.icon_url;

-- ─── 3. RPC get_player_badges ────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_player_badges(p_profile_id uuid)
RETURNS TABLE(
  id                   uuid,
  slug                 text,
  name                 text,
  criteria_description text,
  icon_url             text,
  entity_type          text,
  is_earned            boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_matches_played  integer := 0;
  v_total_goals     integer := 0;
  v_total_mvps      integer := 0;
  v_in_top5         boolean := false;
BEGIN
  -- Load player stats from the view
  SELECT
    COALESCE(s.matches_played, 0),
    COALESCE(s.total_goals, 0),
    COALESCE(s.total_mvps, 0)
  INTO v_matches_played, v_total_goals, v_total_mvps
  FROM v_player_stats s
  WHERE s.profile_id = p_profile_id;

  -- Check if player is in top 5 by total_goals in v_player_stats
  SELECT EXISTS (
    SELECT 1 FROM (
      SELECT
        profile_id,
        RANK() OVER (ORDER BY total_goals DESC) AS rnk
      FROM v_player_stats
      WHERE total_goals > 0
    ) ranked
    WHERE ranked.profile_id = p_profile_id AND ranked.rnk <= 5
  ) INTO v_in_top5;

  RETURN QUERY
  SELECT
    b.id,
    b.slug,
    b.name,
    COALESCE(b.criteria_description, b.description, '') AS criteria_description,
    COALESCE(b.icon_url, 'medal-outline')               AS icon_url,
    b.entity_type,
    CASE b.slug
      WHEN 'debut'          THEN v_matches_played >= 1
      WHEN 'artillero'      THEN v_total_goals >= 10
      WHEN 'canonero'       THEN v_in_top5
      WHEN 'mvp_recurrente' THEN v_total_mvps >= 5
      WHEN 'veterano'       THEN v_matches_played >= 20
      ELSE false
    END AS is_earned
  FROM badges b
  WHERE b.entity_type = 'PLAYER'
  ORDER BY b.name;
END;
$$;

-- ─── 4. RPC get_team_badges ──────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_team_badges(p_team_id uuid)
RETURNS TABLE(
  id                   uuid,
  slug                 text,
  name                 text,
  criteria_description text,
  icon_url             text,
  entity_type          text,
  is_earned            boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_matches_played   integer := 0;
  v_fps              numeric := 100;
  v_muro             boolean := false;
  v_invicto          boolean := false;
  v_maquina          boolean := false;
BEGIN
  -- Load team stats
  SELECT
    COALESCE(t.matches_played, 0),
    COALESCE(t.fair_play_score, 100)
  INTO v_matches_played, v_fps
  FROM teams t WHERE t.id = p_team_id;

  -- "Muro Infranqueable": last 3 FINALIZADO matches → 0 goals against in all
  SELECT
    COALESCE(COUNT(*) = 3 AND SUM(mr.goals_against) = 0, false)
  INTO v_muro
  FROM (
    SELECT m.id
    FROM matches m
    WHERE m.status = 'FINALIZADO'
      AND (m.team_a_id = p_team_id OR m.team_b_id = p_team_id)
    ORDER BY m.scheduled_at DESC NULLS LAST
    LIMIT 3
  ) recent
  JOIN match_results mr ON mr.match_id = recent.id AND mr.team_id = p_team_id;

  -- "Invicto": last 5 terminal matches → no loss
  SELECT
    COALESCE(
      COUNT(*) = 5 AND SUM(
        CASE
          WHEN m.status = 'FINALIZADO' AND COALESCE(mr.goals_scored, 0) < COALESCE(mr.goals_against, 0) THEN 1
          WHEN m.status = 'WO_A' AND m.team_b_id = p_team_id THEN 1
          WHEN m.status = 'WO_B' AND m.team_a_id = p_team_id THEN 1
          ELSE 0
        END
      ) = 0,
      false
    )
  INTO v_invicto
  FROM (
    SELECT m.id, m.status, m.team_a_id, m.team_b_id
    FROM matches m
    WHERE m.status IN ('FINALIZADO', 'WO_A', 'WO_B')
      AND (m.team_a_id = p_team_id OR m.team_b_id = p_team_id)
    ORDER BY m.scheduled_at DESC NULLS LAST
    LIMIT 5
  ) m
  LEFT JOIN match_results mr ON mr.match_id = m.id AND mr.team_id = p_team_id;

  -- "Máquina Goleadora": won by 5+ goals (all time)
  SELECT EXISTS (
    SELECT 1
    FROM matches m
    JOIN match_results mr ON mr.match_id = m.id AND mr.team_id = p_team_id
    WHERE m.status = 'FINALIZADO'
      AND (m.team_a_id = p_team_id OR m.team_b_id = p_team_id)
      AND mr.goals_scored > mr.goals_against
      AND (mr.goals_scored - mr.goals_against) >= 5
  ) INTO v_maquina;

  RETURN QUERY
  SELECT
    b.id,
    b.slug,
    b.name,
    COALESCE(b.criteria_description, b.description, '') AS criteria_description,
    COALESCE(b.icon_url, 'medal-outline')               AS icon_url,
    b.entity_type,
    CASE b.slug
      WHEN 'debut_equipo'       THEN v_matches_played >= 1
      WHEN 'muro_infranqueable' THEN v_muro
      WHEN 'fair_play_oro'      THEN v_fps >= 100 AND v_matches_played >= 10
      WHEN 'invicto'            THEN v_invicto
      WHEN 'maquina_goleadora'  THEN v_maquina
      ELSE false
    END AS is_earned
  FROM badges b
  WHERE b.entity_type = 'TEAM'
  ORDER BY b.name;
END;
$$;

-- ─── 5. Grants ───────────────────────────────────────────────

GRANT EXECUTE ON FUNCTION public.get_player_badges(uuid) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.get_team_badges(uuid) TO authenticated, anon;
