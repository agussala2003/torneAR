-- ============================================================
-- Escritura admin para app_settings y app_versions (Hito 6)
-- 2026-08-18
-- ------------------------------------------------------------
-- Ambas tablas nacieron SIN ningún grant de escritura para
-- anon/authenticated: "se administra por dashboard o migración"
-- (comentarios de 20260728140000_geofence_hardening y
-- 20260804122000_app_versions_force_update), porque hasta ahora no existía
-- un panel de admin que las editara. Ahora existe — este es ese panel.
--
-- Mismo patrón que content_reports_update_admin (20260818140000): GRANT
-- column-scoped + policy RLS is_admin, no una RPC nueva. A diferencia de
-- dashboard_feedback_inbox/dashboard_logs_by_level (que existen porque
-- había que AGREGAR o LEER sin exponer toda la tabla), acá es un UPDATE
-- simple y acotado sobre una tabla chica — RLS + GRANT alcanza y es más
-- simple de auditar que envolver el UPDATE en una función.
-- ============================================================


-- ════════════════════════════════════════════════════════════
-- 1. app_settings — solo `value` es editable desde el panel
-- ════════════════════════════════════════════════════════════

GRANT UPDATE (value) ON public.app_settings TO authenticated;

DROP POLICY IF EXISTS app_settings_update_admin ON public.app_settings;
CREATE POLICY app_settings_update_admin ON public.app_settings
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.auth_user_id = (SELECT auth.uid()) AND p.is_admin = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.auth_user_id = (SELECT auth.uid()) AND p.is_admin = true
    )
  );

-- `updated_at` no está en el GRANT: la actualiza este trigger, no el
-- cliente — mismo criterio que ya usa app_versions
-- (touch_app_versions_updated_at, 20260804122000). Un trigger puede tocar
-- una columna sin que el rol que dispara el UPDATE tenga grant sobre ella.
CREATE OR REPLACE FUNCTION public.touch_app_settings_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_app_settings_updated_at ON public.app_settings;
CREATE TRIGGER trg_app_settings_updated_at
  BEFORE UPDATE ON public.app_settings
  FOR EACH ROW EXECUTE FUNCTION public.touch_app_settings_updated_at();


-- ════════════════════════════════════════════════════════════
-- 2. app_versions — los 3 campos operativos, no `platform` (PK inmutable)
-- ════════════════════════════════════════════════════════════

GRANT UPDATE (min_required_version, latest_version, update_url)
  ON public.app_versions TO authenticated;

DROP POLICY IF EXISTS app_versions_update_admin ON public.app_versions;
CREATE POLICY app_versions_update_admin ON public.app_versions
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.auth_user_id = (SELECT auth.uid()) AND p.is_admin = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.auth_user_id = (SELECT auth.uid()) AND p.is_admin = true
    )
  );

-- app_versions ya tiene touch_app_versions_updated_at (20260804122000) —
-- no hace falta un trigger nuevo. Los CHECK de formato de versión y de
-- update_url ~ '^https://' de esa misma migración siguen siendo la
-- validación real de fondo; el Route Handler solo filtra basura obvia
-- antes para dar un mensaje de error más claro que un CHECK violado.
