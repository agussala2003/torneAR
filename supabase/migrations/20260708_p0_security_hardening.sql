-- ============================================================
-- P0 SECURITY HARDENING — 2026-07-08
-- Cierra los hallazgos accionables del audit del 8 jul 2026:
--   WARN:  RLS Policy Always True (teams, notifications)
--   WARN:  Public Bucket Allows Listing (wo_evidences)
-- Captura también el estado de 2 políticas que existían sólo en
-- producción (creadas fuera de cualquier migración): esta migración
-- las reemplaza y deja el repo sincronizado con la DB real.
--
-- NOTA — spatial_ref_sys (ERROR: RLS Disabled in Public) queda FUERA de esta
-- migración a propósito: el rol usado para aplicar migraciones no es owner
-- de esa tabla (la crea la extensión PostGIS, dueña = supabase_admin). El
-- ALTER TABLE ... ENABLE ROW LEVEL SECURITY falla con "must be owner of
-- table spatial_ref_sys" vía la API de migraciones. Pendiente: correrlo a
-- mano desde el SQL Editor del Dashboard de Supabase (ahí sí corre como
-- supabase_admin):
--   ALTER TABLE public.spatial_ref_sys ENABLE ROW LEVEL SECURITY;
--   CREATE POLICY "spatial_ref_sys_public_read" ON public.spatial_ref_sys
--     FOR SELECT USING (true);
-- ============================================================

-- ─── 1. teams — pinear columnas de rating a sus defaults seguros ─────────────
-- La política anterior (WITH CHECK true) permitía que un INSERT directo a la
-- REST API fijara elo_rating/fair_play_score/season_* a cualquier valor.
-- El frontend (lib/team-create-data.ts) nunca manda esas columnas — confía
-- en los defaults de la tabla. Este check los hace obligatorios.
DROP POLICY IF EXISTS "teams_insert_authenticated" ON public.teams;

CREATE POLICY "teams_insert_authenticated" ON public.teams FOR INSERT
  TO authenticated
  WITH CHECK (
    elo_rating = 1000
    AND matches_played = 0
    AND fair_play_score = 100.0
    AND season_wins = 0
    AND season_losses = 0
    AND season_draws = 0
    AND season_goals_for = 0
    AND season_goals_against = 0
    AND in_ranking = true
  );

-- ─── 2. notifications — reemplazar WITH CHECK(true) por relaciones reales ────
-- Los 4 call sites reales que insertan notificaciones para OTRO profile_id
-- (challenge-actions.ts, team-manage-data.ts x3, team-join-data.ts) caen en
-- exactamente 3 patrones relacionales. Cualquier INSERT que no calce en
-- ninguno de los tres es rechazado.
--
-- Nota: si se agrega un tipo de notificación nuevo con una relación distinta
-- a las de abajo, el INSERT va a fallar hasta sumar una rama nueva acá.
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
  );

-- ─── 3. storage.objects — sacar el listado público de wo_evidences ──────────
-- El bucket es público (storage.buckets.public = true), así que getPublicUrl
-- funciona sin esta policy. La policy sólo habilitaba enumerar (.list()) todo
-- el contenido del bucket vía la Storage API — evidencia de disputas ajenas.
DROP POLICY IF EXISTS "Evidencias WO son publicas" ON storage.objects;
