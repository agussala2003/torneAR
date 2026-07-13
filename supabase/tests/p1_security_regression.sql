-- ============================================================
-- P1 SECURITY REGRESSION — 10 bugs críticos de marzo 2026
-- ============================================================
-- Qué es esto: prueba de humo de los 7 casos de "intento no autorizado" de
-- los 10 bugs críticos de la auditoría de marzo 2026 (docs/auditoria.md),
-- arreglados el 28 de marzo y re-verificados el 8 de julio de 2026.
--
-- Cada bloque es un BEGIN...ROLLBACK independiente y AUTOCONTENIDO — nunca
-- hay un COMMIT, así que correr esto contra el proyecto real es seguro:
-- no modifica ningún dato. Se puede pegar bloque por bloque (recomendado
-- para leer el resultado de cada uno) o los 7 seguidos.
--
-- Cómo leer el resultado:
--   - Bloques 1 a 5 y 7 esperan que la llamada al RPC lance una excepción
--     (RAISE EXCEPTION). Si en cambio devuelve un resultado normal sin
--     error, ALGUNO DE LOS 10 BUGS DE MARZO VOLVIÓ A ABRIRSE.
--   - El bloque 6 espera que el UPDATE afecte 0 filas (RLS lo filtra en
--     silencio, no lanza excepción). Si `filas_afectadas` > 0, el bug #6
--     volvió a abrirse.
--
-- Los ítems 8/9/10 de marzo (motor ELO, Fair Play Score, resolución de
-- disputas) no tienen forma de "intento no autorizado" — ya se verificaron
-- en la auditoría por presencia de las migraciones/triggers correspondientes
-- y no se repiten acá.
--
-- IDs usados: equipos/perfiles/challenges/proposals reales de seed. Si estos
-- datos cambian o se borran, hay que actualizar los UUID de cada bloque.
--
-- Última corrida: 8 jul 2026 — los 7 casos dieron el resultado esperado.
-- ============================================================

-- ─── 1. send_challenge — invocado por un JUGADOR (no admin) ──────────────────
-- Esperado: EXCEPTION "No autorizado: solo el capitán o subcapitán..."
BEGIN;
SELECT set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-000000000002"}', true);
SELECT public.send_challenge(
  '22222222-2222-2222-2222-222222222221'::uuid,
  '22222222-2222-2222-2222-222222222222'::uuid,
  'AMISTOSO'
) AS resultado_no_deberia_llegar;
ROLLBACK;

-- ─── 2. accept_challenge — invocado por alguien ajeno al to_team_id ──────────
-- Esperado: EXCEPTION "No autorizado: solo el capitán o subcapitán del equipo receptor..."
BEGIN;
SELECT set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-000000000004"}', true);
SELECT public.accept_challenge('f786f93c-897f-4d10-8fea-796a8093f1ba'::uuid) AS resultado_no_deberia_llegar;
ROLLBACK;

-- ─── 3. confirm_match_proposal — invocado por el propio equipo proponente ───
-- Esperado: EXCEPTION "No autorizado: solo el equipo receptor puede confirmar..."
BEGIN;
SELECT set_config('request.jwt.claims', '{"sub":"ca544826-7fdc-468f-a951-b64cc542f97a"}', true);
SELECT public.confirm_match_proposal(
  'da04c988-db5e-49de-8801-e8906859ce60'::uuid,
  'e8bcc055-6bc3-45a2-9ffb-67aceab8bd9f'::uuid
) AS resultado_no_deberia_llegar;
ROLLBACK;

-- ─── 4. checkin_team — invocado por alguien que no pertenece a ningún equipo del partido ───
-- Esperado: EXCEPTION "No autorizado: no sos miembro del equipo..."
BEGIN;
SELECT set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-000000000001"}', true);
SELECT public.checkin_team(
  '3c448c8b-cd4f-4874-af1d-ae611a90ee70'::uuid,
  'a83f0915-8f9c-4207-b0ce-bf66d6e9666d'::uuid,
  NULL, NULL
) AS resultado_no_deberia_llegar;
ROLLBACK;

-- ─── 5. request_match_cancellation — invocado por un JUGADOR (no admin) ─────
-- Esperado: EXCEPTION "No autorizado: solo el capitán o subcapitán puede cancelar..."
BEGIN;
SELECT set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-000000000002"}', true);
SELECT public.request_match_cancellation(
  '44444444-4444-4444-4444-000000000001'::uuid,
  '22222222-2222-2222-2222-222222222221'::uuid,
  'MUTUO_ACUERDO',
  NULL
) AS resultado_no_deberia_llegar;
ROLLBACK;

-- ─── 6. UPDATE directo a challenges (bypass del RPC) por usuario ajeno ──────
-- No pasa por ningún RPC SECURITY DEFINER, así que hace falta bajar al rol
-- `authenticated` para que la RLS se aplique de verdad (el rol admin de este
-- script tiene BYPASSRLS). Esperado: filas_afectadas = 0.
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-000000000007"}', true);
WITH updated AS (
  UPDATE public.challenges SET status = 'ACEPTADA'
  WHERE id = 'f786f93c-897f-4d10-8fea-796a8093f1ba'::uuid
  RETURNING id
)
SELECT count(*) AS filas_afectadas FROM updated;
ROLLBACK;

-- ─── 7. checkin_team — geofence obligatorio cuando el venue tiene coords ────
-- Se le asigna temporalmente un venue con coordenadas a un match real, sólo
-- dentro de esta transacción (el ROLLBACK final lo revierte). Un miembro
-- legítimo (CAPITAN) intenta el check-in sin mandar GPS.
-- Esperado: EXCEPTION "El check-in requiere tu ubicación GPS..."
BEGIN;
UPDATE public.matches
SET venue_id = '2911414c-94d3-440a-8921-a54169f493bb'::uuid
WHERE id = '44444444-4444-4444-4444-000000000001'::uuid;
SELECT set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-000000000001"}', true);
SELECT public.checkin_team(
  '44444444-4444-4444-4444-000000000001'::uuid,
  '22222222-2222-2222-2222-222222222221'::uuid,
  NULL, NULL
) AS resultado_no_deberia_llegar;
ROLLBACK;
