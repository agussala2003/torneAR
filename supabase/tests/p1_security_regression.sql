-- ============================================================
-- P1 SECURITY REGRESSION — 10 bugs críticos de marzo 2026
-- (refactor 2026-07-14: formato auto-verificante + escenario propio)
-- ============================================================
-- Prueba de humo de los casos de "intento no autorizado" de los bugs
-- críticos de la auditoría de marzo 2026 (docs/auditoria.md), arreglados el
-- 28-mar y re-verificados el 8-jul-2026.
--
-- Todo corre en un único BEGIN...ROLLBACK que arma su propio escenario
-- (membresías, desafío, partido, propuesta y venue). Sólo referencia los
-- perfiles del seed del repo (supabase/seed.sql — mismos IDs en local y en
-- el proyecto real):
--   capitán Leones : 33333333-3333-3333-3333-000000000001 (auth aaaaaaaa-...-0001)
--   capitán Tigres : 33333333-3333-3333-3333-000000000004 (auth aaaaaaaa-...-0004)
--   capitán Rayos  : 33333333-3333-3333-3333-000000000007 (auth aaaaaaaa-...-0007)
--   sin equipo     : ef88b757-4d4e-48b1-b300-51da1cb2e678 (auth 8e7bd5df-...)
--
-- Auto-verificante: EXCEPTION "Pn FALLÓ:" si algún bug de marzo reabrió.
-- Última corrida: 14 jul 2026 — los 7 casos OK (local y proyecto real).
-- ============================================================

BEGIN;
DO $$
DECLARE
  c_leones CONSTANT uuid := '22222222-2222-2222-2222-222222222221';
  c_tigres CONSTANT uuid := '22222222-2222-2222-2222-222222222222';
  c_rayos  CONSTANT uuid := '22222222-2222-2222-2222-222222222223';
  v_ch    uuid;
  v_match uuid;
  v_prop  uuid;
  v_venue uuid;
  v_rows  integer;
BEGIN
  -- Setup: el capitán de Rayos entra como JUGADOR raso de Leones.
  INSERT INTO team_members (team_id, profile_id, role)
  VALUES (c_leones, '33333333-3333-3333-3333-000000000007', 'JUGADOR');

  -- ── 1. send_challenge invocado por un JUGADOR (no admin) ──────────────────
  PERFORM set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-000000000007"}', true);
  BEGIN
    PERFORM public.send_challenge(c_leones, c_tigres, 'AMISTOSO');
    RAISE EXCEPTION 'P1-1 FALLÓ: un JUGADOR pudo enviar un desafío en nombre del equipo';
  EXCEPTION
    WHEN raise_exception THEN
      IF SQLERRM NOT LIKE '%No autorizado%' THEN RAISE; END IF;
  END;

  -- ── 2. accept_challenge invocado por alguien ajeno al equipo receptor ─────
  INSERT INTO challenges (from_team_id, to_team_id, created_by, status)
  VALUES (c_leones, c_rayos, '33333333-3333-3333-3333-000000000001', 'ENVIADA')
  RETURNING id INTO v_ch;

  PERFORM set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-000000000004"}', true);
  BEGIN
    PERFORM public.accept_challenge(v_ch);
    RAISE EXCEPTION 'P1-2 FALLÓ: un ajeno al equipo receptor aceptó el desafío';
  EXCEPTION
    WHEN raise_exception THEN
      IF SQLERRM NOT LIKE '%No autorizado%' THEN RAISE; END IF;
  END;

  -- ── 3. confirm_match_proposal invocado por el propio equipo proponente ────
  INSERT INTO matches (team_a_id, team_b_id, match_type, status, scheduled_at)
  VALUES (c_leones, c_tigres, 'AMISTOSO', 'PENDIENTE', now() + interval '7 days')
  RETURNING id INTO v_match;
  INSERT INTO match_proposals (match_id, proposed_by, from_team_id, format, match_type, scheduled_at, duration_minutes)
  VALUES (v_match, '33333333-3333-3333-3333-000000000001', c_leones, 'FUTBOL_5', 'AMISTOSO', now() + interval '7 days', 60)
  RETURNING id INTO v_prop;

  PERFORM set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-000000000001"}', true);
  BEGIN
    PERFORM public.confirm_match_proposal(v_prop, v_match);
    RAISE EXCEPTION 'P1-3 FALLÓ: el equipo proponente confirmó su propia propuesta';
  EXCEPTION
    WHEN raise_exception THEN
      IF SQLERRM NOT LIKE '%No autorizado%' THEN RAISE; END IF;
  END;

  -- ── 4. checkin_team invocado por alguien sin equipo en el partido ─────────
  UPDATE matches SET status = 'CONFIRMADO', format = 'FUTBOL_5' WHERE id = v_match;
  PERFORM set_config('request.jwt.claims', '{"sub":"8e7bd5df-5201-4622-8f6b-b94725c18da8"}', true);
  BEGIN
    PERFORM public.checkin_team(v_match, c_leones, NULL, NULL);
    RAISE EXCEPTION 'P1-4 FALLÓ: un no-miembro hizo check-in por el equipo';
  EXCEPTION
    WHEN raise_exception THEN
      IF SQLERRM NOT LIKE '%No autorizado%' THEN RAISE; END IF;
  END;

  -- ── 5. request_match_cancellation invocado por un JUGADOR (no admin) ──────
  PERFORM set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-000000000007"}', true);
  BEGIN
    PERFORM public.request_match_cancellation(v_match, c_leones, 'MUTUO_ACUERDO', NULL);
    RAISE EXCEPTION 'P1-5 FALLÓ: un JUGADOR pudo solicitar la cancelación del partido';
  EXCEPTION
    WHEN raise_exception THEN
      IF SQLERRM NOT LIKE '%No autorizado%' THEN RAISE; END IF;
  END;

  -- ── 6. UPDATE directo a challenges por un usuario ajeno (bypass del RPC) ──
  PERFORM set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-000000000004"}', true);
  PERFORM set_config('role', 'authenticated', true);
  UPDATE public.challenges SET status = 'ACEPTADA' WHERE id = v_ch;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  PERFORM set_config('role', 'none', true);
  IF v_rows <> 0 THEN
    RAISE EXCEPTION 'P1-6 FALLÓ: RLS dejó pasar el UPDATE directo de un ajeno (% filas)', v_rows;
  END IF;

  -- ── 7. checkin_team — geofence obligatorio cuando el venue tiene coords ───
  INSERT INTO venues (name, lat, lng)
  VALUES ('__TEST P1 Venue', -34.6037, -58.3816) RETURNING id INTO v_venue;
  UPDATE matches SET venue_id = v_venue WHERE id = v_match;

  PERFORM set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-000000000001"}', true);
  BEGIN
    PERFORM public.checkin_team(v_match, c_leones, NULL, NULL);
    RAISE EXCEPTION 'P1-7 FALLÓ: check-in sin GPS aceptado con venue georreferenciado';
  EXCEPTION
    WHEN raise_exception THEN
      IF SQLERRM NOT LIKE '%GPS%' AND SQLERRM NOT LIKE '%ubicación%' THEN RAISE; END IF;
  END;

  RAISE NOTICE 'P1 OK: los 7 intentos no autorizados siguen bloqueados.';
END $$;
ROLLBACK;
