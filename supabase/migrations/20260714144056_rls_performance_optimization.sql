-- ============================================================
-- OPTIMIZACIÓN DE PERFORMANCE RLS — 2026-07-14
-- ------------------------------------------------------------
-- Cierra los WARN de performance del advisor de Supabase (audit 360°):
--
--   A) auth_rls_initplan (14 políticas / 13 tablas): las políticas evaluaban
--      auth.uid() POR CADA FILA. Envolverlo en (select auth.uid()) permite a
--      Postgres resolverlo una sola vez por statement (InitPlan) — crítico
--      para SELECT/INSERT masivos en messages, match_participants,
--      match_results, etc. Cambio 100% semánticamente neutro.
--
--   B) multiple_permissive_policies (4 grupos): dos políticas permisivas de
--      la misma acción obligan a evaluar ambas para cada fila. Como Postgres
--      combina las permisivas con OR (USING con USING, WITH CHECK con
--      WITH CHECK), fusionarlas en una sola política con OR explícito es
--      EXACTAMENTE equivalente y evalúa un solo árbol:
--        - challenges           UPDATE  (cancela emisor / rechaza receptor)
--        - match_proposals      UPDATE  (cancela emisor / responde rival)
--        - team_join_requests   UPDATE  (admin resuelve / dueño mantiene)
--        - team_members         INSERT  (bootstrap capitán / alta por request)
--      El grupo de notifications (ALL "own" + INSERT relacional) se deja
--      como está: no es duplicación, son dos caminos de negocio distintos.
--
-- Garantía de equivalencia: supabase/tests/rls_performance_regression.sql
-- (S0 estructural + P1-P5 conductuales) corrida contra el proyecto real.
-- ============================================================

-- ─────────────────────────────────────────────────────────────
-- A) Wrap de auth.uid() → (select auth.uid())
-- ─────────────────────────────────────────────────────────────

-- A1. challenges (INSERT)
DROP POLICY IF EXISTS challenges_insert_by_from_team_admin ON public.challenges;
CREATE POLICY challenges_insert_by_from_team_admin ON public.challenges
  FOR INSERT TO authenticated
  WITH CHECK (
    created_by = (SELECT p.id FROM profiles p WHERE p.auth_user_id = (SELECT auth.uid()))
    AND EXISTS (
      SELECT 1 FROM team_members tm JOIN profiles p ON p.id = tm.profile_id
      WHERE tm.team_id = challenges.from_team_id
        AND p.auth_user_id = (SELECT auth.uid())
        AND tm.role IN ('CAPITAN', 'SUBCAPITAN')
    )
  );

-- A2. conversation_reads (ALL)
DROP POLICY IF EXISTS reads_own_rows ON public.conversation_reads;
CREATE POLICY reads_own_rows ON public.conversation_reads
  FOR ALL
  USING (profile_id = (SELECT p.id FROM profiles p WHERE p.auth_user_id = (SELECT auth.uid())))
  WITH CHECK (profile_id = (SELECT p.id FROM profiles p WHERE p.auth_user_id = (SELECT auth.uid())));

-- A3. conversations (INSERT)
DROP POLICY IF EXISTS conversations_insert_market_dm ON public.conversations;
CREATE POLICY conversations_insert_market_dm ON public.conversations
  FOR INSERT TO authenticated
  WITH CHECK (
    type = 'MARKET_DM'
    AND (
      player_id = (SELECT p.id FROM profiles p WHERE p.auth_user_id = (SELECT auth.uid()))
      OR EXISTS (
        SELECT 1 FROM team_members tm JOIN profiles p ON p.id = tm.profile_id
        WHERE tm.team_id = conversations.team_id
          AND p.auth_user_id = (SELECT auth.uid())
      )
    )
  );

-- A4. market_player_posts (INSERT)
DROP POLICY IF EXISTS market_player_posts_insert_own ON public.market_player_posts;
CREATE POLICY market_player_posts_insert_own ON public.market_player_posts
  FOR INSERT TO authenticated
  WITH CHECK (
    profile_id = (SELECT p.id FROM profiles p WHERE p.auth_user_id = (SELECT auth.uid()))
  );

