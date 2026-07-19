-- ============================================================
-- C1 / C2 SECURITY REGRESSION — bloque CRÍTICO del audit 2026-07-10
-- (refactor 2026-07-14: formato auto-verificante + escenario propio)
-- ============================================================
-- Regresión de los 2 fixes CRÍTICOS del 10-jul-2026:
--   C1 — resolve_match: REVOKE de EXECUTE + guarda anti-reentrada.
--        (20260710_c1_resolve_match_reentrancy_guard.sql; la guarda vive hoy
--        en el motor unificado de 20260713_elo_engine_unification.sql)
--   C2 — get_market_inbox: cierre del IDOR sobre inboxes de mercado.
--        (20260710_c2_market_inbox_idor_guard.sql)
--
-- Cada bloque corre en BEGIN...ROLLBACK y crea su propio escenario (equipos,
-- partidos, conversaciones). Sólo referencia los perfiles del seed del repo
-- (supabase/seed.sql — mismos IDs en local y en el proyecto real):
--   capitán A       : 33333333-3333-3333-3333-000000000004 (auth aaaaaaaa-...-0004)
--   player mercado  : ef88b757-4d4e-48b1-b300-51da1cb2e678 (auth 8e7bd5df-...)
--
-- Auto-verificante: EXCEPTION "Cx FALLÓ:" si la regresión reapareció.
-- Última corrida: 14 jul 2026 — C1a/C1b/C2a/C2b OK (local y proyecto real).
-- ============================================================


-- ─── C1a. resolve_match — REVOKE: `authenticated` no puede ejecutarla ────────
BEGIN;
DO $$
BEGIN
  PERFORM set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-000000000004"}', true);
  PERFORM set_config('role', 'authenticated', true);
  BEGIN
    PERFORM public.resolve_match(gen_random_uuid());
    PERFORM set_config('role', 'none', true);
    RAISE EXCEPTION 'C1a FALLÓ: authenticated pudo ejecutar resolve_match (el REVOKE se perdió)';
  EXCEPTION
    WHEN insufficient_privilege THEN
      PERFORM set_config('role', 'none', true);
  END;
  RAISE NOTICE 'C1a OK: resolve_match sigue revocada para authenticated.';
END $$;
ROLLBACK;


-- ─── C1b. resolve_match — anti-reentrada: un partido terminal no reprocesa ───
BEGIN;
DO $$
DECLARE
  v_ta uuid;
  v_tb uuid;
  v_m  uuid;
  v_mp_before integer;
  v_mp_after  integer;
  v_status    match_status;
BEGIN
  INSERT INTO teams (name, category, zone, preferred_format)
  VALUES ('__TEST C1 A', 'MIXTO', '__ZC1', 'FUTBOL_5') RETURNING id INTO v_ta;
  INSERT INTO teams (name, category, zone, preferred_format)
  VALUES ('__TEST C1 B', 'MIXTO', '__ZC1', 'FUTBOL_5') RETURNING id INTO v_tb;

  INSERT INTO matches (team_a_id, team_b_id, match_type, status, scheduled_at)
  VALUES (v_ta, v_tb, 'RANKING', 'FINALIZADO', now()) RETURNING id INTO v_m;

  SELECT matches_played INTO v_mp_before FROM teams WHERE id = v_ta;
  PERFORM public.resolve_match(v_m);
  SELECT matches_played INTO v_mp_after FROM teams WHERE id = v_ta;
  SELECT status INTO v_status FROM matches WHERE id = v_m;

  IF v_mp_before IS DISTINCT FROM v_mp_after OR v_status <> 'FINALIZADO' THEN
    RAISE EXCEPTION 'C1b FALLÓ: guarda anti-reentrada inactiva (mp %->%, status %)',
      v_mp_before, v_mp_after, v_status;
  END IF;
  RAISE NOTICE 'C1b OK: un partido terminal no re-acumula stats.';
END $$;
ROLLBACK;


-- ─── C2a. get_market_inbox — IDOR: no se puede leer un inbox ajeno ───────────
BEGIN;
DO $$
DECLARE
  v_conv uuid;
  v_n    integer;
BEGIN
  -- Conversación de mercado del player (get-or-create: el índice único
  -- (player_id, team_id) impide duplicar una conversación existente, y en
  -- el proyecto real puede ya haber una para este par).
  SELECT id INTO v_conv FROM conversations
   WHERE type = 'MARKET_DM'
     AND player_id = 'ef88b757-4d4e-48b1-b300-51da1cb2e678'
     AND team_id   = '22222222-2222-2222-2222-222222222223';
  IF v_conv IS NULL THEN
    INSERT INTO conversations (type, player_id, team_id)
    VALUES ('MARKET_DM', 'ef88b757-4d4e-48b1-b300-51da1cb2e678',
            '22222222-2222-2222-2222-222222222223')
    RETURNING id INTO v_conv;
  END IF;
  INSERT INTO messages (conversation_id, sender_profile_id, content)
  VALUES (v_conv, 'ef88b757-4d4e-48b1-b300-51da1cb2e678', '__test c2');

  -- Autenticado como el player, pide el inbox de OTRO perfil.
  PERFORM set_config('request.jwt.claims', '{"sub":"8e7bd5df-5201-4622-8f6b-b94725c18da8"}', true);
  SELECT count(*) INTO v_n
  FROM public.get_market_inbox('33333333-3333-3333-3333-000000000004'::uuid);
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'C2a FALLÓ: IDOR abierto — devolvió % filas del inbox ajeno', v_n;
  END IF;
  RAISE NOTICE 'C2a OK: el inbox ajeno devuelve 0 filas.';

  -- ─── C2b. Camino feliz: SÍ ve su propio inbox ──────────────────────────────
  SELECT count(*) INTO v_n
  FROM public.get_market_inbox('ef88b757-4d4e-48b1-b300-51da1cb2e678'::uuid);
  IF v_n < 1 THEN
    RAISE EXCEPTION 'C2b FALLÓ: el usuario no puede ver su propio inbox (% filas)', v_n;
  END IF;
  RAISE NOTICE 'C2b OK: el inbox propio devuelve % filas.', v_n;
END $$;
ROLLBACK;
