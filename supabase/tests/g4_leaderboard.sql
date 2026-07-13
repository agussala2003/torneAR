-- ============================================================
-- G4 — get_player_leaderboard: clean_sheets + win_rate
-- ============================================================
-- Prueba las 2 ramas nuevas de la RPC (migración
-- 20260711_g4_leaderboard_clean_sheets_win_rate.sql):
--   clean_sheets : valla invicta COLECTIVA (todos los participantes del equipo
--                  que recibió 0 goles en un partido FINALIZADO).
--   win_rate     : % de victorias del jugador (0–100), umbral mínimo 3 partidos.
--
-- Todo corre en un BEGIN...ROLLBACK. Arma un escenario sintético AISLADO por
-- una zona única ('ZG4_TEST') — equipos/partidos/resultados nuevos, reutilizando
-- 2 perfiles reales como participantes — para poder asertar valores exactos sin
-- interferencia de datos de seed. NO persiste nada (rollback final).
--
-- Escenario: TA gana 3 partidos a TB.
--   m1: TA 2-0 (valla)  · participan P1 y Q
--   m2: TA 3-1          · participa P1
--   m3: TA 1-0 (valla)  · participa P1
-- Esperado: clean_sheets P1=2, Q=1 ; win_rate P1=100, Q excluido (1 partido<3).
--
-- Última corrida: 11 jul 2026 — los 4 casos dieron passed = true.
-- ============================================================

begin;
create temp table _r(name text, passed boolean) on commit drop;
do $$
declare
  v_p1 uuid; v_q uuid;
  v_ta uuid; v_tb uuid;
  v_m1 uuid; v_m2 uuid; v_m3 uuid;
  v_cs_p1 bigint; v_cs_q bigint;
  v_wr_p1 bigint; v_wr_q_count int;
begin
  select id into v_p1 from profiles order by created_at limit 1;
  select id into v_q  from profiles order by created_at offset 1 limit 1;

  insert into teams (name, category, zone, preferred_format) values ('TA_G4','HOMBRES','ZG4_TEST','FUTBOL_5') returning id into v_ta;
  insert into teams (name, category, zone, preferred_format) values ('TB_G4','HOMBRES','ZG4_TEST','FUTBOL_5') returning id into v_tb;

  -- m1: TA gana 2-0 (valla invicta TA); participan P1 y Q en TA
  insert into matches (team_a_id, team_b_id, status) values (v_ta, v_tb, 'FINALIZADO') returning id into v_m1;
  insert into match_results (match_id, team_id, submitted_by, goals_scored, goals_against) values
    (v_m1, v_ta, v_p1, 2, 0), (v_m1, v_tb, v_p1, 0, 2);
  insert into match_participants (match_id, profile_id, team_id) values
    (v_m1, v_p1, v_ta), (v_m1, v_q, v_ta);

  -- m2: TA gana 3-1 (sin valla); participa P1
  insert into matches (team_a_id, team_b_id, status) values (v_ta, v_tb, 'FINALIZADO') returning id into v_m2;
  insert into match_results (match_id, team_id, submitted_by, goals_scored, goals_against) values
    (v_m2, v_ta, v_p1, 3, 1), (v_m2, v_tb, v_p1, 1, 3);
  insert into match_participants (match_id, profile_id, team_id) values (v_m2, v_p1, v_ta);

  -- m3: TA gana 1-0 (valla invicta TA); participa P1
  insert into matches (team_a_id, team_b_id, status) values (v_ta, v_tb, 'FINALIZADO') returning id into v_m3;
  insert into match_results (match_id, team_id, submitted_by, goals_scored, goals_against) values
    (v_m3, v_ta, v_p1, 1, 0), (v_m3, v_tb, v_p1, 0, 1);
  insert into match_participants (match_id, profile_id, team_id) values (v_m3, v_p1, v_ta);

  -- Clean sheets: P1 = 2 (m1,m3), Q = 1 (m1)
  select value into v_cs_p1 from get_player_leaderboard('clean_sheets','ZG4_TEST',null) where profile_id = v_p1;
  select value into v_cs_q  from get_player_leaderboard('clean_sheets','ZG4_TEST',null) where profile_id = v_q;
  insert into _r values ('1_clean_sheets_P1_equals_2', coalesce(v_cs_p1,0) = 2);
  insert into _r values ('2_clean_sheets_Q_collective_equals_1', coalesce(v_cs_q,0) = 1);

  -- Win rate: P1 = 100 (3/3, >= umbral 3); Q excluido (1 partido < 3)
  select value into v_wr_p1 from get_player_leaderboard('win_rate','ZG4_TEST',null) where profile_id = v_p1;
  select count(*) into v_wr_q_count from get_player_leaderboard('win_rate','ZG4_TEST',null) where profile_id = v_q;
  insert into _r values ('3_win_rate_P1_equals_100', coalesce(v_wr_p1,-1) = 100);
  insert into _r values ('4_win_rate_Q_excluded_below_threshold', v_wr_q_count = 0);
end $$;
select name, passed from _r order by name;
rollback;
