-- ============================================================
-- HOTFIX SECURITY RLS — REGRESIÓN del audit 360° 2026-07-13
-- ============================================================
-- Qué es esto: pruebas de regresión de los fixes ROJOS #2 y #3 del audit del
-- 13 jul 2026 + cierre del Paso 2 de G6:
--   H1 — profiles: un usuario NO puede auto-asignarse is_admin.
--   H2 — teams: un CAPITAN NO puede editar elo_rating (ni stats de sistema).
--   H3 — wo_claims: el INSERT directo está bloqueado (sólo RPC claim_wo).
--   H4 — camino feliz: el capitán SÍ puede editar name del equipo y el usuario
--        SÍ puede editar su propio full_name (el lockdown no rompió la app).
--   H5 — resolve_wo_claim: guarda de estado terminal + registro de resolved_by.
--        (migration 20260713_hotfix_security_rls.sql)
--
-- Cada bloque es un BEGIN...ROLLBACK independiente y AUTOCONTENIDO — nunca
-- hay COMMIT, así que correrlo contra el proyecto real es seguro: no modifica
-- ningún dato.
--
-- Cómo leer el resultado: todos los bloques son auto-verificantes; lanzan
-- EXCEPTION con prefijo "Hx FALLÓ:" si la vulnerabilidad reapareció, o emiten
-- un NOTICE "Hx OK:" si el fix sigue vigente. Éxito = la transacción termina
-- sin error.
--
-- IDs de seed usados (si el seed cambia, actualizar acá):
--   capitán           : 33333333-3333-3333-3333-000000000004
--     auth uid        : aaaaaaaa-0000-0000-0000-000000000004
--     equipo (Tigres) : 22222222-2222-2222-2222-222222222222
--   match FINALIZADO de Tigres sin claim: 44444444-4444-4444-4444-000000000003
--
-- Última corrida: 13 jul 2026 — los 5 casos dieron el resultado esperado.
-- ============================================================


-- ─── H1. profiles.is_admin — escalada de privilegios bloqueada ───────────────
-- Autenticado como el capitán, intenta setearse is_admin = true en su propio
-- row (la política profiles_update_own SÍ matchea el row; lo que debe frenar
-- es el privilegio de columna). Esperado: permission denied -> NOTICE "H1 OK".
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-000000000004"}', true);
DO $$
BEGIN
  UPDATE public.profiles
     SET is_admin = true
   WHERE id = '33333333-3333-3333-3333-000000000004';
  RAISE EXCEPTION 'H1 FALLÓ: el usuario pudo escribir su propio is_admin';
EXCEPTION
  WHEN insufficient_privilege THEN
    RAISE NOTICE 'H1 OK: UPDATE de is_admin rechazado (permission denied).';
END $$;
ROLLBACK;


-- ─── H2. teams.elo_rating — manipulación del ranking bloqueada ───────────────
-- Autenticado como el CAPITAN de Tigres, intenta inflar el elo_rating de su
-- propio equipo. Esperado: permission denied -> NOTICE "H2 OK".
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-000000000004"}', true);
DO $$
BEGIN
  UPDATE public.teams
     SET elo_rating = 9999
   WHERE id = '22222222-2222-2222-2222-222222222222';
  RAISE EXCEPTION 'H2 FALLÓ: el capitán pudo escribir elo_rating de su equipo';
EXCEPTION
  WHEN insufficient_privilege THEN
    RAISE NOTICE 'H2 OK: UPDATE de elo_rating rechazado (permission denied).';
END $$;
ROLLBACK;


-- ─── H3. wo_claims — INSERT directo bloqueado (sólo RPC claim_wo) ────────────
-- Autenticado como el CAPITAN de Tigres, intenta insertar un reclamo de WO
-- directo por tabla (el camino que antes permitía saltarse las validaciones
-- de claim_wo). Esperado: RLS lo rechaza -> NOTICE "H3 OK".
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-000000000004"}', true);
DO $$
BEGIN
  INSERT INTO public.wo_claims (match_id, claimed_by, claiming_team_id, photo_url, reason, status)
  VALUES (
    '44444444-4444-4444-4444-000000000003',
    '33333333-3333-3333-3333-000000000004',
    '22222222-2222-2222-2222-222222222222',
    'evidencia-falsa.jpg',
    'bypass de claim_wo',
    'PENDIENTE_REVISION'
  );
  RAISE EXCEPTION 'H3 FALLÓ: el INSERT directo a wo_claims fue aceptado';
