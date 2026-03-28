-- ============================================================
-- FASE 6 — Ítem 12: Índices de performance
-- Fecha: 2026-03-28
-- Reporte: docs/auditoria.md — Ítem 12
-- ============================================================
--
-- Cubre las cuatro queries de alta frecuencia identificadas en la
-- auditoría que carecían de índice explícito:
--
--   messages(conversation_id)
--     → filtro principal del chat: WHERE conversation_id = ?
--
--   match_participants(match_id, team_id)
--     → usado en check-in, carga de resultados y disputa
--
--   challenges(from_team_id, to_team_id, status)
--     → cooldown check, detección de desafío activo, inbox
--
--   matches(team_a_id, team_b_id, match_type, season_id)
--     → límite de 3 por temporada, cooldown 30 días, historial
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_messages_conversation_id
  ON public.messages (conversation_id);

CREATE INDEX IF NOT EXISTS idx_match_participants_match_team
  ON public.match_participants (match_id, team_id);

CREATE INDEX IF NOT EXISTS idx_challenges_teams_status
  ON public.challenges (from_team_id, to_team_id, status);

CREATE INDEX IF NOT EXISTS idx_matches_teams_type_season
  ON public.matches (team_a_id, team_b_id, match_type, season_id);