-- A5. market_team_posts (INSERT)
DROP POLICY IF EXISTS market_team_posts_insert_by_team_admin ON public.market_team_posts;
CREATE POLICY market_team_posts_insert_by_team_admin ON public.market_team_posts
  FOR INSERT TO authenticated
  WITH CHECK (
    created_by = (SELECT p.id FROM profiles p WHERE p.auth_user_id = (SELECT auth.uid()))
    AND EXISTS (
      SELECT 1 FROM team_members tm JOIN profiles p ON p.id = tm.profile_id
      WHERE tm.team_id = market_team_posts.team_id
        AND p.auth_user_id = (SELECT auth.uid())
        AND tm.role IN ('CAPITAN', 'SUBCAPITAN')
    )
  );

-- A6. match_participants (INSERT)
DROP POLICY IF EXISTS match_participants_insert_by_team_admin_or_guest ON public.match_participants;
CREATE POLICY match_participants_insert_by_team_admin_or_guest ON public.match_participants
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM team_members tm JOIN profiles p ON p.id = tm.profile_id
      WHERE tm.team_id = match_participants.team_id
        AND p.auth_user_id = (SELECT auth.uid())
        AND tm.role IN ('CAPITAN', 'SUBCAPITAN')
    )
    OR (
      is_guest = true
      AND profile_id = (SELECT p.id FROM profiles p WHERE p.auth_user_id = (SELECT auth.uid()))
    )
  );

-- A7. match_proposals (INSERT)
DROP POLICY IF EXISTS match_proposals_insert_by_from_team_admin ON public.match_proposals;
CREATE POLICY match_proposals_insert_by_from_team_admin ON public.match_proposals
  FOR INSERT TO authenticated
  WITH CHECK (
    proposed_by = (SELECT p.id FROM profiles p WHERE p.auth_user_id = (SELECT auth.uid()))
    AND EXISTS (
      SELECT 1 FROM team_members tm JOIN profiles p ON p.id = tm.profile_id
      WHERE tm.team_id = match_proposals.from_team_id
        AND p.auth_user_id = (SELECT auth.uid())
        AND tm.role IN ('CAPITAN', 'SUBCAPITAN')
    )
  );

-- A8. match_results (INSERT) — roles originales: public
DROP POLICY IF EXISTS match_results_insert_by_authorized_member ON public.match_results;
CREATE POLICY match_results_insert_by_authorized_member ON public.match_results
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM matches m
      WHERE m.id = match_results.match_id
        AND m.status IN ('EN_VIVO', 'FINALIZADO', 'EN_DISPUTA')
    )
    AND (
      EXISTS (
        SELECT 1 FROM team_members tm JOIN profiles p ON p.id = tm.profile_id
        WHERE tm.team_id = match_results.team_id
          AND p.auth_user_id = (SELECT auth.uid())
          AND tm.role IN ('CAPITAN', 'SUBCAPITAN')
      )
      OR EXISTS (
        SELECT 1 FROM match_participants mp JOIN profiles p ON p.id = mp.profile_id
        WHERE mp.match_id = match_results.match_id
          AND mp.team_id = match_results.team_id
          AND mp.is_result_loader = true
          AND p.auth_user_id = (SELECT auth.uid())
      )
    )
  );

-- A9. messages (INSERT) — roles originales: public
DROP POLICY IF EXISTS messages_insert_conversation_members ON public.messages;
CREATE POLICY messages_insert_conversation_members ON public.messages
  FOR INSERT
  WITH CHECK (
    sender_profile_id = (SELECT p.id FROM profiles p WHERE p.auth_user_id = (SELECT auth.uid()))
    AND EXISTS (
      SELECT 1 FROM conversations c
      WHERE c.id = messages.conversation_id
        AND (
          (c.type = 'MARKET_DM' AND c.player_id = (SELECT p.id FROM profiles p WHERE p.auth_user_id = (SELECT auth.uid())))
          OR (c.type = 'MARKET_DM' AND EXISTS (
                SELECT 1 FROM team_members tm JOIN profiles p ON p.id = tm.profile_id
                WHERE tm.team_id = c.team_id
                  AND p.auth_user_id = (SELECT auth.uid())
                  AND tm.role IN ('CAPITAN', 'SUBCAPITAN')
              ))
          OR (c.type = 'MATCH_CHAT' AND EXISTS (
                SELECT 1 FROM team_members tm JOIN profiles p ON p.id = tm.profile_id
                WHERE tm.team_id IN (
                        SELECT matches.team_a_id FROM matches WHERE matches.id = c.match_id
                        UNION
                        SELECT matches.team_b_id FROM matches WHERE matches.id = c.match_id
                      )
                  AND p.auth_user_id = (SELECT auth.uid())
                  AND tm.role IN ('CAPITAN', 'SUBCAPITAN')
              ))
        )
    )
  );

