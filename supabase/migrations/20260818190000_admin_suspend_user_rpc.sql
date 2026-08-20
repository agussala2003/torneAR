-- ============================================================
-- admin_suspend_user — RPC de moderación para el dashboard admin
-- 2026-08-18 (Hito 7+)
-- ------------------------------------------------------------
-- Suspender una cuenta requiere acceso a auth.users (banned_until), que no
-- tiene ninguna vía de escritura para `authenticated` — igual situación
-- que app_settings/app_versions antes de 20260818180000. A diferencia de
-- esas dos, acá NO alcanza con GRANT + policy de RLS: auth.users es
-- schema `auth`, no `public`, y Supabase no expone ese schema a PostgREST
-- bajo ninguna circunstancia. La única vía es una función SECURITY
-- DEFINER que corra con privilegios elevados puertas adentro de Postgres.
--
-- Esto es DELIBERADAMENTE la alternativa a usar la service_role key desde
-- el Route Handler del dashboard: WEB_SPECIFICATION.md §1.2 prohíbe que
-- esa key exista en código de aplicación. Mismo mecanismo de baneo que ya
-- usa delete_own_account() (20260818140000) — banned_until, la columna
-- estándar de GoTrue —, pero sin anonimizar el perfil: una suspensión de
-- moderación no es una baja voluntaria, y conservar identidad + contenido
-- es lo que permite auditar la denuncia y, si corresponde, revertirla a
-- mano vía SQL.
-- ============================================================

CREATE OR REPLACE FUNCTION public.admin_suspend_user(
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

  -- Un admin no se banea a sí mismo por esta vía. Si necesita dejar de
  -- usar la cuenta, ya existe delete_own_account() (baja voluntaria).
  IF v_target_auth_user_id = v_admin_auth_user_id THEN
    RAISE EXCEPTION 'CANNOT_SUSPEND_SELF: no podés suspender tu propia cuenta';
  END IF;

  -- Igual que delete_own_account(): banned_until bloquea login/refresh sin
  -- tocar la fila de auth.users ni la de profiles. Fecha lejana en vez de
  -- NULL-toggle: "permanente" acá significa "hasta que un admin lo revierta
  -- a mano", no que el campo tenga una semántica de infinito propia.
  UPDATE auth.users
  SET banned_until = '2999-12-31 23:59:59+00'::timestamptz
  WHERE id = v_target_auth_user_id;

  -- Registro de auditoría: quién ejecutó la suspensión (user_id = admin,
  -- no el suspendido) y por qué. `level = 'warn'` para que aparezca
  -- destacado en /dashboard/health sin ser un 'error' (no es una falla).
  INSERT INTO public.app_logs (level, message, details, user_id)
  VALUES (
    'warn',
    'admin.suspend_user',
    jsonb_build_object(
      'suspended_profile_id', p_profile_id,
      'suspended_username', v_target_username,
      'reason', p_reason
    ),
    v_admin_auth_user_id
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_suspend_user(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_suspend_user(uuid, text) TO authenticated;

COMMENT ON FUNCTION public.admin_suspend_user(uuid, text) IS
  'Suspensión de moderación (is_admin): banea auth.users via banned_until, mismo mecanismo que delete_own_account() pero sin anonimizar el perfil. Deja registro en app_logs (admin.suspend_user) con qué admin la ejecutó y por qué. Reemplaza el uso de service_role en el Route Handler — ver WEB_SPECIFICATION.md §1.2.';
