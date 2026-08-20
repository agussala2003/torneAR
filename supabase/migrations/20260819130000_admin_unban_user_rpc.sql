-- ============================================================
-- admin_unban_user + admin_get_suspension_status — 2026-08-19
-- (Backlog Post-Lanzamiento · Tarea 2)
-- ------------------------------------------------------------
-- Contraparte de `admin_suspend_user` (20260818190000). Ese archivo cierra
-- diciendo que revertir una suspensión «es una operación manual de un admin
-- en SQL»; esta migración es lo que borra esa frase del roadmap.
--
-- Dos funciones, no una:
--
--  1. `admin_unban_user(p_profile_id)` — el UPDATE inverso: banned_until a
--     NULL. Mismo mecanismo, mismo guard de `is_admin`, mismo registro de
--     auditoría en `app_logs` que la suspensión, para que las dos mitades del
--     circuito de moderación se lean igual en /dashboard/health.
--
--  2. `admin_get_suspension_status(p_profile_ids[])` — SIN esta, la UI del
--     dashboard no puede saber a quién ofrecerle «Levantar suspensión»:
--     `auth.users` no es legible desde PostgREST bajo ninguna circunstancia
--     (schema `auth`, ver el comentario de 20260818190000), así que el
--     estado de baneo hoy es literalmente invisible para el frontend. El
--     botón de suspender vive con esa ceguera porque su estado se infiere del
--     click reciente; uno de levantar suspensión no puede — sin saber quién
--     está baneado sería un botón ofrecido a todos, incluidos los 99% que no
--     lo están.
--
-- ⚠️ NOMBRE DEL PARÁMETRO: el ticket pedía `admin_unban_user(user_id uuid)`.
-- Va como `p_profile_id` a propósito, por dos motivos:
--   · Lo que el dashboard tiene a mano es `profiles.id`
--     (`content_reports.reported_entity_id` para un reporte tipo USER), no
--     `auth.users.id`. Un parámetro llamado `user_id` que en realidad espera
--     un profile id es una bomba de tiempo.
--   · Espeja exactamente la firma de `admin_suspend_user(p_profile_id, ...)`.
--     Dos RPCs hermanas con convenciones distintas de nombre de parámetro es
--     precisamente el tipo de asimetría que produce un bug de integración.
-- La resolución a `auth_user_id` pasa puertas adentro, igual que en suspend.
--
-- Idempotente: se puede re-aplicar sin efectos.
-- ============================================================


