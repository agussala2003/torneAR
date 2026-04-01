-- ============================================================
-- FK INDEXES — 2026-03-31
-- Adds missing indexes on foreign key columns for query performance.
-- NOTE: CREATE INDEX CONCURRENTLY cannot run inside a transaction block.
-- Applied via execute_sql (one per call) rather than apply_migration.
-- For local replay, run each statement outside a transaction or use
-- plain CREATE INDEX (without CONCURRENTLY) inside a transaction.
-- ============================================================

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_cancellation_requests_requested_by_team_id
  ON cancellation_requests(requested_by_team_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_challenges_created_by
  ON challenges(created_by);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_elo_history_match_id
  ON elo_history(match_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_market_player_posts_profile_id
  ON market_player_posts(profile_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_market_team_posts_created_by
  ON market_team_posts(created_by);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_market_team_posts_team_id
  ON market_team_posts(team_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_match_dispute_votes_voted_team_id
  ON match_dispute_votes(voted_team_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_match_proposals_from_team_id
  ON match_proposals(from_team_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_match_proposals_match_id
  ON match_proposals(match_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_match_proposals_proposed_by
  ON match_proposals(proposed_by);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_match_proposals_venue_id
  ON match_proposals(venue_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_match_results_mvp_id
  ON match_results(mvp_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_match_results_submitted_by
  ON match_results(submitted_by);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_matches_challenge_id
  ON matches(challenge_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_messages_sender_profile_id
  ON messages(sender_profile_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_messages_sender_team_id
  ON messages(sender_team_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_result_dispute_votes_voted_for_team
  ON result_dispute_votes(voted_for_team);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_wo_claims_claimed_by
  ON wo_claims(claimed_by);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_wo_claims_claiming_team_id
  ON wo_claims(claiming_team_id);
