-- ============================================================
-- add_complex_to_market_team_posts — 2026-03-24
-- ------------------------------------------------------------
-- ⚠️ RECONCILIACIÓN (2026-07-14): migración aplicada en producción como la
-- versión remota 20260324231556 sin archivo local (era anterior a la primera
-- migración del repo). Descarga literal de supabase_migrations.schema_migrations.
-- ============================================================
ALTER TABLE market_team_posts ADD COLUMN IF NOT EXISTS complex text;
