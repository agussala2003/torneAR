-- Fix: allow the team that sent a proposal to cancel (update status = 'RECHAZADA') it.
-- The existing policy only allowed the OTHER team to update.
CREATE POLICY "match_proposals_cancel_by_sender"
  ON match_proposals FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM team_members tm
      JOIN profiles p ON p.id = tm.profile_id
      WHERE tm.team_id = match_proposals.from_team_id
        AND p.auth_user_id = (SELECT auth.uid())
        AND tm.role IN ('CAPITAN', 'SUBCAPITAN')
    )
  )
  WITH CHECK (
    status = 'RECHAZADA'
    AND EXISTS (
      SELECT 1 FROM team_members tm
      JOIN profiles p ON p.id = tm.profile_id
      WHERE tm.team_id = match_proposals.from_team_id
        AND p.auth_user_id = (SELECT auth.uid())
        AND tm.role IN ('CAPITAN', 'SUBCAPITAN')
    )
  );