EXCEPTION
  WHEN insufficient_privilege THEN
    RAISE NOTICE 'H3 OK: INSERT directo a wo_claims rechazado por RLS.';
END $$;
ROLLBACK;


-- ─── H4. Camino feliz — el lockdown no rompió los updates legítimos ──────────
-- El capitán edita el nombre de su equipo y su propio full_name (las columnas
-- que el DAL realmente escribe). Esperado: ambos updates afectan 1 fila.
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-000000000004"}', true);
DO $$
DECLARE
  v_rows integer;
BEGIN
  UPDATE public.teams
     SET name = name, updated_at = now()
   WHERE id = '22222222-2222-2222-2222-222222222222';
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 1 THEN
    RAISE EXCEPTION 'H4 FALLÓ: el capitán no pudo editar name/updated_at de su equipo (% filas)', v_rows;
  END IF;

  UPDATE public.profiles
     SET full_name = full_name, updated_at = now()
   WHERE id = '33333333-3333-3333-3333-000000000004';
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 1 THEN
    RAISE EXCEPTION 'H4 FALLÓ: el usuario no pudo editar su propio full_name (% filas)', v_rows;
  END IF;

  RAISE NOTICE 'H4 OK: updates legítimos de perfil y equipo siguen funcionando.';
END $$;
ROLLBACK;


-- ─── H5. resolve_wo_claim — guarda terminal + resolved_by ────────────────────
-- Como superusuario (dentro del ROLLBACK): promueve al capitán a admin, siembra
-- un claim PENDIENTE sobre un partido ya FINALIZADO y verifica que:
--   (a) aprobar lanza "estado terminal" (el 3-0 no pisa el resultado real), y
--   (b) rechazar funciona y graba resolved_by con el perfil del admin.
BEGIN;
SELECT set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-000000000004"}', true);
DO $$
DECLARE
  v_claim_id    uuid;
  v_status      text;
  v_resolved_by uuid;
BEGIN
  UPDATE public.profiles SET is_admin = true
   WHERE id = '33333333-3333-3333-3333-000000000004';

  INSERT INTO public.wo_claims (match_id, claimed_by, claiming_team_id, photo_url, reason, status)
  VALUES (
    '44444444-4444-4444-4444-000000000003',
    '33333333-3333-3333-3333-000000000004',
    '22222222-2222-2222-2222-222222222222',
    'evidencia.jpg',
    'test guarda terminal',
    'PENDIENTE_REVISION'
  )
  RETURNING id INTO v_claim_id;

  -- (a) Aprobar sobre partido FINALIZADO debe fallar con la guarda terminal.
  BEGIN
    PERFORM public.resolve_wo_claim(v_claim_id, true, 'no debería aplicarse');
    RAISE EXCEPTION 'H5 FALLÓ: se aprobó un WO sobre un partido FINALIZADO';
  EXCEPTION
    WHEN raise_exception THEN
      IF SQLERRM NOT LIKE '%estado terminal%' THEN
        RAISE;  -- otra excepción distinta a la guarda -> propagar
      END IF;
      RAISE NOTICE 'H5a OK: la guarda terminal frenó la aprobación (%).', SQLERRM;
  END;

  -- (b) Rechazar sí procede y graba la auditoría del admin.
  PERFORM public.resolve_wo_claim(v_claim_id, false, 'rechazado en test');
  SELECT status, resolved_by INTO v_status, v_resolved_by
    FROM public.wo_claims WHERE id = v_claim_id;
  IF v_status <> 'RECHAZADO' OR v_resolved_by IS DISTINCT FROM '33333333-3333-3333-3333-000000000004' THEN
    RAISE EXCEPTION 'H5 FALLÓ: rechazo sin auditoría (status=%, resolved_by=%)', v_status, v_resolved_by;
  END IF;
  RAISE NOTICE 'H5b OK: rechazo registrado con resolved_by=%.', v_resolved_by;
END $$;
ROLLBACK;
