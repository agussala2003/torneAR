-- ============================================================
-- Privacidad de profiles y control de mayoría de edad — 2026-08-19
-- ------------------------------------------------------------
-- Dos hallazgos del Gap Analysis, cerrados en un solo archivo porque
-- comparten la misma tabla:
--
--   1. `profiles_select_all ... using (true)` (20240101000000) + el GRANT
--      SELECT de tabla completa (20260719120500_fix_core_tables_grants)
--      dejan `date_of_birth` (fecha exacta) y `expo_push_token` legibles
--      por CUALQUIER usuario autenticado, para CUALQUIER perfil — no sólo
--      el propio. Verificado antes de tocar nada: NO se puede resolver con
--      una policy de RLS distinta, porque RLS filtra FILAS, no COLUMNAS
--      (ver el propio comentario de 20260719130000_restore_hotfix_column_
--      lockdown: "la defensa de columnas... es privilegio de columna").
--      Tampoco alcanza con un REVOKE de columna a secas: 4 funcionalidades
--      reales dependen de leer estas dos columnas de OTROS perfiles —
--      verificadas leyendo el código, no asumidas:
--        · lib/team-stats-api.ts       — edad de compañeros + promedio del plantel
--        · lib/team-manage-data.ts     — edad en roster/solicitudes de equipo,
--                                         y el push token del aplicante al aceptar
--        · lib/profile-stats-api.ts    — edad al ver el perfil de OTRO jugador
--        · context/AuthContext.tsx     — mi PROPIO date_of_birth/token (éste sí
--                                         necesita el dato crudo, no derivado)
--      Solución: REVOKE de columna en la tabla base (cierra la cosecha
--      masiva vía API directa) + una vista `profiles_public` que expone
--      `age` DERIVADA (nunca la fecha exacta) para los casos de "ver a
--      otro" + una RPC `get_own_profile()` SECURITY DEFINER para "ver el
--      mío propio" + una RPC acotada para el único caso que necesita el
--      token crudo de otro (notificar al aceptar una solicitud).
--
--   2. Nada en la base impedía insertar/actualizar un `date_of_birth` de
--      menor de 18 — la validación era sólo client-side
--      (`lib/age.ts::maxSignupBirthDate`, un límite del selector de fecha,
--      no una garantía). Trigger BEFORE INSERT OR UPDATE que aborta la
--      transacción si corresponde.
-- ============================================================


-- ════════════════════════════════════════════════════════════
-- 1. Cierre de la cosecha masiva: REVOKE de tabla + GRANT de columna
-- ════════════════════════════════════════════════════════════
-- ⚠️ Un `REVOKE SELECT (col) ON tabla FROM rol` NO alcanza cuando ese rol ya
-- tiene SELECT a nivel de TABLA completa (que es el caso: GRANT SELECT ...
-- TO authenticated de 20260719120500, sin columnas). Postgres evalúa el
-- acceso a una columna como "el ACL de tabla lo permite O el ACL de columna
-- lo permite" — un REVOKE de columna nunca puede angostar lo que el ACL de
-- tabla ya concede. Se verificó esto EN LA PRÁCTICA: la primera versión de
-- esta migración sólo hacía el REVOKE de columna y `pg_class.relacl` seguía
-- mostrando `authenticated=ard...` (la `r` de SELECT) sin cambios — la
-- vulnerabilidad seguía abierta pese a que el REVOKE "se aplicó" sin error.
--
-- La única forma correcta: revocar el SELECT de TABLA completo y volver a
-- otorgarlo explícitamente columna por columna, listando todo MENOS
-- `date_of_birth` y `expo_push_token`. `anon` no tenía grant de SELECT para
-- empezar, pero se revoca explícito por las dudas (mismo criterio que
-- 20260804122000).
REVOKE SELECT ON public.profiles FROM anon, authenticated;

GRANT SELECT (
  id,
  auth_user_id,
  username,
  full_name,
  avatar_url,
  zone,
  preferred_position,
  favorite_team,
  strong_foot,
  gender,
  is_admin,
  referred_by,
  created_at,
  updated_at
) ON public.profiles TO authenticated;


