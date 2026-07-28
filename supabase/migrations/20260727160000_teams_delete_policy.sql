-- ============================================================
-- teams: policy de DELETE para el capitan que se queda solo — 2026-07-27
-- ------------------------------------------------------------
-- Sintoma:
--   El capitan unico miembro elige "Abandonar equipo" -> la app ofrece eliminar
--   el equipo, muestra "Equipo eliminado correctamente" y navega al perfil...
--   pero el equipo sigue existiendo.
--
-- Causa:
--   `public.teams` tiene RLS habilitado y policies de INSERT / SELECT / UPDATE,
--   pero NINGUNA de DELETE. Un DELETE sin policy que lo habilite no es un error
--   en Postgres: simplemente no matchea ninguna fila. PostgREST devuelve 204 sin
--   `error`, y lib/team-manage-data.ts -> deleteTeam() solo mira `error`, asi que
--   el cliente lo interpreta como exito.
--
--   Es la misma clase de bug que el de storage: la operacion "funciona" pero no
--   hace nada, porque RLS filtra en vez de rechazar.
--
-- Fix:
--   Habilitar DELETE solo para el CAPITAN y solo cuando es el ultimo miembro,
--   que es exactamente el unico caso donde la app lo ofrece
--   (app/team-manage.tsx -> startLeaveFlow). El chequeo de "ultimo miembro" no
--   es decorativo: sin el, un capitan podria borrar por API un equipo con
--   plantel y arrastrar en cascada a sus miembros.
--
--   El cliente ademas pasa a verificar filas afectadas (deleteTeam), asi que si
--   esta policy volviera a faltar el error seria visible en vez de silencioso.
-- ============================================================

DROP POLICY IF EXISTS "teams_delete_by_captain_when_last_member" ON public.teams;
CREATE POLICY "teams_delete_by_captain_when_last_member"
  ON public.teams FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.team_members tm
      JOIN public.profiles p ON p.id = tm.profile_id
      WHERE tm.team_id = teams.id
        AND p.auth_user_id = (SELECT auth.uid())
        AND tm.role = 'CAPITAN'
    )
    AND (SELECT count(*) FROM public.team_members tm2 WHERE tm2.team_id = teams.id) = 1
  );
