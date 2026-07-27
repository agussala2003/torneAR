-- ============================================================
-- BUG 6 — SALIDA DE EQUIPO CON MOTIVO / TRANSFERENCIAS — 2026-07-23
-- ------------------------------------------------------------
-- Sintoma QA: `trotamundos` tiene un historial perfecto de ciclos cerrados
-- (TRANSFERENCIA, ABANDONO) pero la app no tiene ningun flujo para producirlo.
--
-- Causa raiz: la infraestructura ya existe desde 2026-07-15 (ledger
-- team_stints + triggers trg_team_members_open_stint / _close_stint). Lo que
-- falta es la CAPA DE INTENCION. close_team_stint lee el motivo asi:
--     v_reason := nullif(current_setting('tornear.leave_reason', true), '')
--                 ::stint_leave_reason;
--     ... leave_reason = coalesce(v_reason, 'ABANDONO')
-- Nadie seteaba nunca ese GUC: lib/team-manage-data.ts borraba team_members
-- directo desde el cliente, asi que TODA salida — expulsion, transferencia,
-- cesion de capitania — quedaba registrada como ABANDONO. El historial de
-- `trotamundos` solo existe porque el seed lo insertó a mano.
--
-- Decision de diseño: el motivo NO es una eleccion del usuario, es una
-- consecuencia del flujo que provoca la salida. Una puerta por motivo:
--
--   leave_team_as_member       "Abandonar equipo"          → ABANDONO
--   remove_team_member         capitan expulsa              → EXPULSADO
--   transfer_captaincy_and_leave  capitan cede y se va      → ABANDONO
--   transfer_to_team           aceptado en el mercado       → TRANSFERENCIA
--
-- La transferencia no es un boton: es la consecuencia de que el Mercado de
-- Pases te acepte mientras tenes un ciclo abierto.
--
-- ── Dos funciones fuera del plan original, y por que ────────────────────────
-- El REVOKE DELETE del final cierra el borrado directo desde el cliente. Ese
-- REVOKE rompe TRES flujos vivos de lib/team-manage-data.ts, no uno:
-- leaveTeam, removeMember (expulsion) y transferCaptain (cesion + salida).
-- Un REVOKE sin reemplazo para los tres deja features rotas en produccion, asi
-- que se agregan remove_team_member y transfer_captaincy_and_leave. Son el
-- complemento necesario del REVOKE, no scope nuevo.
--
-- ── Nota de seguridad sobre transfer_to_team ────────────────────────────────
-- La policy team_members_insert_bootstrap_or_from_request exige que el alta la
-- haga un CAPITAN/SUBCAPITAN del equipo destino Y que exista una solicitud.
-- Estas RPCs son SECURITY DEFINER y bypassean RLS, asi que transfer_to_team
-- replica el invariante a mano: exige una team_join_requests en estado
-- ACEPTADA. Sin ese chequeo, cualquier usuario autenticado podria insertarse en
-- cualquier equipo llamando la RPC directamente. Ver ⚠️ FASE 2 al pie.
-- ============================================================


-- ─── Helper interno: perfil del caller ───────────────────────────────────────
CREATE OR REPLACE FUNCTION public.current_profile_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT id FROM profiles WHERE auth_user_id = auth.uid() LIMIT 1;
$$;

REVOKE EXECUTE ON FUNCTION public.current_profile_id() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.current_profile_id() TO authenticated;


