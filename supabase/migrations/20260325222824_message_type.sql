-- Migration: Add message_type column to messages table
-- Date: 2026-03-25
-- Purpose: Distinguish plain text messages from invite-code messages

ALTER TABLE messages
  ADD COLUMN message_type text NOT NULL DEFAULT 'TEXT'
  CHECK (message_type IN ('TEXT', 'TEAM_INVITE', 'MATCH_INVITE'));