-- ════════════════════════════════════════════════════════════
-- 2. get_own_profile — el propio perfil completo, para AuthContext
-- ════════════════════════════════════════════════════════════
-- SECURITY DEFINER: bypasea el REVOKE de arriba, pero SÓLO para la fila del
-- propio caller (WHERE auth_user_id = auth.uid(), no hay parámetro que
-- pueda apuntar a otro perfil). Devuelve `public.profiles` completo —
-- mismo shape que el `SELECT *` que reemplaza en AuthContext.fetchProfile,
-- así que no hace falta tocar el tipo `Profile` que usan decenas de
-- pantallas.
CREATE OR REPLACE FUNCTION public.get_own_profile()
RETURNS public.profiles
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT * FROM public.profiles WHERE auth_user_id = auth.uid();
$$;

REVOKE EXECUTE ON FUNCTION public.get_own_profile() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_own_profile() TO authenticated;

COMMENT ON FUNCTION public.get_own_profile() IS
  'Perfil completo del caller (incluye date_of_birth/expo_push_token, bloqueados por columna en la tabla base). Único reemplazo de "SELECT * FROM profiles WHERE auth_user_id = auth.uid()" tras 20260819100000. Nunca acepta un id ajeno.';


-- ════════════════════════════════════════════════════════════
-- 3. profiles_public — perfil de OTROS, con edad derivada
-- ════════════════════════════════════════════════════════════
-- Vista sin `security_invoker`: corre con los privilegios de quien la creó
-- (acceso completo a la tabla base), no con los del rol que consulta — es
-- el equivalente de vista a un SECURITY DEFINER de función. Por eso puede
-- calcular `age` a partir de `date_of_birth` aunque `authenticated` ya no
-- tenga SELECT sobre esa columna en la tabla base.
--
-- Expone `age` (entero, años cumplidos) y NUNCA la fecha exacta — coincide
-- con lo que la Política de Privacidad ya promete ("Qué ven los demás
-- usuarios": ...posición, edad, foto de perfil... — no "fecha de
-- nacimiento"). `expo_push_token` directamente no está: ningún caso de uso
-- legítimo necesita el token crudo de otro perfil salvo el punto 4.
CREATE OR REPLACE VIEW public.profiles_public AS
SELECT
  id,
  username,
  full_name,
  avatar_url,
  zone,
  preferred_position,
  favorite_team,
  strong_foot,
  gender,
  created_at,
  CASE
    WHEN date_of_birth IS NULL THEN NULL
    ELSE EXTRACT(YEAR FROM age(current_date, date_of_birth))::int
  END AS age
FROM public.profiles;

GRANT SELECT ON public.profiles_public TO authenticated;

COMMENT ON VIEW public.profiles_public IS
  'Subconjunto público de profiles para leer datos de OTROS perfiles: age derivada, nunca date_of_birth ni expo_push_token. Sin security_invoker a propósito — corre con privilegio de owner para poder calcular age pese al REVOKE de columna sobre la tabla base.';


-- ════════════════════════════════════════════════════════════
-- 4. get_join_request_applicant_push_token — único caso que necesita
--    el token crudo de OTRO perfil
-- ════════════════════════════════════════════════════════════
-- team-manage-data.ts::acceptJoinRequest manda un push inmediato al
-- aplicante usando su expo_push_token, leído hoy con una query directa del
-- capitán/subcapitán. Acotado a exactamente ese caso: sólo captain/
-- subcapitán del equipo de la solicitud, sólo para esa solicitud puntual,
-- no un acceso genérico a tokens ajenos.
CREATE OR REPLACE FUNCTION public.get_join_request_applicant_push_token(
  p_request_id uuid
)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_caller_id uuid;
  v_token     text;
BEGIN
  SELECT id INTO v_caller_id FROM public.profiles WHERE auth_user_id = auth.uid();
  IF v_caller_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT p.expo_push_token INTO v_token
  FROM public.team_join_requests r
  JOIN public.profiles p ON p.id = r.profile_id
  WHERE r.id = p_request_id
    AND EXISTS (
      SELECT 1 FROM public.team_members tm
      WHERE tm.team_id = r.team_id
        AND tm.profile_id = v_caller_id
        AND tm.role IN ('CAPITAN', 'SUBCAPITAN')
    );

  RETURN v_token;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_join_request_applicant_push_token(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_join_request_applicant_push_token(uuid) TO authenticated;

COMMENT ON FUNCTION public.get_join_request_applicant_push_token(uuid) IS
  'Token de push del aplicante de una team_join_requests puntual, sólo para el capitán/subcapitán del equipo de esa solicitud. Reemplaza la lectura directa de profiles.expo_push_token ajeno en team-manage-data.ts::acceptJoinRequest tras el REVOKE de columna de 20260819100000.';


-- ════════════════════════════════════════════════════════════
-- 4b. get_team_member_push_token — token de un miembro YA en el equipo
-- ════════════════════════════════════════════════════════════
-- No reemplaza a la RPC de arriba: acá el destinatario YA es team_members
-- (cambio de rol, remoción — app/team-manage.tsx), mientras que un
-- aplicante de team_join_requests todavía NO lo es al momento de aceptar
-- (transfer_to_team recién lo agrega cuando el jugador confirma). Dos
-- formas de pertenencia distintas, dos RPCs con el guard correspondiente.
CREATE OR REPLACE FUNCTION public.get_team_member_push_token(
  p_team_id    uuid,
  p_profile_id uuid
)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_caller_id uuid;
  v_token     text;
BEGIN
  SELECT id INTO v_caller_id FROM public.profiles WHERE auth_user_id = auth.uid();
  IF v_caller_id IS NULL THEN
    RETURN NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.team_members tm
    WHERE tm.team_id = p_team_id
      AND tm.profile_id = v_caller_id
      AND tm.role IN ('CAPITAN', 'SUBCAPITAN')
  ) THEN
    RETURN NULL;
  END IF;

  SELECT p.expo_push_token INTO v_token
  FROM public.team_members tm
  JOIN public.profiles p ON p.id = tm.profile_id
  WHERE tm.team_id = p_team_id AND tm.profile_id = p_profile_id;

  RETURN v_token;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_team_member_push_token(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_team_member_push_token(uuid, uuid) TO authenticated;

COMMENT ON FUNCTION public.get_team_member_push_token(uuid, uuid) IS
  'Token de push de un miembro puntual de un equipo, sólo para el capitán/subcapitán de ese mismo equipo. Reemplaza la lectura directa de profiles.expo_push_token ajeno en app/team-manage.tsx (cambio de rol, remoción) tras el REVOKE de columna de 20260819100000.';


-- ════════════════════════════════════════════════════════════
-- 5. Control de mayoría de edad server-side
-- ════════════════════════════════════════════════════════════
-- Sólo valida cuando `date_of_birth` está seteada (NULL no "indica" una
-- edad, así que no bloquea perfiles incompletos en tránsito por el
-- onboarding) y, en UPDATE, sólo cuando esa columna efectivamente cambia
-- —no en cada UPDATE del perfil— para no dejar sin poder tocar el resto de
-- su perfil a una fila vieja que ya tuviera una fecha inválida cargada por
-- fuera de este control.
CREATE OR REPLACE FUNCTION public.enforce_minimum_signup_age()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = 'public'
AS $$
BEGIN
  IF NEW.date_of_birth IS NOT NULL
     AND NEW.date_of_birth > (current_date - interval '18 years')
  THEN
    RAISE EXCEPTION 'MINIMUM_AGE_NOT_MET: torneAR requiere ser mayor de 18 años';
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.enforce_minimum_signup_age() IS
  'Aborta INSERT/UPDATE de profiles si date_of_birth indica menos de 18 años. Antes sólo se validaba client-side (lib/age.ts::maxSignupBirthDate) — esto lo hace una garantía de la base, no una convención del formulario.';

-- Dos triggers, no uno combinado: `TG_OP` no es una columna visible dentro
-- de la cláusula WHEN de CREATE TRIGGER (sólo dentro del cuerpo de la
-- función), y `OLD` no existe para INSERT — un único trigger BEFORE INSERT
-- OR UPDATE que referenciara cualquiera de los dos falla al crearse.
DROP TRIGGER IF EXISTS trg_profiles_minimum_age_insert ON public.profiles;
CREATE TRIGGER trg_profiles_minimum_age_insert
  BEFORE INSERT ON public.profiles
  FOR EACH ROW
  WHEN (NEW.date_of_birth IS NOT NULL)
  EXECUTE FUNCTION public.enforce_minimum_signup_age();

DROP TRIGGER IF EXISTS trg_profiles_minimum_age_update ON public.profiles;
CREATE TRIGGER trg_profiles_minimum_age_update
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  WHEN (NEW.date_of_birth IS NOT NULL AND NEW.date_of_birth IS DISTINCT FROM OLD.date_of_birth)
  EXECUTE FUNCTION public.enforce_minimum_signup_age();
