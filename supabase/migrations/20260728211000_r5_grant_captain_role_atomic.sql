-- ============================================================
-- R5 — CESION DE CAPITANIA ATOMICA (sin abandonar el equipo) — 2026-07-28
-- ------------------------------------------------------------
-- Hallazgo (auditoria_dominio.md, R5):
--   `grantCaptainRole()` (lib/team-manage-data.ts) hacia DOS UPDATE secuenciales
--   desde el cliente con rollback manual:
--
--       1) promover al nuevo a CAPITAN
--       2) degradar al actual a SUBCAPITAN
--       si (2) falla → intentar restaurar (1)
--
--   Entre (1) y (2) el equipo tiene DOS CAPITANES. Si (2) falla y el rollback
--   tambien —red caida, app cerrada, token vencido a mitad de camino— ese
--   estado transitorio se vuelve PERMANENTE. Y no es cosmetico: con dos
--   capitanes, `leave_team_as_member` deja irse a uno de los dos sin exigir
--   cesion (CAPTAIN_MUST_TRANSFER solo mira el rol propio), y la policy R4
--   le da a ambos poder total sobre cualquier fila del equipo.
--
--   La variante atomica ya existia para el caso "el capitan cede Y se va"
--   (`transfer_captaincy_and_leave`, 20260723123000). Esta migracion cubre el
--   caso que quedo afuera: ceder QUEDANDOSE en el plantel.
--
-- ── Diseño ──────────────────────────────────────────────────────────────────
-- Misma familia que las cuatro RPCs de membresia: SECURITY DEFINER, perfil del
-- caller resuelto con `current_profile_id()`, errores con prefijo estable
-- ("CODIGO: detalle") que lib/team-manage-data.ts ya mapea a mensaje.
--
-- Los dos UPDATE viven en el cuerpo de una funcion plpgsql, o sea en UNA
-- transaccion: o el equipo termina con el nuevo capitan y el viejo subcapitan,
-- o no cambia nada. No hay ventana con dos capitanes observable desde afuera.
--
-- ── Por que NO reusa `transfer_captaincy_and_leave` ─────────────────────────
-- Aquella BORRA la fila del capitan saliente y cierra su ciclo en team_stints
-- con motivo ABANDONO. Aca el capitan se queda: no hay baja, no hay ciclo que
-- cerrar y el GUC `tornear.leave_reason` NO se toca. Cualquier intento de
-- reusarla ensuciaria el ledger con un ABANDONO + un alta nueva.
--
-- ── FOR UPDATE en las dos filas ─────────────────────────────────────────────
-- Se bloquean ambas filas (la del caller y la del destinatario) antes de
-- escribir. Serializa contra un `remove_team_member` o un
-- `transfer_captaincy_and_leave` concurrente: sin el lock, dos cesiones
-- simultaneas del mismo capitan a dos jugadores distintos podrian dejar tres
-- filas CAPITAN. El orden de los locks es fijo (primero el caller, despues el
-- destinatario) para no abrir un deadlock entre dos llamadas cruzadas.
--
-- ── Nota sobre la policy R4 ─────────────────────────────────────────────────
-- SECURITY DEFINER bypassea RLS, asi que la funcion replica a mano el
-- invariante que `team_members_update_by_team_admin` (20260728160000) defiende:
-- solo un CAPITAN puede crear otro CAPITAN. Aca ademas se estrecha mas — el
-- caller tiene que ser el capitan DE ESE equipo y el destinatario un miembro
-- vivo del mismo plantel.
-- ============================================================

CREATE OR REPLACE FUNCTION public.grant_captain_role(
  p_team_id                uuid,
  p_new_captain_profile_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_caller_id       uuid;
  v_new_prev_role   team_role;
BEGIN
  v_caller_id := public.current_profile_id();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'PROFILE_NOT_FOUND: perfil no encontrado para el usuario actual';
  END IF;

  IF p_team_id IS NULL OR p_new_captain_profile_id IS NULL THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: el equipo y el nuevo capitan son obligatorios';
  END IF;

  IF p_new_captain_profile_id = v_caller_id THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: no podes cederte la capitania a vos mismo';
  END IF;

  -- Lock 1 — la fila del caller. Ademas de serializar, es la verificacion de
  -- autorizacion: si no es CAPITAN de este equipo, no hay fila y sale por acá.
  PERFORM 1
  FROM team_members
  WHERE team_id = p_team_id
    AND profile_id = v_caller_id
    AND role = 'CAPITAN'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_TEAM_CAPTAIN: solo el capitan puede ceder la capitania';
  END IF;

  -- Lock 2 — la fila del destinatario. Si lo expulsaron o se fue mientras la
  -- pantalla estaba abierta, la cesion se cae acá y no a mitad de camino.
  SELECT role INTO v_new_prev_role
  FROM team_members
  WHERE team_id = p_team_id AND profile_id = p_new_captain_profile_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_A_MEMBER: el nuevo capitan debe ser miembro del equipo';
  END IF;

  -- ── Las dos escrituras, misma transaccion ────────────────────────────────
  -- Este par es TODO el fix: si la segunda falla, la primera se deshace sola.
  -- El cliente hacia esto en dos viajes con rollback manual (grantCaptainRole).
  UPDATE team_members
  SET role = 'CAPITAN'
  WHERE team_id = p_team_id AND profile_id = p_new_captain_profile_id;

  UPDATE team_members
  SET role = 'SUBCAPITAN'
  WHERE team_id = p_team_id AND profile_id = v_caller_id;

  RETURN jsonb_build_object(
    'teamId',              p_team_id,
    'newCaptainId',        p_new_captain_profile_id,
    'newCaptainPrevRole',  v_new_prev_role,
    'previousCaptainId',   v_caller_id,
    'previousCaptainRole', 'SUBCAPITAN'
  );
END;
$$;

COMMENT ON FUNCTION public.grant_captain_role(uuid, uuid) IS
  'El capitan cede el rol a otro miembro y queda como SUBCAPITAN, sin abandonar el equipo. Atomico (R5, 2026-07-28): reemplaza al par UPDATE+UPDATE del cliente, cuyo fallo entre pasos dejaba al equipo con dos capitanes de forma permanente. No toca team_stints: nadie se va, no hay ciclo que cerrar.';

REVOKE EXECUTE ON FUNCTION public.grant_captain_role(uuid, uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.grant_captain_role(uuid, uuid) TO authenticated;
