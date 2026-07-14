-- ============================================================
-- G6 — RPC claim_wo: validación de goleadores + MVP en el WO
-- (refactor 2026-07-14: formato auto-verificante + escenario propio)
-- ============================================================
-- Prueba la RPC public.claim_wo (20260713201810_g6_wo_scorers_mvp.sql).
--
-- Todo corre en un BEGIN...ROLLBACK que crea su propio partido y participante
-- con check-in. Sólo referencia los perfiles del seed del repo
-- (supabase/seed.sql — mismos IDs en local y en el proyecto real):
--   capitán Leones (reclama) : 33333333-3333-3333-3333-000000000001 (auth aaaaaaaa-...-0001)
--   rival (Tigres)           : 33333333-3333-3333-3333-000000000004
--   outsider                 : auth 8e7bd5df-5201-4622-8f6b-b94725c18da8
--
-- Auto-verificante: EXCEPTION "G6-n FALLÓ:" si alguna validación se rompió.
-- Última corrida: 14 jul 2026 — los 6 casos OK (local y proyecto real).
-- ============================================================

BEGIN;
DO $$
DECLARE
  c_leones CONSTANT uuid := '22222222-2222-2222-2222-222222222221';
  c_tigres CONSTANT uuid := '22222222-2222-2222-2222-222222222222';
  c_cap    CONSTANT uuid := '33333333-3333-3333-3333-000000000001';
  c_rival  CONSTANT uuid := '33333333-3333-3333-3333-000000000004';
  v_match uuid;
  v_id    uuid;
BEGIN
  -- Setup: partido CONFIRMADO + capitán de Leones con check-in.
  INSERT INTO matches (team_a_id, team_b_id, match_type, status, scheduled_at)
  VALUES (c_leones, c_tigres, 'RANKING', 'CONFIRMADO', now() - interval '1 hour')
  RETURNING id INTO v_match;
  INSERT INTO match_participants (match_id, profile_id, team_id, did_checkin)
  VALUES (v_match, c_cap, c_leones, true);

  PERFORM set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-000000000001"}', true);

  -- ── 1. Happy path: capitán, 3 goles propios, MVP propio ───────────────────
  v_id := claim_wo(v_match, c_leones, 'NO_PRESENTACION', 'evidencia/e.jpg',
    jsonb_build_array(jsonb_build_object('profile_id', c_cap, 'goals', 3)), c_cap);
  IF v_id IS NULL THEN
    RAISE EXCEPTION 'G6-1 FALLÓ: el happy path no devolvió el id del reclamo';
  END IF;
  -- Se elimina para no chocar con el UNIQUE(match_id) en los casos siguientes.
  DELETE FROM wo_claims WHERE id = v_id;

  -- ── 2. Rechaza suma de goles > 3 ──────────────────────────────────────────
  BEGIN
    PERFORM claim_wo(v_match, c_leones, 'NO_PRESENTACION', 'p.jpg',
      jsonb_build_array(jsonb_build_object('profile_id', c_cap, 'goals', 4)), NULL);
    RAISE EXCEPTION 'G6-2 FALLÓ: aceptó goles que superan el 3-0 del WO';
  EXCEPTION
    WHEN raise_exception THEN
      IF SQLERRM LIKE '%FALLÓ%' THEN RAISE; END IF;
  END;

  -- ── 3. Rechaza goleador rival (no participante del equipo reclamante) ─────
  BEGIN
    PERFORM claim_wo(v_match, c_leones, 'NO_PRESENTACION', 'p.jpg',
      jsonb_build_array(jsonb_build_object('profile_id', c_rival, 'goals', 1)), NULL);
    RAISE EXCEPTION 'G6-3 FALLÓ: aceptó un goleador que no pertenece al equipo';
  EXCEPTION
    WHEN raise_exception THEN
      IF SQLERRM LIKE '%FALLÓ%' THEN RAISE; END IF;
  END;

  -- ── 4. Rechaza emisor no autorizado (ni rol de equipo ni check-in) ────────
  PERFORM set_config('request.jwt.claims', '{"sub":"8e7bd5df-5201-4622-8f6b-b94725c18da8"}', true);
  BEGIN
    PERFORM claim_wo(v_match, c_leones, 'NO_PRESENTACION', 'p.jpg', '[]'::jsonb, NULL);
    RAISE EXCEPTION 'G6-4 FALLÓ: un outsider pudo reclamar el WO';
  EXCEPTION
    WHEN raise_exception THEN
      IF SQLERRM LIKE '%FALLÓ%' THEN RAISE; END IF;
  END;
  PERFORM set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-000000000001"}', true);

  -- ── 5. Rechaza MVP ajeno al equipo reclamante ─────────────────────────────
  BEGIN
    PERFORM claim_wo(v_match, c_leones, 'NO_PRESENTACION', 'p.jpg',
      jsonb_build_array(jsonb_build_object('profile_id', c_cap, 'goals', 1)), c_rival);
    RAISE EXCEPTION 'G6-5 FALLÓ: aceptó un MVP que no pertenece al equipo';
  EXCEPTION
    WHEN raise_exception THEN
      IF SQLERRM LIKE '%FALLÓ%' THEN RAISE; END IF;
  END;

  -- ── 6. Rechaza más de 3 goleadores ────────────────────────────────────────
  BEGIN
    PERFORM claim_wo(v_match, c_leones, 'NO_PRESENTACION', 'p.jpg',
      jsonb_build_array(
        jsonb_build_object('profile_id', c_cap, 'goals', 1),
        jsonb_build_object('profile_id', c_cap, 'goals', 1),
        jsonb_build_object('profile_id', c_cap, 'goals', 1),
        jsonb_build_object('profile_id', c_cap, 'goals', 1)
      ), NULL);
    RAISE EXCEPTION 'G6-6 FALLÓ: aceptó más de 3 goleadores';
  EXCEPTION
    WHEN raise_exception THEN
      IF SQLERRM LIKE '%FALLÓ%' THEN RAISE; END IF;
  END;

  RAISE NOTICE 'G6 OK: claim_wo valida goleadores, MVP y autorización.';
END $$;
ROLLBACK;
