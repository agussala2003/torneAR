-- ============================================================
-- Insignia "Embajador" — Fase 1 (Efecto Strava) — 2026-08-17
-- ------------------------------------------------------------
-- Recompensa de estatus para el sistema de referidos: nunca otorga puntos de
-- ELO, sólo una insignia (y, en la UI, un anillo dorado en el avatar — ver
-- ProfileHeader.tsx / StatsHeader.tsx en la fase de app).
--
-- Sigue el mismo patrón que el resto del catálogo (20260330182237_badges_system.sql):
-- las insignias NO se otorgan ni se persisten — `get_player_badges` recalcula
-- `is_earned` en cada llamada. Acá se suma una condición más al mismo `CASE`,
-- no se crea un mecanismo de "insignia ganada" paralelo.
--
-- El cuerpo de `get_player_badges` se toma tal cual de la definición vigente
-- (única migración que la define: 20260330182237_badges_system.sql — ninguna
-- posterior la tocó) y se le agrega SOLO el cómputo de `v_referral_count` y el
-- `WHEN 'embajador'`.
-- ============================================================

-- ─── 1. Catálogo ─────────────────────────────────────────────────────────

INSERT INTO badges (slug, name, description, criteria_description, entity_type, icon_url) VALUES
  ('embajador', 'Embajador', 'Invitó a nuevos jugadores a TorneAR',
   'Invitá a 3 jugadores nuevos a TorneAR.', 'PLAYER', 'account-star-outline')
ON CONFLICT (slug) DO UPDATE SET
  name                 = EXCLUDED.name,
  description          = EXCLUDED.description,
  criteria_description = EXCLUDED.criteria_description,
  entity_type           = EXCLUDED.entity_type,
  icon_url             = EXCLUDED.icon_url;

-- ─── 2. get_player_badges — + condición "embajador" ─────────────────────

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
  v_referral_count  integer := 0;
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

  -- Fase 1 del sistema de referidos: cuántos perfiles apuntan a este como
  -- referente. `profiles_referred_by_idx` (migración anterior) sostiene esto.
  SELECT count(*) INTO v_referral_count
  FROM profiles
  WHERE referred_by = p_profile_id;

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
      WHEN 'embajador'      THEN v_referral_count >= 3
      ELSE false
    END AS is_earned
  FROM badges b
  WHERE b.entity_type = 'PLAYER'
  ORDER BY b.name;
END;
$$;

-- Los GRANT/REVOKE no se repiten: CREATE OR REPLACE conserva los privilegios
-- existentes (ya otorgados a authenticated y anon por la migración original).
