-- ============================================================
-- BRECHA DE PARIDAD CON PRODUCCIÓN — 2026-07-14
-- ------------------------------------------------------------
-- Cambios aplicados a producción FUERA de migraciones (SQL editor/dashboard,
-- era marzo-abril 2026), detectados por diff de catálogos local↔prod al
-- construir el stack local. Sin esto, el replay diverge del estado real:
--   1. challenges.match_type — lo leen accept_challenge/send_challenge.
--   2. market_team_posts: match_date/match_time/pitch_type/zone — los usa
--      el frontend del Mercado.
--   3. RLS habilitado en 5 tablas donde prod lo activó a mano.
-- Todo idempotente: en prod estos objetos ya existen.
-- ============================================================

ALTER TABLE challenges ADD COLUMN IF NOT EXISTS match_type match_type;

ALTER TABLE market_team_posts ADD COLUMN IF NOT EXISTS match_date text;
ALTER TABLE market_team_posts ADD COLUMN IF NOT EXISTS match_time text;
ALTER TABLE market_team_posts ADD COLUMN IF NOT EXISTS pitch_type text;
ALTER TABLE market_team_posts ADD COLUMN IF NOT EXISTS zone text;

ALTER TABLE elo_history         ENABLE ROW LEVEL SECURITY;
ALTER TABLE match_proposals     ENABLE ROW LEVEL SECURITY;
ALTER TABLE result_dispute_votes ENABLE ROW LEVEL SECURITY;
ALTER TABLE seasons             ENABLE ROW LEVEL SECURITY;
ALTER TABLE wo_claims           ENABLE ROW LEVEL SECURITY;
