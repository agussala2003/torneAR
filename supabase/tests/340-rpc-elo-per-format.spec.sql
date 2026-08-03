-- ============================================================
-- 340-rpc-elo-per-format — ELO independiente por formato (pgTAP)
-- ============================================================
-- Cubre 20260803120000_per_format_elo_rankings.sql: el ELO dejó de ser un
-- número por equipo y pasó a ser uno por (equipo, formato) en `team_rankings`.
--
-- La suite 210-rpc-elo sigue custodiando el motor GLOBAL (que no cambió: la
-- migración es fase EXPAND y mantiene la doble escritura). Acá se prueba
-- exclusivamente lo nuevo:
--
--   F0 — Crear un equipo siembra su fila del formato preferido (trigger
--        team_ranking_seed_on_insert). Sin esto, un equipo nuevo desaparecía
--        de get_team_ranking hasta jugar su primer partido.
--   F1 — RANKING en F5 mueve SOLO la fila de F5 (±20 con ratings parejos) y no
--        inventa fila de F7.
--   F2 — Los MISMOS equipos en F7 arrancan de 1000 en ese formato: el ELO de
--        F5 no se contagia. La fila de F5 queda intacta.
--   F3 — Doble escritura: el ELO global acumuló los DOS partidos (1000+20+20),
--        mientras cada formato registra sólo el suyo.
--   F4 — AMISTOSO computa partido/empate en el formato pero NO mueve elo_score
--        (misma regla que el motor global).
--   F5 — get_team_ranking(p_format) devuelve el ELO de ESE formato.
--
-- Mismo enfoque que 210: la lógica la disparan triggers SECURITY DEFINER al
-- insertar match_results / cambiar el status, así que no hace falta simular
-- auth. Todo corre en la transacción del archivo (rollback automático).
-- Único perfil del seed referenciado (submitted_by):
--   33333333-3333-3333-3333-000000000004
-- ============================================================

begin;
select plan(10);

-- ════════════════════════════════════════════════════════════════════════════
-- F0 — El alta del equipo siembra la fila de su formato preferido
-- ════════════════════════════════════════════════════════════════════════════
insert into teams (id, name, category, zone, preferred_format) values
  ('f1000000-0000-0000-0000-0000000000a1', '__TEST FMT A', 'MIXTO', 'Palermo', 'FUTBOL_5'),
  ('f1000000-0000-0000-0000-0000000000b1', '__TEST FMT B', 'MIXTO', 'Palermo', 'FUTBOL_5');

select results_eq(
  $$ select format::text, elo_score, matches_played
       from team_rankings
      where team_id = 'f1000000-0000-0000-0000-0000000000a1' $$,
  $$ values ('FUTBOL_5'::text, 1000, 0) $$,
  'F0: crear el equipo siembra una única fila, en su formato preferido y con ELO base'
);

-- ════════════════════════════════════════════════════════════════════════════
-- F1 — RANKING en FUTBOL_5: mueve sólo la fila de F5
-- ════════════════════════════════════════════════════════════════════════════
insert into matches (id, team_a_id, team_b_id, match_type, status, format, scheduled_at, season_id)
values ('f1000000-0000-0000-0000-0000000000c1',
        'f1000000-0000-0000-0000-0000000000a1',
        'f1000000-0000-0000-0000-0000000000b1',
        'RANKING', 'EN_VIVO', 'FUTBOL_5', now(),
        (select id from seasons where is_active = true limit 1));

insert into match_results (match_id, team_id, submitted_by, goals_scored, goals_against)
values ('f1000000-0000-0000-0000-0000000000c1', 'f1000000-0000-0000-0000-0000000000a1',
        '33333333-3333-3333-3333-000000000004', 2, 1);
insert into match_results (match_id, team_id, submitted_by, goals_scored, goals_against)
values ('f1000000-0000-0000-0000-0000000000c1', 'f1000000-0000-0000-0000-0000000000b1',
        '33333333-3333-3333-3333-000000000004', 1, 2);

select results_eq(
  $$ select elo_score, matches_played, wins, draws, losses
       from team_rankings
      where team_id = 'f1000000-0000-0000-0000-0000000000a1' and format = 'FUTBOL_5' $$,
  $$ values (1020, 1, 1, 0, 0) $$,
  'F1: el ganador sube a 1020 en FUTBOL_5 y computa 1 PJ / 1 victoria'
);

select results_eq(
  $$ select elo_score, matches_played, wins, draws, losses
       from team_rankings
      where team_id = 'f1000000-0000-0000-0000-0000000000b1' and format = 'FUTBOL_5' $$,
  $$ values (980, 1, 0, 0, 1) $$,
  'F1: el perdedor baja a 980 en FUTBOL_5 y computa 1 PJ / 1 derrota'
);

select is(
  (select count(*)::int from team_rankings
    where team_id = 'f1000000-0000-0000-0000-0000000000a1' and format = 'FUTBOL_7'),
  0,
  'F1: jugar F5 no crea fila de F7 (el ranking de F7 no se llena de fantasmas)'
);

