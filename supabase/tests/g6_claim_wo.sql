-- ============================================================
-- G6 — RPC claim_wo: validación de goleadores + MVP en el WO
-- ============================================================
-- Prueba la RPC public.claim_wo (migración 20260711_g6_wo_scorers_mvp.sql).
--
-- Todo el script corre en un BEGIN...ROLLBACK: arma un escenario controlado
-- (capitán de team_a como participante con check-in) y ejercita 6 casos con
-- manejo de excepción por caso. NO persiste datos (rollback final).
--
-- Cómo leer: cada fila del resultado tiene passed = true si el caso se comportó
-- como se espera (el happy path devuelve un id; los 5 casos negativos lanzan
-- excepción). Si alguna fila da passed = false, esa validación se rompió.
--
-- IDs de seed usados (si el seed cambia, actualizar):
--   match           : 44444444-4444-4444-4444-000000000001
--   team_a (gana)    : 22222222-2222-2222-2222-222222222221
--   capitán team_a   : 33333333-3333-3333-3333-000000000001  (auth aaaaaaaa-0000-0000-0000-000000000001)
--   rival (team_b)   : 33333333-3333-3333-3333-000000000004
--   outsider (auth)  : 183b0933-deb5-468b-9f8e-dcb96d345155
--
-- Última corrida: 11 jul 2026 — los 6 casos dieron passed = true.
-- ============================================================

begin;
create temp table _r(name text, passed boolean) on commit drop;
do $$
declare v_id uuid;
begin
  -- Setup: capitán A como participante de team_a con check-in
  perform set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-000000000001"}', true);
  update match_participants set did_checkin=true
    where match_id='44444444-4444-4444-4444-000000000001'
      and profile_id='33333333-3333-3333-3333-000000000001'
      and team_id='22222222-2222-2222-2222-222222222221';
  if not found then
    insert into match_participants (id, match_id, profile_id, team_id, is_guest, did_checkin, is_result_loader)
    values (gen_random_uuid(),'44444444-4444-4444-4444-000000000001','33333333-3333-3333-3333-000000000001','22222222-2222-2222-2222-222222222221', false, true, false);
  end if;

  -- 1. Happy path (capitán, 3 goles del propio equipo, MVP propio)
  begin
    v_id := claim_wo('44444444-4444-4444-4444-000000000001','22222222-2222-2222-2222-222222222221',
      'NO_PRESENTACION','evidencia/e.jpg',
      '[{"profile_id":"33333333-3333-3333-3333-000000000001","goals":3}]'::jsonb,
      '33333333-3333-3333-3333-000000000001');
    insert into _r values ('1_happy_path_succeeds', v_id is not null);
  exception when others then insert into _r values ('1_happy_path_succeeds', false); end;

  -- 2. Rechaza suma de goles > 3
  begin
    perform claim_wo('44444444-4444-4444-4444-000000000001','22222222-2222-2222-2222-222222222221',
      'NO_PRESENTACION','p.jpg','[{"profile_id":"33333333-3333-3333-3333-000000000001","goals":4}]'::jsonb, null);
    insert into _r values ('2_rejects_over_3_goals', false);
  exception when others then insert into _r values ('2_rejects_over_3_goals', true); end;

  -- 3. Rechaza goleador rival (no participante de team_a)
  begin
    perform claim_wo('44444444-4444-4444-4444-000000000001','22222222-2222-2222-2222-222222222221',
      'NO_PRESENTACION','p.jpg','[{"profile_id":"33333333-3333-3333-3333-000000000004","goals":1}]'::jsonb, null);
    insert into _r values ('3_rejects_rival_scorer', false);
  exception when others then insert into _r values ('3_rejects_rival_scorer', true); end;

  -- 4. Rechaza emisor no autorizado (outsider: ni capitán ni check-in)
  perform set_config('request.jwt.claims', '{"sub":"183b0933-deb5-468b-9f8e-dcb96d345155"}', true);
  begin
    perform claim_wo('44444444-4444-4444-4444-000000000001','22222222-2222-2222-2222-222222222221',
      'NO_PRESENTACION','p.jpg','[]'::jsonb, null);
    insert into _r values ('4_rejects_unauthorized_sender', false);
  exception when others then insert into _r values ('4_rejects_unauthorized_sender', true); end;

  -- 5. Rechaza MVP ajeno (de vuelta como capitán)
  perform set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-000000000001"}', true);
  begin
    perform claim_wo('44444444-4444-4444-4444-000000000001','22222222-2222-2222-2222-222222222221',
      'NO_PRESENTACION','p.jpg','[{"profile_id":"33333333-3333-3333-3333-000000000001","goals":1}]'::jsonb,
      '33333333-3333-3333-3333-000000000004');
    insert into _r values ('5_rejects_mvp_not_in_team', false);
  exception when others then insert into _r values ('5_rejects_mvp_not_in_team', true); end;

  -- 6. Rechaza > 3 goleadores
  begin
    perform claim_wo('44444444-4444-4444-4444-000000000001','22222222-2222-2222-2222-222222222221',
      'NO_PRESENTACION','p.jpg',
      '[{"profile_id":"33333333-3333-3333-3333-000000000001","goals":1},{"profile_id":"33333333-3333-3333-3333-000000000001","goals":1},{"profile_id":"33333333-3333-3333-3333-000000000001","goals":1},{"profile_id":"33333333-3333-3333-3333-000000000001","goals":1}]'::jsonb, null);
    insert into _r values ('6_rejects_over_3_scorers', false);
  exception when others then insert into _r values ('6_rejects_over_3_scorers', true); end;
end $$;
select name, passed from _r order by name;
rollback;
