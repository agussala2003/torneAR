-- Fix messages RLS policies.
--
-- Bug 1 (SELECT): the original policy used a mandatory JOIN on team_members,
-- so individual players (no team membership) could never read their own messages.
-- Fix: restructure to cleanly separate player vs team cases.
--
-- Bug 2 (INSERT): team side had no role filter.
-- Fix: only CAPITAN / SUBCAPITAN can send messages on behalf of a team.

DROP POLICY IF EXISTS "messages_conversation_members" ON messages;

CREATE POLICY "messages_conversation_members"
  ON messages FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM conversations c
      WHERE c.id = messages.conversation_id
      AND (
        -- Individual player side of a MARKET_DM
        (c.type = 'MARKET_DM'
          AND c.player_id = (SELECT id FROM profiles WHERE auth_user_id = auth.uid()))
        OR
        -- Team member side of a MARKET_DM (any role can read)
        (c.type = 'MARKET_DM'
          AND EXISTS (
            SELECT 1 FROM team_members tm
            JOIN profiles p ON p.id = tm.profile_id
            WHERE tm.team_id = c.team_id
              AND p.auth_user_id = auth.uid()
          ))
        OR
        -- Either team side of a MATCH_CHAT (any role can read)
        (c.type = 'MATCH_CHAT'
          AND EXISTS (
            SELECT 1 FROM team_members tm
            JOIN profiles p ON p.id = tm.profile_id
            WHERE tm.team_id IN (
              SELECT team_a_id FROM matches WHERE id = c.match_id
              UNION
              SELECT team_b_id FROM matches WHERE id = c.match_id
            )
            AND p.auth_user_id = auth.uid()
          ))
      )
    )
  );

DROP POLICY IF EXISTS "messages_insert_conversation_members" ON messages;

CREATE POLICY "messages_insert_conversation_members"
  ON messages FOR INSERT
  WITH CHECK (
    -- Sender must be the authenticated user's own profile
    sender_profile_id = (SELECT id FROM profiles WHERE auth_user_id = auth.uid())
    AND EXISTS (
      SELECT 1 FROM conversations c
      WHERE c.id = messages.conversation_id
      AND (
        -- Individual player sending in their own MARKET_DM
        (c.type = 'MARKET_DM'
          AND c.player_id = (SELECT id FROM profiles WHERE auth_user_id = auth.uid()))
        OR
        -- CAPITAN or SUBCAPITAN sending on behalf of the team in a MARKET_DM
        (c.type = 'MARKET_DM'
          AND EXISTS (
            SELECT 1 FROM team_members tm
            JOIN profiles p ON p.id = tm.profile_id
            WHERE tm.team_id = c.team_id
              AND p.auth_user_id = auth.uid()
              AND tm.role IN ('CAPITAN', 'SUBCAPITAN')
          ))
        OR
        -- CAPITAN or SUBCAPITAN sending in a MATCH_CHAT
        (c.type = 'MATCH_CHAT'
          AND EXISTS (
            SELECT 1 FROM team_members tm
            JOIN profiles p ON p.id = tm.profile_id
            WHERE tm.team_id IN (
              SELECT team_a_id FROM matches WHERE id = c.match_id
              UNION
              SELECT team_b_id FROM matches WHERE id = c.match_id
            )
            AND p.auth_user_id = auth.uid()
            AND tm.role IN ('CAPITAN', 'SUBCAPITAN')
          ))
      )
    )
  );
