-- ============================================================
-- P4 — POSTULACIONES FORMALES EN MERCADO — 2026-07-08
-- "Postularme"/"Contactarme" hoy sólo abre un chat, sin dejar ningún
-- registro. Esta migración agrega un registro formal de postulación
-- con estado (PENDIENTE/VISTA/ACEPTADA/RECHAZADA) para que el dueño de
-- la publicación pueda ver y gestionar a todos los interesados, sin
-- reemplazar el chat existente (se sigue abriendo igual que hoy).
--
-- Dos tablas — una por tipo de post — en vez de una tabla polimórfica,
-- siguiendo la misma convención que ya usa el propio Mercado
-- (market_team_posts / market_player_posts separadas).
--
-- Sin RPCs: insert/update directos protegidos por RLS, mismo patrón que
-- createTeamPost/createPlayerPost en lib/market-api.ts.
-- ============================================================

-- ─── 1. Tablas ─────────────────────────────────────────────────────────────

CREATE TABLE public.market_team_post_applications (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.market_team_posts(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'PENDIENTE' check (status in ('PENDIENTE','VISTA','ACEPTADA','RECHAZADA')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (post_id, profile_id)
);

CREATE TABLE public.market_player_post_applications (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.market_player_posts(id) on delete cascade,
  team_id uuid not null references public.teams(id) on delete cascade,
  applicant_profile_id uuid not null references public.profiles(id),
  status text not null default 'PENDIENTE' check (status in ('PENDIENTE','VISTA','ACEPTADA','RECHAZADA')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (post_id, team_id)
);

-- ─── 2. Índices en FKs (evita repetir el hallazgo del P2) ────────────────────
CREATE INDEX idx_market_team_post_applications_post_id ON public.market_team_post_applications (post_id);
CREATE INDEX idx_market_team_post_applications_profile_id ON public.market_team_post_applications (profile_id);
CREATE INDEX idx_market_player_post_applications_post_id ON public.market_player_post_applications (post_id);
CREATE INDEX idx_market_player_post_applications_team_id ON public.market_player_post_applications (team_id);
CREATE INDEX idx_market_player_post_applications_applicant_profile_id ON public.market_player_post_applications (applicant_profile_id);

-- ─── 3. updated_at automático (reusa la función existente set_updated_at) ───
CREATE TRIGGER market_team_post_applications_updated_at
  BEFORE UPDATE ON public.market_team_post_applications
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER market_player_post_applications_updated_at
  BEFORE UPDATE ON public.market_player_post_applications
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ─── 4. RLS ──────────────────────────────────────────────────────────────────
ALTER TABLE public.market_team_post_applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.market_player_post_applications ENABLE ROW LEVEL SECURITY;

-- market_team_post_applications: un jugador se postula a un post de equipo
CREATE POLICY "market_team_post_applications_select" ON public.market_team_post_applications FOR SELECT
  USING (
    profile_id = (SELECT id FROM profiles WHERE auth_user_id = (SELECT auth.uid()))
    OR EXISTS (
      SELECT 1 FROM market_team_posts p
      JOIN team_members tm ON tm.team_id = p.team_id
      JOIN profiles adm ON adm.id = tm.profile_id
      WHERE p.id = market_team_post_applications.post_id
        AND adm.auth_user_id = (SELECT auth.uid())
        AND tm.role IN ('CAPITAN','SUBCAPITAN')
    )
  );

CREATE POLICY "market_team_post_applications_insert" ON public.market_team_post_applications FOR INSERT
  TO authenticated
  WITH CHECK (
    profile_id = (SELECT id FROM profiles WHERE auth_user_id = (SELECT auth.uid()))
  );

CREATE POLICY "market_team_post_applications_update_by_post_admin" ON public.market_team_post_applications FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM market_team_posts p
      JOIN team_members tm ON tm.team_id = p.team_id
      JOIN profiles adm ON adm.id = tm.profile_id
      WHERE p.id = market_team_post_applications.post_id
        AND adm.auth_user_id = (SELECT auth.uid())
        AND tm.role IN ('CAPITAN','SUBCAPITAN')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM market_team_posts p
      JOIN team_members tm ON tm.team_id = p.team_id
      JOIN profiles adm ON adm.id = tm.profile_id
      WHERE p.id = market_team_post_applications.post_id
        AND adm.auth_user_id = (SELECT auth.uid())
        AND tm.role IN ('CAPITAN','SUBCAPITAN')
    )
  );

-- market_player_post_applications: un equipo (capitán) se postula a un post de jugador
CREATE POLICY "market_player_post_applications_select" ON public.market_player_post_applications FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM team_members tm
      JOIN profiles p ON p.id = tm.profile_id
      WHERE tm.team_id = market_player_post_applications.team_id
        AND p.auth_user_id = (SELECT auth.uid())
    )
    OR EXISTS (
      SELECT 1 FROM market_player_posts mp
      JOIN profiles owner ON owner.id = mp.profile_id
      WHERE mp.id = market_player_post_applications.post_id
        AND owner.auth_user_id = (SELECT auth.uid())
    )
  );

CREATE POLICY "market_player_post_applications_insert" ON public.market_player_post_applications FOR INSERT
  TO authenticated
  WITH CHECK (
    applicant_profile_id = (SELECT id FROM profiles WHERE auth_user_id = (SELECT auth.uid()))
    AND EXISTS (
      SELECT 1 FROM team_members tm
      JOIN profiles p ON p.id = tm.profile_id
      WHERE tm.team_id = market_player_post_applications.team_id
        AND p.auth_user_id = (SELECT auth.uid())
        AND tm.role IN ('CAPITAN','SUBCAPITAN')
    )
  );

