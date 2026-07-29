-- ============================================================
-- R4 — ESCALADA DE PRIVILEGIOS EN team_members — 2026-07-28
-- ------------------------------------------------------------
-- Hallazgo (auditoria_dominio.md, bloqueante R4):
--   La policy `team_members_update_by_team_admin` (20260401015725:599-616)
--   autorizaba a CAPITAN **y SUBCAPITAN** a hacer UPDATE de CUALQUIER fila de
--   su equipo —incluida la propia y la del capitán— y NO acotaba el valor de
--   la columna `role`. Toda la jerarquía real vivía sólo en el cliente:
--     · lib/team-helpers.ts:35-46  (canManageMember)
--     · lib/team-helpers.ts:48-57  (allowedRolesToAssign)
--
--   Un PATCH directo a la REST API bastaba para escalar:
--     PATCH /team_members?team_id=eq.<T>&profile_id=eq.<yo>  {"role":"CAPITAN"}
--
--   Cadena completa del ataque: el subcapitán se auto-promueve a CAPITAN, o
--   degrada al capitán a JUGADOR y después lo expulsa (remove_team_member sólo
--   protege a quien TIENE el rol CAPITAN en ese momento).
--
-- ── Fix ─────────────────────────────────────────────────────────────────────
-- Se sube al servidor la misma jerarquía que ya aplicaba el cliente:
--
--   CAPITAN     → puede actualizar cualquier fila del equipo, con cualquier
--                 rol destino. Sin cambios respecto de hoy: es el único que
--                 puede crear un CAPITAN, y es lo que necesita
--                 grantCaptainRole() (promueve al nuevo y se degrada a sí
--                 mismo a SUBCAPITAN, ambos updates con el caller aún CAPITAN).
--   SUBCAPITAN  → sólo puede actualizar filas cuyo rol ACTUAL sea JUGADOR o
--                 DIRECTOR_TECNICO, y sólo puede asignar JUGADOR o
--                 DIRECTOR_TECNICO.
--   Resto       → sin UPDATE (igual que hoy).
--
-- ── Por qué se acota también el USING y no sólo el WITH CHECK ───────────────
-- El pedido original era acotar el WITH CHECK (qué rol se puede asignar). Eso
-- solo cierra la auto-promoción, pero deja viva la otra mitad del mismo
-- hallazgo: un SUBCAPITAN podía seguir degradando al CAPITAN a JUGADOR. No
-- ganaría la capitanía (el WITH CHECK se lo impide), pero dejaría al equipo
-- DECAPITADO de forma permanente: sin un CAPITAN vivo nadie puede volver a
-- crear uno (el único alta con role='CAPITAN' es el bootstrap del fundador,
-- que exige equipo vacío — ver team_members_insert_bootstrap_or_from_request).
-- Acotar el USING a filas JUGADOR/DIRECTOR_TECNICO replica exactamente
-- canManageMember() y el invariante que remove_team_member() ya defiende para
-- las bajas (CANNOT_REMOVE_CAPTAIN / sólo el capitán remueve a un subcapitán).
--
-- ── Qué NO cambia ───────────────────────────────────────────────────────────
-- · Las cuatro RPCs de membresía (leave_team_as_member, remove_team_member,
--   transfer_to_team, transfer_captaincy_and_leave) son SECURITY DEFINER y
--   bypassean RLS: siguen funcionando igual.
-- · El flujo de UI de team-manage.tsx no se toca: el cliente ya no ofrecía
--   ninguna de las acciones que esta policy pasa a rechazar.
-- · Se conserva el patrón `(SELECT auth.uid())` de 20260714144056 para que el
--   planner evalúe el uid una sola vez por query (initplan) y no por fila.
-- ============================================================

DROP POLICY IF EXISTS "team_members_update_by_team_admin" ON public.team_members;

CREATE POLICY "team_members_update_by_team_admin" ON public.team_members
  FOR UPDATE
  USING (
    -- (a) CAPITAN del equipo: cualquier fila, incluida la propia.
    EXISTS (
      SELECT 1 FROM team_members tm_admin
      JOIN profiles p_admin ON p_admin.id = tm_admin.profile_id
      WHERE tm_admin.team_id = team_members.team_id
        AND p_admin.auth_user_id = (SELECT auth.uid())
        AND tm_admin.role = 'CAPITAN'
    )
    -- (b) SUBCAPITAN del equipo: sólo filas que HOY son JUGADOR / DIRECTOR_TECNICO.
    --     Su propia fila (SUBCAPITAN) y la del capitán quedan fuera del USING,
    --     así que ni siquiera son visibles para el UPDATE.
    OR (
      team_members.role IN ('JUGADOR', 'DIRECTOR_TECNICO')
      AND EXISTS (
        SELECT 1 FROM team_members tm_admin
        JOIN profiles p_admin ON p_admin.id = tm_admin.profile_id
        WHERE tm_admin.team_id = team_members.team_id
          AND p_admin.auth_user_id = (SELECT auth.uid())
          AND tm_admin.role = 'SUBCAPITAN'
      )
    )
  )
  WITH CHECK (
    -- (a) CAPITAN: sin restricción sobre el rol destino (único que crea CAPITAN).
    EXISTS (
      SELECT 1 FROM team_members tm_admin
      JOIN profiles p_admin ON p_admin.id = tm_admin.profile_id
      WHERE tm_admin.team_id = team_members.team_id
        AND p_admin.auth_user_id = (SELECT auth.uid())
        AND tm_admin.role = 'CAPITAN'
    )
    -- (b) SUBCAPITAN: el rol RESULTANTE sólo puede ser JUGADOR o DIRECTOR_TECNICO.
    --     Acá `team_members.role` es el valor NUEVO de la fila.
    OR (
      team_members.role IN ('JUGADOR', 'DIRECTOR_TECNICO')
      AND EXISTS (
        SELECT 1 FROM team_members tm_admin
        JOIN profiles p_admin ON p_admin.id = tm_admin.profile_id
        WHERE tm_admin.team_id = team_members.team_id
          AND p_admin.auth_user_id = (SELECT auth.uid())
          AND tm_admin.role = 'SUBCAPITAN'
      )
    )
  );

COMMENT ON POLICY "team_members_update_by_team_admin" ON public.team_members IS
  'Jerarquía de roles server-side (R4, 2026-07-28). CAPITAN: cualquier fila y cualquier rol destino. SUBCAPITAN: sólo filas JUGADOR/DIRECTOR_TECNICO y sólo puede asignar JUGADOR/DIRECTOR_TECNICO — no puede auto-promoverse ni degradar al capitán. Replica canManageMember()/allowedRolesToAssign() de lib/team-helpers.ts, que antes eran la única defensa y vivían en el cliente.';
