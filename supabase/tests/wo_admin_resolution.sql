-- ============================================================
-- WO Admin Resolution — resolve_wo_claim + get_pending_wo_claims
-- (refactor 2026-07-14: formato auto-verificante)
-- ============================================================
-- Prueba la resolución administrativa de reclamos de WO
-- (20260714002506_wo_admin_resolution.sql + hardening de
-- 20260714022651_hotfix_security_rls.sql: FOR UPDATE, guarda terminal y
-- resolved_by).
--
-- Todo corre en un BEGIN...ROLLBACK con escenario propio (equipos, partidos
-- y claims). Sólo referencia los perfiles del seed del repo (supabase/seed.sql):
--   admin de prueba : 33333333-3333-3333-3333-000000000004 (auth aaaaaaaa-...-0004)
--   no-admin        : 33333333-3333-3333-3333-000000000001 (auth aaaaaaaa-...-0001)
--
-- Auto-verificante: EXCEPTION "WA-n FALLÓ:" ante regresión.
-- Última corrida: 14 jul 2026 — los 10 casos OK (local y proyecto real).
-- ============================================================

BEGIN;
DO $$
DECLARE
  c_admin CONSTANT uuid := '33333333-3333-3333-3333-000000000004';
  v_ta uuid; v_tb uuid; v_m1 uuid; v_m2 uuid; v_c1 uuid; v_c2 uuid;
  v_ta_w0 int; v_ta_gf0 int; v_ta_elo0 int;
  v_tb_l0 int; v_tb_ga0 int; v_tb_elo0 int;
  t teams%rowtype;
  v_status text; v_resolved_by uuid;
  v_gs int; v_ga int;
  v_seen boolean;
