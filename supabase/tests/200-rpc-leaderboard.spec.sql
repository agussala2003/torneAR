-- ============================================================
-- 200-rpc-leaderboard — get_player_leaderboard (pgTAP)
-- ============================================================
-- Migración declarativa de tests-legacy/g4_leaderboard.sql (G4), ampliada
-- con la rama `mvps` (que el legacy no cubría). Prueba la RPC vigente de
-- 20260714125138_leaderboard_wo_support.sql.
--
-- Todo el archivo corre en BEGIN...ROLLBACK con escenario propio aislado
-- por la zona única 'ZG4_TEST'. Sólo referencia perfiles del seed del repo
-- (supabase/seed.sql):
--   P1 : 33333333-3333-3333-3333-000000000001
--   Q  : 33333333-3333-3333-3333-000000000004
--
-- Escenario: TA le gana 3 partidos a TB. El MVP del resultado ganador de
-- m1 y m3 es P1; m2 queda sin MVP.
--   m1: TA 2-0 (valla · MVP P1) · participan P1 y Q
--   m2: TA 3-1                  · participa P1
--   m3: TA 1-0 (valla · MVP P1) · participa P1
--
-- Esperado:
--   clean_sheets : P1 = 2 (m1, m3) · Q = 1 (m1, valla colectiva)
--   win_rate     : P1 = 100 (3/3 ≥ umbral de 3 PJ) · Q excluido (1 PJ < 3)
--   mvps         : P1 = 2 (m1, m3) · Q ausente (nunca fue MVP)
--
-- Sin simulación de auth: la RPC es de lectura y el escenario se arma en
-- contexto privilegiado. Los helpers tests.* debutan en las suites de
-- seguridad (100-*).
-- ============================================================

begin;
select plan(6);

-- ── Escenario (sin aserciones: sólo datos) ──────────────────────────────────
do $$
declare
  c_p1 constant uuid := '33333333-3333-3333-3333-000000000001';
  c_q  constant uuid := '33333333-3333-3333-3333-000000000004';
  v_ta uuid; v_tb uuid;
  v_m1 uuid; v_m2 uuid; v_m3 uuid;
begin
  insert into teams (name, category, zone, preferred_format)
  values ('TA_G4', 'HOMBRES', 'ZG4_TEST', 'FUTBOL_5') returning id into v_ta;
  insert into teams (name, category, zone, preferred_format)
  values ('TB_G4', 'HOMBRES', 'ZG4_TEST', 'FUTBOL_5') returning id into v_tb;

  -- m1: TA 2-0 (valla TA, MVP P1); participan P1 y Q en TA.
  insert into matches (team_a_id, team_b_id, status) values (v_ta, v_tb, 'FINALIZADO') returning id into v_m1;
  insert into match_results (match_id, team_id, submitted_by, goals_scored, goals_against, mvp_id) values
    (v_m1, v_ta, c_p1, 2, 0, c_p1), (v_m1, v_tb, c_p1, 0, 2, null);
  insert into match_participants (match_id, profile_id, team_id) values
    (v_m1, c_p1, v_ta), (v_m1, c_q, v_ta);

  -- m2: TA 3-1 (sin valla, sin MVP); participa P1.
  insert into matches (team_a_id, team_b_id, status) values (v_ta, v_tb, 'FINALIZADO') returning id into v_m2;
  insert into match_results (match_id, team_id, submitted_by, goals_scored, goals_against) values
    (v_m2, v_ta, c_p1, 3, 1), (v_m2, v_tb, c_p1, 1, 3);
  insert into match_participants (match_id, profile_id, team_id) values (v_m2, c_p1, v_ta);

  -- m3: TA 1-0 (valla TA, MVP P1); participa P1.
  insert into matches (team_a_id, team_b_id, status) values (v_ta, v_tb, 'FINALIZADO') returning id into v_m3;
  insert into match_results (match_id, team_id, submitted_by, goals_scored, goals_against, mvp_id) values
    (v_m3, v_ta, c_p1, 1, 0, c_p1), (v_m3, v_tb, c_p1, 0, 1, null);
  insert into match_participants (match_id, profile_id, team_id) values (v_m3, c_p1, v_ta);
end;
$$;

-- ── 1-2. clean_sheets: P1 = 2 (m1, m3) · Q = 1 (m1, valla colectiva) ────────
select results_eq(
  $$ select lb.value from public.get_player_leaderboard('clean_sheets', 'ZG4_TEST', null) lb
     where lb.profile_id = '33333333-3333-3333-3333-000000000001' $$,
  array[2::bigint],
  'clean_sheets: P1 acumula 2 vallas invictas'
);

select results_eq(
  $$ select lb.value from public.get_player_leaderboard('clean_sheets', 'ZG4_TEST', null) lb
     where lb.profile_id = '33333333-3333-3333-3333-000000000004' $$,
  array[1::bigint],
  'clean_sheets: Q acumula 1 valla invicta (la valla es colectiva)'
);

-- ── 3-4. win_rate: P1 = 100 (3/3) · Q excluido por umbral (1 PJ < 3) ────────
select results_eq(
  $$ select lb.value from public.get_player_leaderboard('win_rate', 'ZG4_TEST', null) lb
     where lb.profile_id = '33333333-3333-3333-3333-000000000001' $$,
  array[100::bigint],
  'win_rate: P1 tiene 100% (3 ganados de 3 jugados)'
);

select is_empty(
  $$ select 1 from public.get_player_leaderboard('win_rate', 'ZG4_TEST', null) lb
     where lb.profile_id = '33333333-3333-3333-3333-000000000004' $$,
  'win_rate: Q queda excluido del ranking (1 PJ, umbral mínimo de 3)'
);

-- ── 5-6. mvps: P1 = 2 (m1, m3) · Q ausente ──────────────────────────────────
select results_eq(
  $$ select lb.value from public.get_player_leaderboard('mvps', 'ZG4_TEST', null) lb
     where lb.profile_id = '33333333-3333-3333-3333-000000000001' $$,
  array[2::bigint],
  'mvps: P1 acumula 2 MVPs (m1 y m3)'
);

select is_empty(
  $$ select 1 from public.get_player_leaderboard('mvps', 'ZG4_TEST', null) lb
     where lb.profile_id = '33333333-3333-3333-3333-000000000004' $$,
  'mvps: Q no aparece en el ranking (nunca fue MVP)'
);

select * from finish();
rollback;
