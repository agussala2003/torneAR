-- ============================================================
-- C1 / C2 SECURITY REGRESSION — bloque CRÍTICO del audit 2026-07-10
-- ============================================================
-- Qué es esto: pruebas de regresión de los 2 fixes CRÍTICOS del 10 jul 2026:
--   C1 — resolve_match: guarda anti-reentrada + revoke de EXECUTE.
--        (migration 20260710_c1_resolve_match_reentrancy_guard.sql)
--   C2 — get_market_inbox: cierre del IDOR sobre inboxes de mercado.
--        (migration 20260710_c2_market_inbox_idor_guard.sql)
--
-- Cada bloque es un BEGIN...ROLLBACK independiente y AUTOCONTENIDO — nunca
-- hay COMMIT, así que correrlo contra el proyecto real es seguro: no modifica
-- ningún dato. Recomendado pegar bloque por bloque para leer cada resultado.
--
-- Cómo leer el resultado:
--   - C1a espera que la llamada al RPC lance EXCEPTION
--     ("permission denied for function resolve_match"). Si devuelve void sin
--     error, el REVOKE se perdió y el RPC volvió a quedar expuesto.
--   - C1b / C2a / C2b son auto-verificantes: lanzan EXCEPTION con prefijo
--     "Cxx FALLÓ:" si la regresión reapareció, o emiten un NOTICE "Cxx OK:"
--     si el fix sigue vigente. Éxito = la transacción termina sin error.
--
-- IDs de seed usados (si el seed cambia, actualizar acá):
--   match FINALIZADO : 44444444-4444-4444-4444-000000000001
--     team_a         : 22222222-2222-2222-2222-222222222221
--   market convo     : 00861a5e-e9f1-4e20-8a9f-9bd1341c5d2a
--     player profile : ef88b757-4d4e-48b1-b300-51da1cb2e678  (auth 8e7bd5df-5201-4622-8f6b-b94725c18da8)
--     otro profile   : c9f061c9-c82d-4d66-813f-53d56e9c8158
--
-- Última corrida: 10 jul 2026 — los 4 casos dieron el resultado esperado.
-- ============================================================


-- ─── C1a. resolve_match — REVOKE: un usuario `authenticated` no puede ejecutarla ───
-- Esperado: EXCEPTION "permission denied for function resolve_match".
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"8e7bd5df-5201-4622-8f6b-b94725c18da8"}', true);
SELECT public.resolve_match('44444444-4444-4444-4444-000000000001'::uuid) AS resultado_no_deberia_llegar;
ROLLBACK;


-- ─── C1b. resolve_match — guarda anti-reentrada: partido FINALIZADO no re-acumula ───
-- Llama resolve_match sobre un partido ya FINALIZADO y verifica que matches_played
-- del team_a no cambió. Antes del fix, cada llamada volvía a sumar stats/ELO.
-- Esperado: NOTICE "C1b OK". Si double-counting: EXCEPTION "C1b FALLÓ".
BEGIN;
DO $$
DECLARE
  v_before integer;
  v_after  integer;
BEGIN
  SELECT matches_played INTO v_before FROM teams WHERE id = '22222222-2222-2222-2222-222222222221';
  PERFORM public.resolve_match('44444444-4444-4444-4444-000000000001'::uuid);
  SELECT matches_played INTO v_after  FROM teams WHERE id = '22222222-2222-2222-2222-222222222221';
  IF v_before IS DISTINCT FROM v_after THEN
    RAISE EXCEPTION 'C1b FALLÓ: guarda anti-reentrada inactiva (matches_played % -> %)', v_before, v_after;
  END IF;
  RAISE NOTICE 'C1b OK: matches_played sin cambios (%).', v_after;
END $$;
ROLLBACK;


-- ─── C2a. get_market_inbox — IDOR: usuario A no puede leer el inbox de otro perfil ───
-- Autenticado como el player (profile ef88b757), pide el inbox pasando el ID de
-- OTRO perfil (c9f061c9). Esperado: 0 filas -> NOTICE "C2a OK".
-- Antes del fix devolvía el inbox privado ajeno.
BEGIN;
SELECT set_config('request.jwt.claims', '{"sub":"8e7bd5df-5201-4622-8f6b-b94725c18da8"}', true);
DO $$
DECLARE v_n integer;
BEGIN
  SELECT count(*) INTO v_n
  FROM public.get_market_inbox('c9f061c9-c82d-4d66-813f-53d56e9c8158'::uuid);
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'C2a FALLÓ: IDOR abierto, devolvió % filas del inbox ajeno', v_n;
  END IF;
  RAISE NOTICE 'C2a OK: inbox ajeno devolvió 0 filas.';
END $$;
ROLLBACK;


-- ─── C2b. get_market_inbox — acceso legítimo: el usuario SÍ ve su propio inbox ───
-- Mismo usuario A pero pidiendo su propio profile_id (ef88b757). El player
-- participa al menos en la conversación 00861a5e. Esperado: >= 1 fila.
-- Verifica que la guarda IDOR no rompió el camino feliz.
BEGIN;
SELECT set_config('request.jwt.claims', '{"sub":"8e7bd5df-5201-4622-8f6b-b94725c18da8"}', true);
DO $$
DECLARE v_n integer;
BEGIN
  SELECT count(*) INTO v_n
  FROM public.get_market_inbox('ef88b757-4d4e-48b1-b300-51da1cb2e678'::uuid);
  IF v_n < 1 THEN
    RAISE EXCEPTION 'C2b FALLÓ: el usuario no puede ver su propio inbox (% filas)', v_n;
  END IF;
  RAISE NOTICE 'C2b OK: inbox propio devolvió % filas.', v_n;
END $$;
ROLLBACK;
