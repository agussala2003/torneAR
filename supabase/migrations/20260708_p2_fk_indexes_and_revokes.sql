-- ============================================================
-- P2 CLEANUP — 2026-07-08
-- Cierra 2 de los 3 hallazgos de limpieza del audit del 8 jul 2026:
--   INFO: Unindexed foreign keys (12 restantes tras las rondas de marzo)
--   INFO: Funciones internas de triggers expuestas como RPC pública
-- El 3er ítem (mover postgis fuera de public) se deja explícitamente
-- afuera: la extensión no es relocatable en esta instalación
-- (pg_extension.extrelocatable = false), así que "moverla" implicaría
-- drop + recreate, riesgoso para las columnas de geolocalización usadas
-- por el geofencing de check-in. No vale la pena el riesgo por un
-- hallazgo puramente cosmético.
-- ============================================================

-- ─── Índices de FK sin cobertura ──────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_challenges_to_team_id ON public.challenges (to_team_id);
CREATE INDEX IF NOT EXISTS idx_conversation_reads_conversation_id ON public.conversation_reads (conversation_id);
CREATE INDEX IF NOT EXISTS idx_conversations_team_id ON public.conversations (team_id);
CREATE INDEX IF NOT EXISTS idx_elo_history_season_id ON public.elo_history (season_id);
CREATE INDEX IF NOT EXISTS idx_match_dispute_votes_profile_id ON public.match_dispute_votes (profile_id);
CREATE INDEX IF NOT EXISTS idx_match_participants_profile_id ON public.match_participants (profile_id);
CREATE INDEX IF NOT EXISTS idx_match_participants_team_id ON public.match_participants (team_id);
CREATE INDEX IF NOT EXISTS idx_match_results_team_id ON public.match_results (team_id);
CREATE INDEX IF NOT EXISTS idx_profile_badges_badge_id ON public.profile_badges (badge_id);
CREATE INDEX IF NOT EXISTS idx_result_dispute_votes_voter_id ON public.result_dispute_votes (voter_id);
CREATE INDEX IF NOT EXISTS idx_team_join_requests_profile_id ON public.team_join_requests (profile_id);
CREATE INDEX IF NOT EXISTS idx_team_members_profile_id ON public.team_members (profile_id);

-- ─── Revocar EXECUTE de funciones internas de triggers ────────────────────────
-- Estas funciones sólo deben ser invocadas por los triggers que las llaman
-- (resolve_match, fps_on_match_resolve, etc.), nunca directo por un cliente.
-- Ninguna se usa desde lib/ del frontend (verificado por grep antes de aplicar
-- esta migración). Como son SECURITY DEFINER, revocar EXECUTE de anon y
-- authenticated no afecta a los triggers que las disparan internamente.
REVOKE EXECUTE ON FUNCTION public.calculate_elo_delta(integer, integer) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.resolve_match_elo() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.season_reset_elo() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.trg_on_result_submitted() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.trigger_update_fps() FROM anon, authenticated;