-- A10. profiles (INSERT) — roles originales: public
DROP POLICY IF EXISTS profiles_insert_own ON public.profiles;
CREATE POLICY profiles_insert_own ON public.profiles
  FOR INSERT
  WITH CHECK ((SELECT auth.uid()) = auth_user_id);

-- A11. result_dispute_votes (INSERT)
DROP POLICY IF EXISTS result_dispute_votes_insert_participants ON public.result_dispute_votes;
CREATE POLICY result_dispute_votes_insert_participants ON public.result_dispute_votes
  FOR INSERT TO authenticated
  WITH CHECK (
    voter_id = (SELECT p.id FROM profiles p WHERE p.auth_user_id = (SELECT auth.uid()))
    AND EXISTS (
      SELECT 1 FROM team_members tm JOIN profiles p ON p.id = tm.profile_id
      WHERE tm.team_id IN (
              SELECT matches.team_a_id FROM matches WHERE matches.id = result_dispute_votes.match_id
              UNION
              SELECT matches.team_b_id FROM matches WHERE matches.id = result_dispute_votes.match_id
            )
        AND p.auth_user_id = (SELECT auth.uid())
    )
  );

-- A12. team_join_requests (INSERT)
DROP POLICY IF EXISTS team_join_requests_insert_own_pending ON public.team_join_requests;
CREATE POLICY team_join_requests_insert_own_pending ON public.team_join_requests
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = team_join_requests.profile_id
        AND p.auth_user_id = (SELECT auth.uid())
    )
    AND status = 'PENDIENTE'
  );

-- ─────────────────────────────────────────────────────────────
-- B) Consolidación de políticas permisivas duplicadas
--    (USING con OR + WITH CHECK con OR = semántica idéntica)
-- ─────────────────────────────────────────────────────────────

-- B1. challenges UPDATE: cancela el admin emisor / rechaza el admin receptor.
DROP POLICY IF EXISTS challenges_update_cancel_by_sender ON public.challenges;
DROP POLICY IF EXISTS challenges_update_reject_by_receiver ON public.challenges;
CREATE POLICY challenges_update_by_involved_admin ON public.challenges
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM team_members tm JOIN profiles p ON p.id = tm.profile_id
      WHERE tm.team_id IN (challenges.from_team_id, challenges.to_team_id)
        AND p.auth_user_id = (SELECT auth.uid())
        AND tm.role IN ('CAPITAN', 'SUBCAPITAN')
    )
  )
  WITH CHECK (
    (
      status = 'CANCELADA'
      AND EXISTS (
        SELECT 1 FROM team_members tm JOIN profiles p ON p.id = tm.profile_id
        WHERE tm.team_id = challenges.from_team_id
          AND p.auth_user_id = (SELECT auth.uid())
          AND tm.role IN ('CAPITAN', 'SUBCAPITAN')
      )
    )
    OR (
      status = 'RECHAZADA'
      AND EXISTS (
        SELECT 1 FROM team_members tm JOIN profiles p ON p.id = tm.profile_id
        WHERE tm.team_id = challenges.to_team_id
          AND p.auth_user_id = (SELECT auth.uid())
          AND tm.role IN ('CAPITAN', 'SUBCAPITAN')
      )
    )
  );