-- ════════════════════════════════════════════════════════════════════════════
-- F2 + F3 — Los mismos equipos, ahora en FUTBOL_7
-- ════════════════════════════════════════════════════════════════════════════
insert into matches (id, team_a_id, team_b_id, match_type, status, format, scheduled_at, season_id)
values ('f2000000-0000-0000-0000-0000000000c1',
        'f1000000-0000-0000-0000-0000000000a1',
        'f1000000-0000-0000-0000-0000000000b1',
        'RANKING', 'EN_VIVO', 'FUTBOL_7', now() + interval '3 days',
        (select id from seasons where is_active = true limit 1));

insert into match_results (match_id, team_id, submitted_by, goals_scored, goals_against)
values ('f2000000-0000-0000-0000-0000000000c1', 'f1000000-0000-0000-0000-0000000000a1',
        '33333333-3333-3333-3333-000000000004', 3, 0);
insert into match_results (match_id, team_id, submitted_by, goals_scored, goals_against)
values ('f2000000-0000-0000-0000-0000000000c1', 'f1000000-0000-0000-0000-0000000000b1',
        '33333333-3333-3333-3333-000000000004', 0, 3);

-- El punto del refactor: F7 arranca en 1000 aunque en F5 el equipo ya valga
-- 1020. Con ratings parejos vuelve a ser ±20 exactos.
select results_eq(
  $$ select elo_score, matches_played, wins
       from team_rankings
      where team_id = 'f1000000-0000-0000-0000-0000000000a1' and format = 'FUTBOL_7' $$,
  $$ values (1020, 1, 1) $$,
  'F2: FUTBOL_7 arranca de 1000 (no hereda el 1020 de F5) y sube a 1020'
);

select results_eq(
  $$ select elo_score, matches_played
       from team_rankings
      where team_id = 'f1000000-0000-0000-0000-0000000000a1' and format = 'FUTBOL_5' $$,
  $$ values (1020, 1) $$,
  'F2: el partido de F7 no toca la fila de F5'
);

-- Y acá se ve por qué los dos ledgers no son intercambiables: el segundo
-- partido, medido en la escala GLOBAL, ya no es entre iguales (1020 vs 980),
-- así que el delta global es +18 y no +20. En F7 sí fue ±20 porque en ESE
-- formato los dos equipos seguían en 1000.
--   E_A = 1 / (1 + 10^((980−1020)/400)) = 0,5573 → Δ = ROUND(40 × 0,4427) = 18
select is(
  (select elo_rating from teams where id = 'f1000000-0000-0000-0000-0000000000a1'),
  1038,
  'F3: doble escritura — el ELO global acumula los dos partidos (1000+20+18)'
);

-- ════════════════════════════════════════════════════════════════════════════
-- F4 — AMISTOSO: stats del formato sí, ELO del formato no
-- ════════════════════════════════════════════════════════════════════════════
insert into matches (id, team_a_id, team_b_id, match_type, status, format, scheduled_at)
values ('f4000000-0000-0000-0000-0000000000c1',
        'f1000000-0000-0000-0000-0000000000a1',
        'f1000000-0000-0000-0000-0000000000b1',
        'AMISTOSO', 'EN_VIVO', 'FUTBOL_5', now() + interval '6 days');

insert into match_results (match_id, team_id, submitted_by, goals_scored, goals_against)
values ('f4000000-0000-0000-0000-0000000000c1', 'f1000000-0000-0000-0000-0000000000a1',
        '33333333-3333-3333-3333-000000000004', 1, 1);
insert into match_results (match_id, team_id, submitted_by, goals_scored, goals_against)
values ('f4000000-0000-0000-0000-0000000000c1', 'f1000000-0000-0000-0000-0000000000b1',
        '33333333-3333-3333-3333-000000000004', 1, 1);

select results_eq(
  $$ select elo_score, matches_played, draws
       from team_rankings
      where team_id = 'f1000000-0000-0000-0000-0000000000a1' and format = 'FUTBOL_5' $$,
  $$ values (1020, 2, 1) $$,
  'F4: el amistoso suma PJ y empate en el formato pero NO mueve el elo_score'
);

-- ════════════════════════════════════════════════════════════════════════════
-- F5 — get_team_ranking lee el formato pedido
-- ════════════════════════════════════════════════════════════════════════════
select is(
  (select elo_rating from public.get_team_ranking(null, null, 'FUTBOL_5')
    where team_id = 'f1000000-0000-0000-0000-0000000000a1'),
  1020,
  'F5: get_team_ranking(FUTBOL_5) devuelve el ELO de F5'
);

select is(
  (select matches_played from public.get_team_ranking(null, null, 'FUTBOL_7')
    where team_id = 'f1000000-0000-0000-0000-0000000000a1'),
  1,
  'F5: get_team_ranking(FUTBOL_7) devuelve las stats de F7 (1 PJ), no las globales'
);

select * from finish();
rollback;