BEGIN
  UPDATE profiles SET is_admin = true WHERE id = c_admin;

  INSERT INTO teams (name, category, zone, preferred_format) VALUES ('TA_WO', 'HOMBRES', 'ZWO_TEST', 'FUTBOL_5') RETURNING id INTO v_ta;
  INSERT INTO teams (name, category, zone, preferred_format) VALUES ('TB_WO', 'HOMBRES', 'ZWO_TEST', 'FUTBOL_5') RETURNING id INTO v_tb;
  -- Con season_id: al aprobar, el motor unificado escribe elo_history y la
  -- columna season_id es NOT NULL (igual que en producción).
  INSERT INTO matches (team_a_id, team_b_id, status, match_type, format, season_id)
  VALUES (v_ta, v_tb, 'CONFIRMADO', 'RANKING', 'FUTBOL_5', (SELECT id FROM seasons WHERE is_active = true LIMIT 1))
  RETURNING id INTO v_m1;
  INSERT INTO matches (team_a_id, team_b_id, status, match_type, format, season_id)
  VALUES (v_ta, v_tb, 'CONFIRMADO', 'RANKING', 'FUTBOL_5', (SELECT id FROM seasons WHERE is_active = true LIMIT 1))
  RETURNING id INTO v_m2;

  INSERT INTO wo_claims (match_id, claimed_by, claiming_team_id, photo_url, reason, status, scorers, mvp_id)
  VALUES (v_m1, c_admin, v_ta, 'wo_evidences/x.jpg', 'NO_PRESENTACION', 'PENDIENTE_REVISION',
          jsonb_build_array(jsonb_build_object('profile_id', c_admin, 'goals', 3)), c_admin)
  RETURNING id INTO v_c1;
  INSERT INTO wo_claims (match_id, claimed_by, claiming_team_id, photo_url, reason, status)
  VALUES (v_m2, c_admin, v_ta, 'wo_evidences/y.jpg', 'ABANDONO', 'PENDIENTE_REVISION')
  RETURNING id INTO v_c2;

  -- ── 1/2. No-admin: ambas RPCs rechazan ────────────────────────────────────
  PERFORM set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-000000000001"}', true);
  BEGIN
    PERFORM resolve_wo_claim(v_c1, true, NULL);
    RAISE EXCEPTION 'WA-1 FALLÓ: un no-admin resolvió un reclamo';
  EXCEPTION
    WHEN raise_exception THEN
      IF SQLERRM NOT LIKE '%No autorizado%' THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM count(*) FROM get_pending_wo_claims();
    RAISE EXCEPTION 'WA-2 FALLÓ: un no-admin listó los reclamos pendientes';
  EXCEPTION
    WHEN raise_exception THEN
      IF SQLERRM NOT LIKE '%No autorizado%' THEN RAISE; END IF;
  END;

  -- ── Como admin: el claim aparece en pendientes ────────────────────────────
  PERFORM set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-000000000004"}', true);
  SELECT exists(SELECT 1 FROM get_pending_wo_claims() WHERE claim_id = v_c1) INTO v_seen;
  IF NOT v_seen THEN
    RAISE EXCEPTION 'WA-3 FALLÓ: el claim pendiente no aparece en get_pending_wo_claims';
  END IF;

  SELECT season_wins, season_goals_for, elo_rating INTO v_ta_w0, v_ta_gf0, v_ta_elo0 FROM teams WHERE id = v_ta;
  SELECT season_losses, season_goals_against, elo_rating INTO v_tb_l0, v_tb_ga0, v_tb_elo0 FROM teams WHERE id = v_tb;

  -- ── 4-7. Aprobar claim1: estado + 3-0 + stats/ELO del motor unificado ─────
  PERFORM resolve_wo_claim(v_c1, true, 'aprobado en test');

  SELECT wc.status::text, wc.resolved_by INTO v_status, v_resolved_by FROM wo_claims wc WHERE wc.id = v_c1;
  IF v_status <> 'APROBADO' OR v_resolved_by IS DISTINCT FROM c_admin THEN
    RAISE EXCEPTION 'WA-4 FALLÓ: claim status=% resolved_by=% (esperado APROBADO/admin)', v_status, v_resolved_by;
  END IF;
  SELECT m.status::text INTO v_status FROM matches m WHERE m.id = v_m1;
  IF v_status <> 'WO_A' THEN
    RAISE EXCEPTION 'WA-5 FALLÓ: el partido quedó en % (esperado WO_A)', v_status;
  END IF;
  SELECT goals_scored, goals_against INTO v_gs, v_ga FROM match_results WHERE match_id = v_m1 AND team_id = v_ta;
  IF v_gs <> 3 OR v_ga <> 0 THEN
    RAISE EXCEPTION 'WA-6 FALLÓ: resultado %-% (esperado 3-0)', v_gs, v_ga;
  END IF;
  SELECT * INTO t FROM teams WHERE id = v_ta;
  IF t.season_wins <> v_ta_w0 + 1 OR t.season_goals_for <> v_ta_gf0 + 3 OR t.elo_rating <= v_ta_elo0 THEN
    RAISE EXCEPTION 'WA-7a FALLÓ (ganador): w=% gf=% elo=%', t.season_wins, t.season_goals_for, t.elo_rating;
  END IF;
  SELECT * INTO t FROM teams WHERE id = v_tb;
  IF t.season_losses <> v_tb_l0 + 1 OR t.season_goals_against <> v_tb_ga0 + 3 OR t.elo_rating >= v_tb_elo0 THEN
    RAISE EXCEPTION 'WA-7b FALLÓ (ausente): l=% gc=% elo=%', t.season_losses, t.season_goals_against, t.elo_rating;
  END IF;

  -- ── 8/9. Rechazar claim2: el partido no cambia ────────────────────────────
  PERFORM resolve_wo_claim(v_c2, false, 'evidencia insuficiente');
  SELECT wc.status::text INTO v_status FROM wo_claims wc WHERE wc.id = v_c2;
  IF v_status <> 'RECHAZADO' THEN
    RAISE EXCEPTION 'WA-8 FALLÓ: claim2 quedó en % (esperado RECHAZADO)', v_status;
  END IF;
  SELECT m.status::text INTO v_status FROM matches m WHERE m.id = v_m2;
  IF v_status <> 'CONFIRMADO' THEN
    RAISE EXCEPTION 'WA-9 FALLÓ: el partido del claim rechazado cambió a %', v_status;
  END IF;

  -- ── 10. get_pending deja de mostrar lo resuelto ───────────────────────────
  SELECT exists(SELECT 1 FROM get_pending_wo_claims() WHERE claim_id IN (v_c1, v_c2)) INTO v_seen;
  IF v_seen THEN
    RAISE EXCEPTION 'WA-10 FALLÓ: un claim resuelto sigue apareciendo como pendiente';
  END IF;

  RAISE NOTICE 'WA OK: resolución administrativa de WOs intacta (10 casos).';
END $$;
ROLLBACK;
