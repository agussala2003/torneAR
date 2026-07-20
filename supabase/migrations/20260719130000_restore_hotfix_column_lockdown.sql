-- ============================================================
-- Restauración del lockdown por columna de profiles/teams — 2026-07-19
-- ------------------------------------------------------------
-- REGRESIÓN DE SEGURIDAD detectada al migrar hotfix_security_rls a pgTAP:
-- 20260719120500_fix_core_tables_grants.sql otorgó GRANT UPDATE a nivel
-- TABLA sobre profiles y teams, pisando el lockdown por columna del hotfix
-- 20260714022651 (hallazgos ROJOS #2 y #3 del audit 360° del 13-jul):
-- cualquier usuario volvía a poder escribir su propio is_admin y el capitán
-- su elo_rating. Verificado empíricamente el 19-jul (UPDATE 1 en local).
--
-- Este archivo re-aplica EXACTAMENTE los grants por columna del hotfix.
-- Los SELECT/INSERT/DELETE de 20260719120500 (necesarios para evaluar
-- policies y WHERE) quedan intactos: la corrección es sólo sobre UPDATE.
--
-- Lección para futuros grants: la defensa de columnas de sistema NO es RLS
-- (las policies no restringen columnas) — es privilegio de columna. Nunca
-- otorgar UPDATE a nivel tabla sobre profiles/teams.
-- ============================================================

-- ─── profiles: bloqueadas id, created_at, is_admin ──────────────────────────
REVOKE UPDATE ON public.profiles FROM anon, authenticated;

GRANT UPDATE (
  auth_user_id,
  full_name,
  username,
  zone,
  preferred_position,
  date_of_birth,
  gender,
  strong_foot,
  favorite_team,
  avatar_url,
  expo_push_token,
  updated_at
) ON public.profiles TO authenticated;

-- ─── teams: bloqueadas id, created_at, invite_code, elo_rating,
--     fair_play_score, matches_played, in_ranking, season_* ─────────────────
REVOKE UPDATE ON public.teams FROM anon, authenticated;

GRANT UPDATE (
  name,
  zone,
  category,
  preferred_format,
  shield_url,
  updated_at
) ON public.teams TO authenticated;
