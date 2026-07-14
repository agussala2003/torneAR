-- ============================================================
-- WO Admin Resolution — resolve_wo_claim + get_pending_wo_claims
-- ============================================================
-- Prueba la resolución administrativa de reclamos de WO
-- (migración 20260711_wo_admin_resolution.sql).
--
-- Todo corre en un BEGIN...ROLLBACK. Arma un escenario sintético AISLADO
-- (2 equipos + 2 partidos RANKING CONFIRMADOS + 2 claims PENDIENTE_REVISION),
-- marca un perfil real como admin y ejercita:
--   - No-admin: resolve_wo_claim y get_pending_wo_claims lanzan excepción.
--   - Aprobar: claim -> APROBADO, partido -> WO_A, match_results 3-0, y (vía
--     los triggers existentes) el ganador suma win + 3 goles a favor + ELO,
--     el perdedor suma loss + 3 goles en contra + baja de ELO.
--   - Rechazar: claim -> RECHAZADO, el partido queda igual (CONFIRMADO).
--   - get_pending_wo_claims muestra el claim pendiente y deja de mostrarlo
--     una vez resuelto.
-- NO persiste nada (rollback final).
--
-- Última corrida: 11 jul 2026 — los 10 casos dieron passed = true.
-- ============================================================

begin;
create temp table _r(name text, passed boolean) on commit drop;
do $$
declare
  v_admin_pid uuid; v_admin_auth uuid; v_nonadmin_auth uuid;
  v_ta uuid; v_tb uuid; v_m1 uuid; v_m2 uuid; v_c1 uuid; v_c2 uuid;
  v_ta_w0 int; v_ta_gf0 int; v_ta_elo0 int;
  v_tb_l0 int; v_tb_ga0 int; v_tb_elo0 int;
  v_ta_w1 int; v_ta_gf1 int; v_ta_elo1 int;
  v_tb_l1 int; v_tb_ga1 int; v_tb_elo1 int;
  v_c1_status text; v_m1_status text; v_mr_gs int; v_mr_ga int;
  v_c2_status text; v_m2_status text;
  v_pending_c1_before boolean; v_pending_c1_after boolean;
begin
  select id, auth_user_id into v_admin_pid, v_admin_auth
    from profiles where auth_user_id is not null order by created_at limit 1;
  select auth_user_id into v_nonadmin_auth
    from profiles where auth_user_id is not null and auth_user_id <> v_admin_auth order by created_at limit 1;
  update profiles set is_admin = true where id = v_admin_pid;

  insert into teams (name, category, zone, preferred_format) values ('TA_WO','HOMBRES','ZWO_TEST','FUTBOL_5') returning id into v_ta;
  insert into teams (name, category, zone, preferred_format) values ('TB_WO','HOMBRES','ZWO_TEST','FUTBOL_5') returning id into v_tb;

  insert into matches (team_a_id, team_b_id, status, match_type) values (v_ta, v_tb, 'CONFIRMADO', 'RANKING') returning id into v_m1;
  insert into matches (team_a_id, team_b_id, status, match_type) values (v_ta, v_tb, 'CONFIRMADO', 'RANKING') returning id into v_m2;

  insert into wo_claims (match_id, claimed_by, claiming_team_id, photo_url, reason, status, scorers, mvp_id)
    values (v_m1, v_admin_pid, v_ta, 'wo_evidences/x.jpg', 'NO_PRESENTACION', 'PENDIENTE_REVISION',
            jsonb_build_array(jsonb_build_object('profile_id', v_admin_pid::text, 'goals', 3)), v_admin_pid)
    returning id into v_c1;
  insert into wo_claims (match_id, claimed_by, claiming_team_id, photo_url, reason, status)
    values (v_m2, v_admin_pid, v_ta, 'wo_evidences/y.jpg', 'ABANDONO', 'PENDIENTE_REVISION')
    returning id into v_c2;

  -- 1. No-admin: resolve_wo_claim -> excepción
  perform set_config('request.jwt.claims', json_build_object('sub', v_nonadmin_auth)::text, true);
  begin
    perform resolve_wo_claim(v_c1, true, null);
    insert into _r values ('1_nonadmin_resolve_rejected', false);
  exception when others then insert into _r values ('1_nonadmin_resolve_rejected', true); end;

  -- 2. No-admin: get_pending_wo_claims -> excepción
  begin
    perform * from get_pending_wo_claims();
    insert into _r values ('2_nonadmin_get_pending_rejected', false);
  exception when others then insert into _r values ('2_nonadmin_get_pending_rejected', true); end;

  perform set_config('request.jwt.claims', json_build_object('sub', v_admin_auth)::text, true);
  select exists(select 1 from get_pending_wo_claims() where claim_id = v_c1) into v_pending_c1_before;

  select season_wins, season_goals_for, elo_rating into v_ta_w0, v_ta_gf0, v_ta_elo0 from teams where id = v_ta;
  select season_losses, season_goals_against, elo_rating into v_tb_l0, v_tb_ga0, v_tb_elo0 from teams where id = v_tb;

  -- 3. Aprobar claim1
  perform resolve_wo_claim(v_c1, true, 'aprobado');
  select status::text into v_c1_status from wo_claims where id = v_c1;
  select status::text into v_m1_status from matches where id = v_m1;
  select goals_scored, goals_against into v_mr_gs, v_mr_ga from match_results where match_id = v_m1 and team_id = v_ta;
  select season_wins, season_goals_for, elo_rating into v_ta_w1, v_ta_gf1, v_ta_elo1 from teams where id = v_ta;
  select season_losses, season_goals_against, elo_rating into v_tb_l1, v_tb_ga1, v_tb_elo1 from teams where id = v_tb;

  insert into _r values ('3_approve_claim_APROBADO', v_c1_status = 'APROBADO');
  insert into _r values ('4_approve_match_WO_A', v_m1_status = 'WO_A');
  insert into _r values ('5_approve_result_3_0', v_mr_gs = 3 and v_mr_ga = 0);
  insert into _r values ('6_winner_win_goals_elo', v_ta_w1 = v_ta_w0 + 1 and v_ta_gf1 = v_ta_gf0 + 3 and v_ta_elo1 > v_ta_elo0);
  insert into _r values ('7_loser_loss_goalsagainst_elo', v_tb_l1 = v_tb_l0 + 1 and v_tb_ga1 = v_tb_ga0 + 3 and v_tb_elo1 < v_tb_elo0);

  -- 4. Rechazar claim2
  perform resolve_wo_claim(v_c2, false, 'evidencia insuficiente');
  select status::text into v_c2_status from wo_claims where id = v_c2;
  select status::text into v_m2_status from matches where id = v_m2;
  insert into _r values ('8_reject_claim_RECHAZADO', v_c2_status = 'RECHAZADO');
  insert into _r values ('9_reject_match_unchanged', v_m2_status = 'CONFIRMADO');

  -- 5. get_pending refleja la resolución
  select exists(select 1 from get_pending_wo_claims() where claim_id = v_c1) into v_pending_c1_after;
  insert into _r values ('10_get_pending_shows_then_hides', v_pending_c1_before = true and v_pending_c1_after = false);
end $$;
select name, passed from _r order by name;
rollback;