-- B2. match_proposals UPDATE: cancela el emisor (-> RECHAZADA) / responde el
--     admin del equipo rival del partido.
DROP POLICY IF EXISTS match_proposals_cancel_by_sender ON public.match_proposals;
DROP POLICY IF EXISTS match_proposals_update_by_other_team_admin ON public.match_proposals;
CREATE POLICY match_proposals_update_by_involved_admin ON public.match_proposals
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM team_members tm JOIN profiles p ON p.id = tm.profile_id
      WHERE tm.team_id = match_proposals.from_team_id
        AND p.auth_user_id = (SELECT auth.uid())
        AND tm.role IN ('CAPITAN', 'SUBCAPITAN')
    )
    OR EXISTS (
      SELECT 1 FROM team_members tm JOIN profiles p ON p.id = tm.profile_id
      WHERE tm.team_id IN (
              SELECT matches.team_a_id FROM matches WHERE matches.id = match_proposals.match_id
              UNION
              SELECT matches.team_b_id FROM matches WHERE matches.id = match_proposals.match_id
            )
        AND tm.team_id <> match_proposals.from_team_id
        AND p.auth_user_id = (SELECT auth.uid())
        AND tm.role IN ('CAPITAN', 'SUBCAPITAN')
    )
  )
  WITH CHECK (
    (
      status = 'RECHAZADA'
      AND EXISTS (
        SELECT 1 FROM team_members tm JOIN profiles p ON p.id = tm.profile_id
        WHERE tm.team_id = match_proposals.from_team_id
          AND p.auth_user_id = (SELECT auth.uid())
          AND tm.role IN ('CAPITAN', 'SUBCAPITAN')
      )
    )
    OR EXISTS (
      SELECT 1 FROM team_members tm JOIN profiles p ON p.id = tm.profile_id
      WHERE tm.team_id IN (
              SELECT matches.team_a_id FROM matches WHERE matches.id = match_proposals.match_id
              UNION
              SELECT matches.team_b_id FROM matches WHERE matches.id = match_proposals.match_id
            )
        AND tm.team_id <> match_proposals.from_team_id
        AND p.auth_user_id = (SELECT auth.uid())
        AND tm.role IN ('CAPITAN', 'SUBCAPITAN')
    )
  );

-- B3. team_join_requests UPDATE: el admin del equipo resuelve / el dueño
--     puede tocar su solicitud mientras siga PENDIENTE.
DROP POLICY IF EXISTS team_join_requests_update_by_team_admin ON public.team_join_requests;
DROP POLICY IF EXISTS team_join_requests_update_own_to_pending ON public.team_join_requests;
CREATE POLICY team_join_requests_update_by_admin_or_owner ON public.team_join_requests
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM team_members tm JOIN profiles p ON p.id = tm.profile_id
      WHERE tm.team_id = team_join_requests.team_id
        AND p.auth_user_id = (SELECT auth.uid())
        AND tm.role IN ('CAPITAN', 'SUBCAPITAN')
    )
    OR EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = team_join_requests.profile_id
        AND p.auth_user_id = (SELECT auth.uid())
    )
  )
  WITH CHECK (
    (
      EXISTS (
        SELECT 1 FROM team_members tm JOIN profiles p ON p.id = tm.profile_id
        WHERE tm.team_id = team_join_requests.team_id
          AND p.auth_user_id = (SELECT auth.uid())
          AND tm.role IN ('CAPITAN', 'SUBCAPITAN')
      )
      AND status IN ('PENDIENTE', 'ACEPTADA', 'RECHAZADA')
    )
    OR (
      EXISTS (
        SELECT 1 FROM profiles p
        WHERE p.id = team_join_requests.profile_id
          AND p.auth_user_id = (SELECT auth.uid())
      )
      AND status = 'PENDIENTE'
    )
  );

-- B4. team_members INSERT: bootstrap del capitán fundador / alta por el
--     admin desde una solicitud de unión.
DROP POLICY IF EXISTS team_members_insert_bootstrap_captain ON public.team_members;
DROP POLICY IF EXISTS team_members_insert_by_team_admin_from_request ON public.team_members;
CREATE POLICY team_members_insert_bootstrap_or_from_request ON public.team_members
  FOR INSERT TO authenticated
  WITH CHECK (
    (
      role = 'CAPITAN'
      AND EXISTS (
        SELECT 1 FROM profiles p
        WHERE p.id = team_members.profile_id
          AND p.auth_user_id = (SELECT auth.uid())
      )
      AND NOT EXISTS (
        SELECT 1 FROM team_members tm WHERE tm.team_id = team_members.team_id
      )
    )
    OR (
      role IN ('JUGADOR', 'SUBCAPITAN', 'DIRECTOR_TECNICO')
      AND EXISTS (
        SELECT 1 FROM team_members tm_admin JOIN profiles p_admin ON p_admin.id = tm_admin.profile_id
        WHERE tm_admin.team_id = team_members.team_id
          AND p_admin.auth_user_id = (SELECT auth.uid())
          AND tm_admin.role IN ('CAPITAN', 'SUBCAPITAN')
      )
      AND EXISTS (
        SELECT 1 FROM team_join_requests r
        WHERE r.team_id = team_members.team_id
          AND r.profile_id = team_members.profile_id
          AND r.status IN ('PENDIENTE', 'ACEPTADA')
      )
    )
  );