CREATE POLICY "market_player_post_applications_update_by_post_owner" ON public.market_player_post_applications FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM market_player_posts mp
      JOIN profiles owner ON owner.id = mp.profile_id
      WHERE mp.id = market_player_post_applications.post_id
        AND owner.auth_user_id = (SELECT auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM market_player_posts mp
      JOIN profiles owner ON owner.id = mp.profile_id
      WHERE mp.id = market_player_post_applications.post_id
        AND owner.auth_user_id = (SELECT auth.uid())
    )
  );

-- ─── 5. Nuevos tipos de notificación ──────────────────────────────────────────
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'POSTULACION_RECIBIDA';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'POSTULACION_RESPONDIDA';

-- ─── 6. notifications RLS — 2 ramas nuevas (postulaciones) ───────────────────
DROP POLICY IF EXISTS "notifications_insert_authenticated" ON public.notifications;

CREATE POLICY "notifications_insert_authenticated" ON public.notifications FOR INSERT
  TO authenticated
  WITH CHECK (
    -- (a) mismo equipo: notificaciones de gestión (aceptado / rol / expulsado)
    EXISTS (
      SELECT 1 FROM team_members tm_r
      JOIN team_members tm_c ON tm_c.team_id = tm_r.team_id
      JOIN profiles p_c ON p_c.id = tm_c.profile_id
      WHERE tm_r.profile_id = notifications.profile_id
        AND p_c.auth_user_id = (SELECT auth.uid())
        AND tm_c.role IN ('CAPITAN', 'SUBCAPITAN')
    )
    OR
    -- (b) solicitud de unión pendiente -> admin del equipo destino
    EXISTS (
      SELECT 1 FROM team_join_requests r
      JOIN profiles p_req ON p_req.id = r.profile_id
      JOIN team_members tm_admin ON tm_admin.team_id = r.team_id
      JOIN profiles p_admin ON p_admin.id = tm_admin.profile_id
      WHERE p_admin.id = notifications.profile_id
        AND p_req.auth_user_id = (SELECT auth.uid())
        AND tm_admin.role IN ('CAPITAN', 'SUBCAPITAN')
    )
    OR
    -- (c) desafío entre equipos: admin de un lado notifica al admin del otro
    EXISTS (
      SELECT 1 FROM challenges c
      JOIN team_members tm_caller ON tm_caller.team_id IN (c.from_team_id, c.to_team_id)
      JOIN profiles p_caller ON p_caller.id = tm_caller.profile_id
      JOIN team_members tm_recipient ON tm_recipient.team_id IN (c.from_team_id, c.to_team_id)
        AND tm_recipient.team_id <> tm_caller.team_id
      WHERE p_caller.auth_user_id = (SELECT auth.uid())
        AND tm_recipient.profile_id = notifications.profile_id
        AND tm_caller.role IN ('CAPITAN', 'SUBCAPITAN')
        AND tm_recipient.role IN ('CAPITAN', 'SUBCAPITAN')
    )
    OR
    -- (d) partido entre equipos: admin de un lado notifica al admin del otro
    EXISTS (
      SELECT 1 FROM matches m
      JOIN team_members tm_caller ON tm_caller.team_id IN (m.team_a_id, m.team_b_id)
      JOIN profiles p_caller ON p_caller.id = tm_caller.profile_id
      JOIN team_members tm_recipient ON tm_recipient.team_id IN (m.team_a_id, m.team_b_id)
        AND tm_recipient.team_id <> tm_caller.team_id
      WHERE p_caller.auth_user_id = (SELECT auth.uid())
        AND tm_recipient.profile_id = notifications.profile_id
        AND tm_caller.role IN ('CAPITAN', 'SUBCAPITAN')
        AND tm_recipient.role IN ('CAPITAN', 'SUBCAPITAN')
    )
    OR
    -- (e) postulación a un post de EQUIPO: postulante <-> admin del equipo dueño
    EXISTS (
      SELECT 1 FROM market_team_post_applications a
      JOIN market_team_posts p ON p.id = a.post_id
      JOIN team_members tm ON tm.team_id = p.team_id
      JOIN profiles p_admin ON p_admin.id = tm.profile_id
      JOIN profiles p_applicant ON p_applicant.id = a.profile_id
      WHERE tm.role IN ('CAPITAN', 'SUBCAPITAN')
        AND (
          (p_applicant.auth_user_id = (SELECT auth.uid()) AND p_admin.id = notifications.profile_id)
          OR
          (p_admin.auth_user_id = (SELECT auth.uid()) AND p_applicant.id = notifications.profile_id)
        )
    )
    OR
    -- (f) postulación a un post de JUGADOR: admin del equipo postulante <-> dueño del post
    EXISTS (
      SELECT 1 FROM market_player_post_applications a
      JOIN market_player_posts p ON p.id = a.post_id
      JOIN profiles p_applicant ON p_applicant.id = a.applicant_profile_id
      JOIN profiles p_owner ON p_owner.id = p.profile_id
      WHERE (p_applicant.auth_user_id = (SELECT auth.uid()) AND p_owner.id = notifications.profile_id)
         OR (p_owner.auth_user_id = (SELECT auth.uid()) AND p_applicant.id = notifications.profile_id)
    )
  );