-- ════════════════════════════════════════════════════════════
-- 1. admin_unban_user
-- ════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.admin_unban_user(
  p_profile_id uuid,
  p_reason     text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_admin_auth_user_id  uuid := auth.uid();
  v_target_auth_user_id uuid;
  v_target_username     text;
  v_was_banned          boolean;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE auth_user_id = v_admin_auth_user_id AND is_admin = true
  ) THEN
    RAISE EXCEPTION 'NOT_AUTHORIZED: se requiere is_admin';
  END IF;

  SELECT auth_user_id, username INTO v_target_auth_user_id, v_target_username
  FROM public.profiles
  WHERE id = p_profile_id;

  IF v_target_auth_user_id IS NULL THEN
    RAISE EXCEPTION 'PROFILE_NOT_FOUND: perfil % no encontrado', p_profile_id;
  END IF;

  -- Se lee el estado ANTES del UPDATE, sólo para la auditoría: sirve para
  -- distinguir en app_logs un levantamiento real de un click sobre alguien
  -- que ya no estaba suspendido (o cuyo ban ya había vencido).
  SELECT (banned_until IS NOT NULL AND banned_until > now())
  INTO v_was_banned
  FROM auth.users
  WHERE id = v_target_auth_user_id;

  -- NULL y no `now()`: NULL es el estado "nunca baneado" que GoTrue entiende
  -- nativamente. Poner una fecha pasada también desbloquearía el login, pero
  -- dejaría la fila indistinguible de un ban vencido en cualquier consulta
  -- futura sobre auth.users.
  --
  -- A diferencia de suspend, acá NO hay guard de auto-acción: un admin
  -- levantándose una suspensión propia es imposible por construcción (si
  -- estuviera baneado no podría autenticarse para llamar a esta RPC).
  UPDATE auth.users
  SET banned_until = NULL
  WHERE id = v_target_auth_user_id;

  -- Auditoría simétrica a admin.suspend_user: `user_id` es el ADMIN que
  -- ejecutó la acción, no el usuario afectado. `warn` por el mismo motivo —
  -- destacado en /dashboard/health sin ser una falla.
  INSERT INTO public.app_logs (level, message, details, user_id)
  VALUES (
    'warn',
    'admin.unban_user',
    jsonb_build_object(
      'unbanned_profile_id', p_profile_id,
      'unbanned_username',   v_target_username,
      'was_banned',          COALESCE(v_was_banned, false),
      'reason',              p_reason
    ),
    v_admin_auth_user_id
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_unban_user(uuid, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.admin_unban_user(uuid, text) TO authenticated;

COMMENT ON FUNCTION public.admin_unban_user(uuid, text) IS
  'Revierte una suspensión de moderación (is_admin): auth.users.banned_until = NULL. Contraparte exacta de admin_suspend_user, con el mismo guard, la misma resolución profile→auth_user y el mismo registro en app_logs (admin.unban_user). Idempotente: levantar a alguien no suspendido es un no-op auditado.';


-- ════════════════════════════════════════════════════════════
-- 2. admin_get_suspension_status
-- ════════════════════════════════════════════════════════════
-- Recibe un ARRAY y no un uuid suelto: la cola de moderación resuelve el
-- estado de N denuncias en una sola pasada. Con una RPC por fila, abrir
-- /dashboard/moderation con 40 denuncias serían 40 round-trips — el mismo
-- N+1 que la propia página ya evita al resolver los perfiles denunciados con
-- un `.in()` batcheado.

CREATE OR REPLACE FUNCTION public.admin_get_suspension_status(
  p_profile_ids uuid[]
)
RETURNS TABLE (
  profile_id   uuid,
  is_suspended boolean,
  banned_until timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $$
-- `RETURNS TABLE` crea variables plpgsql homónimas de las columnas de salida
-- (`banned_until` acá choca con `auth.users.banned_until`). Todas las
-- referencias de abajo están calificadas, así que el pragma es redundante hoy
-- — va igual porque es exactamente el 42702 que costó una migración de
-- hotfix propia en `get_my_matches` (20260331230226), y un `SELECT` sin
-- calificar agregado más adelante lo reviviría en silencio.
#variable_conflict use_column
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE auth_user_id = auth.uid() AND is_admin = true
  ) THEN
    RAISE EXCEPTION 'NOT_AUTHORIZED: se requiere is_admin';
  END IF;

  RETURN QUERY
  SELECT
    p.id,
    -- `> now()` y no `IS NOT NULL`: GoTrue considera activo a un usuario cuyo
    -- banned_until ya venció. Reportarlo como suspendido dejaría un botón de
    -- «Levantar suspensión» colgado sobre alguien que ya puede entrar.
    (u.banned_until IS NOT NULL AND u.banned_until > now()) AS is_suspended,
    u.banned_until
  FROM public.profiles p
  JOIN auth.users u ON u.id = p.auth_user_id
  WHERE p.id = ANY(p_profile_ids);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_get_suspension_status(uuid[]) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.admin_get_suspension_status(uuid[]) TO authenticated;

COMMENT ON FUNCTION public.admin_get_suspension_status(uuid[]) IS
  'Estado de suspensión (auth.users.banned_until) de un lote de perfiles, sólo para is_admin. Existe porque auth.users no es legible vía PostgREST y sin esto el dashboard no puede saber a quién ofrecerle «Levantar suspensión». Batch por diseño: evita el N+1 en la cola de moderación.';