-- ═══════════════════════════════════════════════════════════════
-- 1. leave_team_as_member — "Abandonar equipo" (→ ABANDONO)
-- ═══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.leave_team_as_member(p_team_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_profile_id uuid;
  v_role       team_role;
  v_live       integer;
BEGIN
  v_profile_id := public.current_profile_id();
  IF v_profile_id IS NULL THEN
    RAISE EXCEPTION 'PROFILE_NOT_FOUND: perfil no encontrado para el usuario actual';
  END IF;

  -- FOR UPDATE: serializa contra un kick simultaneo del capitan.
  SELECT role INTO v_role
  FROM team_members
  WHERE team_id = p_team_id AND profile_id = v_profile_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_A_MEMBER: no sos miembro de este equipo';
  END IF;

  -- Un equipo sin capitan no puede presentar lista ni aceptar propuestas:
  -- el capitan debe ceder el rol antes de irse (transfer_captaincy_and_leave).
  IF v_role = 'CAPITAN' THEN
    RAISE EXCEPTION 'CAPTAIN_MUST_TRANSFER: cede la capitania antes de abandonar el equipo';
  END IF;

  -- No dejar un partido confirmado o en curso sin un jugador convocado.
  SELECT count(*) INTO v_live
  FROM match_participants mp
  JOIN matches m ON m.id = mp.match_id
  WHERE mp.profile_id = v_profile_id
    AND mp.team_id    = p_team_id
    AND m.status IN ('CONFIRMADO', 'EN_VIVO');

  IF v_live > 0 THEN
    RAISE EXCEPTION 'ACTIVE_MATCH: tenes % partido(s) confirmados o en curso con este equipo', v_live;
  END IF;

  -- El trigger trg_team_members_close_stint lee este GUC dentro de la MISMA
  -- transaccion. is_local = true → muere al commitear.
  PERFORM set_config('tornear.leave_reason', 'ABANDONO', true);

  DELETE FROM team_members
  WHERE team_id = p_team_id AND profile_id = v_profile_id;

  RETURN jsonb_build_object(
    'teamId',      p_team_id,
    'profileId',   v_profile_id,
    'leaveReason', 'ABANDONO'
  );
END;
$$;

COMMENT ON FUNCTION public.leave_team_as_member(uuid) IS
  'El jugador abandona un equipo. Cierra el ciclo en team_stints con motivo ABANDONO. Bloquea al CAPITAN (debe ceder primero) y a quien tenga partidos CONFIRMADO/EN_VIVO.';

REVOKE EXECUTE ON FUNCTION public.leave_team_as_member(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.leave_team_as_member(uuid) TO authenticated;


-- ═══════════════════════════════════════════════════════════════
-- 2. transfer_to_team — cierre + alta atomicos (→ TRANSFERENCIA)
-- ═══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.transfer_to_team(
  p_to_team_id   uuid,
  p_from_team_id uuid DEFAULT NULL   -- NULL = agente libre: solo alta, sin cierre
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_profile_id uuid;
  v_from_role  team_role;
  v_live       integer;
BEGIN
  v_profile_id := public.current_profile_id();
  IF v_profile_id IS NULL THEN
    RAISE EXCEPTION 'PROFILE_NOT_FOUND: perfil no encontrado para el usuario actual';
  END IF;

  IF p_to_team_id IS NULL THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: el equipo destino es obligatorio';
  END IF;

  IF p_from_team_id IS NOT NULL AND p_from_team_id = p_to_team_id THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: el equipo origen y destino son el mismo';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM teams WHERE id = p_to_team_id) THEN
    RAISE EXCEPTION 'TEAM_NOT_FOUND: el equipo destino no existe';
  END IF;

  IF EXISTS (
    SELECT 1 FROM team_members
    WHERE team_id = p_to_team_id AND profile_id = v_profile_id
  ) THEN
    RAISE EXCEPTION 'ALREADY_MEMBER: ya sos miembro del equipo destino';
  END IF;

  -- ⚠️ Invariante de autorizacion (replica de la policy RLS de INSERT).
  -- SECURITY DEFINER bypassea RLS: sin este chequeo cualquier authenticated
  -- podria meterse en cualquier plantel llamando la RPC. El consentimiento del
  -- club destino se materializa como una solicitud ya ACEPTADA por su admin.
  IF NOT EXISTS (
    SELECT 1 FROM team_join_requests r
    WHERE r.team_id    = p_to_team_id
      AND r.profile_id = v_profile_id
      AND r.status     = 'ACEPTADA'
  ) THEN
    RAISE EXCEPTION 'NOT_APPROVED: el equipo destino todavia no aprobo tu incorporacion';
  END IF;

  -- ── Cierre del ciclo anterior ────────────────────────────────────────────
  IF p_from_team_id IS NOT NULL THEN
    SELECT role INTO v_from_role
    FROM team_members
    WHERE team_id = p_from_team_id AND profile_id = v_profile_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'NOT_A_MEMBER: no sos miembro del equipo origen';
    END IF;

    IF v_from_role = 'CAPITAN' THEN
      RAISE EXCEPTION 'CAPTAIN_MUST_TRANSFER: cede la capitania antes de transferirte';
    END IF;

    SELECT count(*) INTO v_live
    FROM match_participants mp
    JOIN matches m ON m.id = mp.match_id
    WHERE mp.profile_id = v_profile_id
      AND mp.team_id    = p_from_team_id
      AND m.status IN ('CONFIRMADO', 'EN_VIVO');

    IF v_live > 0 THEN
      RAISE EXCEPTION 'ACTIVE_MATCH: tenes % partido(s) confirmados o en curso con el equipo origen', v_live;
    END IF;

    -- Misma transaccion que el INSERT de abajo: el jugador nunca queda sin club
    -- y el ledger registra TRANSFERENCIA en vez del ABANDONO por defecto.
    PERFORM set_config('tornear.leave_reason', 'TRANSFERENCIA', true);

    DELETE FROM team_members
    WHERE team_id = p_from_team_id AND profile_id = v_profile_id;
  END IF;

  -- ── Alta en el destino (abre ciclo nuevo via trg_..._open_stint) ─────────
  INSERT INTO team_members (team_id, profile_id, role)
  VALUES (p_to_team_id, v_profile_id, 'JUGADOR');

  RETURN jsonb_build_object(
    'profileId',   v_profile_id,
    'fromTeamId',  p_from_team_id,
    'toTeamId',    p_to_team_id,
    'leaveReason', CASE WHEN p_from_team_id IS NULL THEN NULL ELSE 'TRANSFERENCIA' END
  );
END;
$$;

COMMENT ON FUNCTION public.transfer_to_team(uuid, uuid) IS
  'Transferencia atomica: cierra el ciclo en el club origen con motivo TRANSFERENCIA y abre el nuevo en el destino. Exige una team_join_requests ACEPTADA para el destino (replica el invariante de la policy RLS de INSERT, que SECURITY DEFINER bypassea).';

REVOKE EXECUTE ON FUNCTION public.transfer_to_team(uuid, uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.transfer_to_team(uuid, uuid) TO authenticated;


-- ═══════════════════════════════════════════════════════════════
-- 3. remove_team_member — expulsion por el admin (→ EXPULSADO)
--    Complemento obligatorio del REVOKE DELETE (ver header).
-- ═══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.remove_team_member(
  p_team_id    uuid,
  p_profile_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_caller_id   uuid;
  v_caller_role team_role;
  v_target_role team_role;
BEGIN
  v_caller_id := public.current_profile_id();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'PROFILE_NOT_FOUND: perfil no encontrado para el usuario actual';
  END IF;

  IF p_profile_id = v_caller_id THEN
    RAISE EXCEPTION 'CANNOT_REMOVE_SELF: para salir del equipo usa leave_team_as_member';
  END IF;

  SELECT role INTO v_caller_role
  FROM team_members
  WHERE team_id = p_team_id AND profile_id = v_caller_id;

  IF v_caller_role IS NULL OR v_caller_role NOT IN ('CAPITAN', 'SUBCAPITAN') THEN
    RAISE EXCEPTION 'NOT_TEAM_ADMIN: solo el capitan o subcapitan puede expulsar miembros';
  END IF;

  SELECT role INTO v_target_role
  FROM team_members
  WHERE team_id = p_team_id AND profile_id = p_profile_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_A_MEMBER: ese jugador no pertenece al equipo';
  END IF;

  IF v_target_role = 'CAPITAN' THEN
    RAISE EXCEPTION 'CANNOT_REMOVE_CAPTAIN: no se puede expulsar al capitan del equipo';
  END IF;

  -- Un subcapitan no puede expulsar a otro subcapitan: evita que dos admins
  -- se echen mutuamente. Esa decision queda reservada al capitan.
  IF v_caller_role = 'SUBCAPITAN' AND v_target_role = 'SUBCAPITAN' THEN
    RAISE EXCEPTION 'NOT_TEAM_ADMIN: solo el capitan puede remover a un subcapitan';
  END IF;

  PERFORM set_config('tornear.leave_reason', 'EXPULSADO', true);

  DELETE FROM team_members
  WHERE team_id = p_team_id AND profile_id = p_profile_id;

  RETURN jsonb_build_object(
    'teamId',      p_team_id,
    'profileId',   p_profile_id,
    'leaveReason', 'EXPULSADO'
  );
END;
$$;

COMMENT ON FUNCTION public.remove_team_member(uuid, uuid) IS
  'El capitan/subcapitan expulsa a un miembro. Cierra el ciclo en team_stints con motivo EXPULSADO. Reemplaza al DELETE directo del cliente (revocado).';

REVOKE EXECUTE ON FUNCTION public.remove_team_member(uuid, uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.remove_team_member(uuid, uuid) TO authenticated;


-- ═══════════════════════════════════════════════════════════════
-- 4. transfer_captaincy_and_leave — cesion + salida (→ ABANDONO)
--    Complemento obligatorio del REVOKE DELETE (ver header).
-- ═══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.transfer_captaincy_and_leave(
  p_team_id       uuid,
  p_to_profile_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_caller_id uuid;
  v_live      integer;
BEGIN
  v_caller_id := public.current_profile_id();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'PROFILE_NOT_FOUND: perfil no encontrado para el usuario actual';
  END IF;

  IF p_to_profile_id = v_caller_id THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: no podes cederte la capitania a vos mismo';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM team_members
    WHERE team_id = p_team_id AND profile_id = v_caller_id AND role = 'CAPITAN'
    FOR UPDATE
  ) THEN
    RAISE EXCEPTION 'NOT_TEAM_CAPTAIN: solo el capitan puede ceder la capitania';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM team_members
    WHERE team_id = p_team_id AND profile_id = p_to_profile_id
  ) THEN
    RAISE EXCEPTION 'NOT_A_MEMBER: el nuevo capitan debe ser miembro del equipo';
  END IF;

  SELECT count(*) INTO v_live
  FROM match_participants mp
  JOIN matches m ON m.id = mp.match_id
  WHERE mp.profile_id = v_caller_id
    AND mp.team_id    = p_team_id
    AND m.status IN ('CONFIRMADO', 'EN_VIVO');

  IF v_live > 0 THEN
    RAISE EXCEPTION 'ACTIVE_MATCH: tenes % partido(s) confirmados o en curso con este equipo', v_live;
  END IF;

  -- Atomico: si algo falla, ni la promocion ni la salida quedan aplicadas.
  -- El cliente hacia esto en dos llamadas con rollback manual (transferCaptain).
  UPDATE team_members
  SET role = 'CAPITAN'
  WHERE team_id = p_team_id AND profile_id = p_to_profile_id;

  PERFORM set_config('tornear.leave_reason', 'ABANDONO', true);

  DELETE FROM team_members
  WHERE team_id = p_team_id AND profile_id = v_caller_id;

  RETURN jsonb_build_object(
    'teamId',       p_team_id,
    'newCaptainId', p_to_profile_id,
    'leftProfileId', v_caller_id,
    'leaveReason',  'ABANDONO'
  );
END;
$$;

COMMENT ON FUNCTION public.transfer_captaincy_and_leave(uuid, uuid) IS
  'El capitan cede el rol y abandona el equipo en una sola transaccion. Cierra el ciclo con motivo ABANDONO. Reemplaza al par UPDATE+DELETE del cliente, que no era atomico.';

REVOKE EXECUTE ON FUNCTION public.transfer_captaincy_and_leave(uuid, uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.transfer_captaincy_and_leave(uuid, uuid) TO authenticated;


-- ═══════════════════════════════════════════════════════════════
-- 5. Cierre de la via de borrado directo
-- ═══════════════════════════════════════════════════════════════
-- Mientras el cliente pueda hacer DELETE sobre team_members, el GUC
-- tornear.leave_reason nunca se setea y todo ciclo se cierra como ABANDONO.
-- Las cuatro RPCs de arriba cubren el 100% de las salidas legitimas, asi que
-- se revoca el privilegio. La policy team_members_delete_by_team_admin queda
-- vigente pero inerte para el rol authenticated (sin privilegio de tabla, RLS
-- ni se evalua); no se elimina para no perder la defensa en profundidad si el
-- grant se restaurara por error.
REVOKE DELETE ON public.team_members FROM authenticated;

COMMENT ON TABLE public.team_members IS
  'Membresia jugador-equipo. DELETE revocado a authenticated (2026-07-23): las salidas entran solo por leave_team_as_member / remove_team_member / transfer_to_team / transfer_captaincy_and_leave, que fijan tornear.leave_reason para el ledger team_stints.';


-- ============================================================
-- ⚠️ DEPENDENCIAS PARA FASE 2 (frontend) — no aplicadas aqui
-- ------------------------------------------------------------
-- 1. lib/team-manage-data.ts: leaveTeam / removeMember / transferCaptain hacen
--    DELETE directo y a partir de esta migracion reciben 42501
--    (permission denied). Deben pasar a las RPCs correspondientes.
--
-- 2. transfer_to_team exige team_join_requests.status = 'ACEPTADA'. Hoy el
--    capitan, al aceptar, INSERTA el team_members el mismo (policy
--    ..._bootstrap_or_from_request), con lo cual el jugador ya es miembro y la
--    RPC responderia ALREADY_MEMBER. El flujo de aceptacion debe cambiar a:
--    marcar la solicitud ACEPTADA (sin insertar) → el jugador confirma y se
--    dispara transfer_to_team. Hasta que eso ocurra, la RPC queda disponible
--    pero sin caller en la app: no rompe nada, todavia no se usa.
-- ============================================================
