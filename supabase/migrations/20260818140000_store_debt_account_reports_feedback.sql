-- ============================================================
-- DEUDA DE TIENDA — Eliminación de cuenta, reportes UGC y feedback nativo
-- 2026-08-18
-- ------------------------------------------------------------
-- Cierra tres hallazgos del gap analysis legal/técnico:
--   · Apple 5.1.1(v) — la app no ofrecía forma de eliminar la cuenta.
--   · Requisito UGC (App Store 1.2 / Play Developer Policy) — no había
--     canal de denuncias para perfiles ni partidos.
--   · El feedback de la Beta dependía de un Google Form externo
--     (lib/feedback.ts) en vez de un canal propio.
--
-- Tres piezas, cada una con su propia sección abajo:
--   1. delete_own_account()      — RPC de autoservicio.
--   2. content_reports           — tabla + RLS para denuncias.
--   3. app_feedback              — tabla + RLS para sugerencias/bugs.
-- ============================================================


-- ════════════════════════════════════════════════════════════
-- 1. ELIMINACIÓN DE CUENTA
-- ════════════════════════════════════════════════════════════
--
-- ⚠️ DESVÍO DELIBERADO del pedido original: NO se hace `DELETE FROM
-- auth.users`. Se explica por qué abajo, con evidencia — no es una
-- interpretación laxa del requisito, es que el DELETE directo ROMPE en
-- producción para cualquier usuario que haya jugado un partido.
--
-- `profiles.auth_user_id` referencia a `auth.users(id) ON DELETE CASCADE`
-- (20240101000000_initial_schema.sql). Un DELETE en auth.users arrastraría
-- el intento de borrar la fila de `profiles`. Pero `profiles.id` es, a su
-- vez, referenciado SIN cascada (ON DELETE NO ACTION, el default de
-- Postgres cuando no se especifica) desde:
--
--   challenges.created_by, match_proposals.proposed_by,
--   match_participants.profile_id, match_results.submitted_by,
--   match_results.mvp_id, result_dispute_votes.voter_id,
--   wo_claims.claimed_by, market_team_posts.created_by,
--   messages.sender_profile_id, market_team_post_applications.applicant_profile_id,
--   cancellation_requests.resolved_by
--
-- Cualquier usuario que alguna vez cargó un resultado, fue nombrado MVP,
-- mandó un mensaje o propuso un partido tiene fila en al menos una de esas
-- tablas. El intento de DELETE fallaría con 23503 (foreign_key_violation) —
-- es decir, el botón "Eliminar cuenta" funcionaría en la demo con una cuenta
-- de prueba recién creada y fallaría en producción con cualquier usuario
-- real. Es exactamente el caso que ya resolvimos para equipos
-- (20260728170000_e3_team_soft_deactivation.sql: "el historial deportivo es
-- compartido con los rivales y tiene que sobrevivir") y es lo que la
-- Política de Privacidad YA promete en su cláusula de Conservación:
-- "Los resultados de partidos ya jugados... pueden conservarse de forma
-- disociada, porque forman parte del historial competitivo de otros
-- usuarios."
--
-- La función anonimiza el perfil (no lo borra) y BANEA la fila de
-- auth.users con `banned_until` — bloquea login/refresh sin tocar su
-- existencia, así que el historial de rivales sigue resolviendo intacto.
--
-- ⚠️ Nota de verificación: `banned_until` es la columna estándar con la que
-- GoTrue implementa el baneo de usuarios (misma que usa la Admin API con
-- `ban_duration`). No se pudo correr esta migración contra una instancia
-- viva en este entorno (sin Docker disponible) — antes de confiar en esto
-- en producción, correr `\d auth.users` en el SQL Editor del Dashboard para
-- confirmar que la columna existe con ese nombre en esta versión del
-- proyecto.
CREATE OR REPLACE FUNCTION public.delete_own_account()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_auth_user_id uuid := auth.uid();
  v_profile_id   uuid;
  v_placeholder  text;
BEGIN
  IF v_auth_user_id IS NULL THEN
    RAISE EXCEPTION 'NOT_AUTHENTICATED: no hay sesión activa';
  END IF;

  SELECT id INTO v_profile_id FROM public.profiles WHERE auth_user_id = v_auth_user_id;
  IF v_profile_id IS NULL THEN
    RAISE EXCEPTION 'PROFILE_NOT_FOUND: perfil no encontrado para el usuario actual';
  END IF;

  -- UUID completo y sin guiones: único por construcción (deriva de la PK),
  -- así que no hay forma de que choque contra `profiles.username` (unique)
  -- ni siquiera contra el placeholder de otra cuenta ya eliminada.
  v_placeholder := 'usuario_eliminado_' || replace(v_profile_id::text, '-', '');

  -- ── 1. Anonimizar el perfil ────────────────────────────────────────────
  -- La fila NO se borra: profile_id sigue siendo la clave que sostiene todo
  -- el historial deportivo compartido listado arriba.
  UPDATE public.profiles SET
    username        = v_placeholder,
    full_name       = 'Usuario eliminado',
    avatar_url      = NULL,
    zone            = NULL,
    date_of_birth   = NULL,
    gender          = NULL,
    favorite_team   = NULL,
    strong_foot     = NULL,
    expo_push_token = NULL,
    is_admin        = false,
    updated_at      = now()
  WHERE id = v_profile_id;

  -- ── 2. Avatar en Storage ───────────────────────────────────────────────
  -- Best-effort: envuelto en su propio BEGIN/EXCEPTION (crea un savepoint
  -- implícito) para que un problema acá no revierta el UPDATE de arriba ni
  -- aborte la función entera — mismo criterio que
  -- `log_checkin_distance` (20260811130000_checkin_distance_telemetry.sql):
  -- perder un archivo huérfano en Storage es un gap menor comparado con que
  -- toda la baja de cuenta falle por eso.
  BEGIN
    DELETE FROM storage.objects
    WHERE bucket_id = 'avatars'
      AND (storage.foldername(name))[1] = v_auth_user_id::text;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'delete_own_account: no se pudo limpiar el avatar de storage (perfil %): %',
      v_profile_id, SQLERRM;
  END;

  -- ── 3. auth.users: bloquear login + desidentificar ────────────────────
  -- A DIFERENCIA del paso 2, este bloque NO está protegido con
  -- EXCEPTION/best-effort: si esto falla, la función tiene que fallar
  -- entera y el cliente tiene que enterarse. Un fallo silencioso acá
  -- dejaría al usuario creyendo que "eliminó su cuenta" cuando en realidad
  -- sus credenciales originales seguirían siendo válidas — mucho peor que
  -- un avatar huérfano, es una promesa de privacidad incumplida.
  --
  -- El cliente llama a `supabase.auth.signOut()` inmediatamente después de
  -- que esta RPC devuelve éxito (ver lib/account-data.ts): `banned_until`
  -- sólo lo revisa GoTrue en login/refresh, no en cada request de un access
  -- token todavía vigente, así que revocar la sesión activa desde el
  -- cliente cierra esa ventana.
  UPDATE auth.users SET
    banned_until       = '2999-12-31 23:59:59+00'::timestamptz,
    email               = 'eliminado+' || v_profile_id::text || '@deleted.tornear.app',
    raw_user_meta_data  = '{}'::jsonb
  WHERE id = v_auth_user_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.delete_own_account() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_own_account() TO authenticated;

COMMENT ON FUNCTION public.delete_own_account() IS
  'Autoservicio de baja de cuenta (Apple 5.1.1). Anonimiza profiles y banea auth.users — NO hace DELETE físico del perfil: el historial deportivo compartido con rivales (match_results, wo_claims, messages, etc., todos ON DELETE NO ACTION) lo impide. Ver comentario largo arriba.';


-- ════════════════════════════════════════════════════════════
-- 2. REPORTES DE CONTENIDO / MODERACIÓN
-- ════════════════════════════════════════════════════════════

DO $$ BEGIN
  CREATE TYPE public.report_entity_type AS ENUM ('USER', 'MATCH');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Sólo PENDING se usa hoy (el INSERT del cliente no manda status, cae en el
-- default). REVIEWED/DISMISSED/ACTIONED quedan declarados para la cola de
-- moderación en app/admin/ — no forma parte de este cambio, pero la policy
-- de UPDATE de abajo ya la deja lista para cuando se construya.
DO $$ BEGIN
  CREATE TYPE public.report_status AS ENUM ('PENDING', 'REVIEWED', 'DISMISSED', 'ACTIONED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS public.content_reports (
  id                    uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  reporter_id           uuid NOT NULL REFERENCES public.profiles(id),
  reported_entity_type  public.report_entity_type NOT NULL,
  -- Polimórfico a propósito: según `reported_entity_type` apunta a
  -- profiles.id o a matches.id. No puede ser un FK real — Postgres no
  -- soporta una FK condicional a distintas tablas según el valor de otra
  -- columna — así que queda como uuid suelto, sin restricción a nivel base.
  -- La integridad ("¿existe de verdad lo que se está denunciando?") queda
  -- del lado de la app al construir el reporte, no de la base.
  reported_entity_id    uuid NOT NULL,
  reason                text NOT NULL CHECK (char_length(btrim(reason)) BETWEEN 1 AND 500),
  status                public.report_status NOT NULL DEFAULT 'PENDING',
  created_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS content_reports_reporter_id_idx
  ON public.content_reports (reporter_id);
CREATE INDEX IF NOT EXISTS content_reports_entity_idx
  ON public.content_reports (reported_entity_type, reported_entity_id);
-- Para la cola de moderación futura: "los PENDING más viejos primero".
CREATE INDEX IF NOT EXISTS content_reports_status_created_at_idx
  ON public.content_reports (status, created_at);

ALTER TABLE public.content_reports ENABLE ROW LEVEL SECURITY;

-- Grants base explícitos y no default privileges de Supabase: son
-- inconsistentes entre entornos (ver 20260722120000_fix_team_stints_grants.sql,
-- mismo problema ya golpeó a este proyecto una vez).
GRANT INSERT, SELECT ON public.content_reports TO authenticated;
GRANT UPDATE (status) ON public.content_reports TO authenticated;
REVOKE DELETE ON public.content_reports FROM anon, authenticated;

-- INSERT: sólo puedo reportar a nombre mío, no de otro.
CREATE POLICY content_reports_insert_own ON public.content_reports
  FOR INSERT TO authenticated
  WITH CHECK (
    reporter_id = (SELECT p.id FROM public.profiles p WHERE p.auth_user_id = (SELECT auth.uid()))
  );

-- SELECT: mis propios reportes, o cualquiera si soy admin de la liga.
-- Una sola policy con OR (no dos permisivas separadas) — mismo criterio que
-- 20260714144056_rls_performance_optimization.sql: dos policies permisivas
-- de la misma acción se combinan con OR igual, pero evalúan el árbol dos
-- veces por fila.
CREATE POLICY content_reports_select_own_or_admin ON public.content_reports
  FOR SELECT TO authenticated
  USING (
    reporter_id = (SELECT p.id FROM public.profiles p WHERE p.auth_user_id = (SELECT auth.uid()))
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.auth_user_id = (SELECT auth.uid()) AND p.is_admin = true
    )
  );

-- UPDATE: sólo admin, y sólo puede tocar `status` (el GRANT de arriba ya lo
-- acota por columna; esta policy acota además por fila). No hay pantalla que
-- la use todavía — queda lista para app/admin/reports-review.tsx.
CREATE POLICY content_reports_update_admin ON public.content_reports
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

COMMENT ON TABLE public.content_reports IS
  'Denuncias de usuarios sobre perfiles o partidos. INSERT/SELECT propios para cualquier authenticated; SELECT total y UPDATE(status) sólo profiles.is_admin. reported_entity_id es polimórfico, sin FK — ver comentario de columna.';


-- ════════════════════════════════════════════════════════════
-- 3. FEEDBACK NATIVO (reemplaza el Google Form de lib/feedback.ts)
-- ════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.app_feedback (
  id         uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  profile_id uuid NOT NULL REFERENCES public.profiles(id),
  -- Mismo techo que usa lib/logger.ts (MAX_MESSAGE_LENGTH) para el mismo
  -- tipo de dato: texto libre escrito a mano, no un payload estructurado.
  message    text NOT NULL CHECK (char_length(btrim(message)) BETWEEN 1 AND 2000),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS app_feedback_created_at_idx ON public.app_feedback (created_at DESC);

ALTER TABLE public.app_feedback ENABLE ROW LEVEL SECURITY;

GRANT INSERT ON public.app_feedback TO authenticated;
-- Sin SELECT ni para el propio autor: es un buzón de sugerencias, no un
-- historial de tickets propio (mismo comportamiento que tenía el Google
-- Form al que reemplaza — nadie veía sus envíos anteriores tampoco). Se lee
-- desde el Dashboard de Supabase (el service_role de ahí bypasea RLS por
-- diseño), no hace falta una policy de SELECT para eso. Si más adelante se
-- arma una pantalla de admin para triage in-app, agregar una policy
-- `is_admin` análoga a la de content_reports.
REVOKE SELECT, UPDATE, DELETE ON public.app_feedback FROM anon, authenticated;

CREATE POLICY app_feedback_insert_own ON public.app_feedback
  FOR INSERT TO authenticated
  WITH CHECK (
    profile_id = (SELECT p.id FROM public.profiles p WHERE p.auth_user_id = (SELECT auth.uid()))
  );

COMMENT ON TABLE public.app_feedback IS
  'Sugerencias y reportes de bug enviados desde ProfileFeedbackCard. INSERT-only para authenticated; sin SELECT vía PostgREST — se consume desde el Dashboard (service_role) o, a futuro, desde una policy is_admin dedicada.';
