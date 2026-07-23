-- ============================================================
-- SEED DEL STACK LOCAL — torneAR
-- ------------------------------------------------------------
-- Estructura en dos capas:
--   · BLOQUE 0 — Contrato intocable de los 160 tests pgTAP (UUIDs históricos
--     33333333/22222222/aaaaaaaa/44444444/00861a5e/ef88b757/8e7bd5df).
--   · BLOQUES 1..4 — Extensión para el frontend React Native, con UUIDs
--     limpios y deterministas (familia 0a/0b/0c/0d/0e/0f) que NO colisionan
--     con el Bloque 0 ni con ningún fixture de las suites de tests.
--
-- Sólo lo aplica `supabase db reset` — nunca se ejecuta en producción.
-- Contraseña de todos los usuarios nuevos: 123456
-- ============================================================


-- ============================================================
-- BLOQUE 0: CONTRATO DE TESTS PGTAP (NO TOCAR)
-- ============================================================
-- Mismos UUIDs que el seed histórico: las suites de supabase/tests/ los
-- hardcodean. Cualquier cambio acá rompe el job db-tests-pgtap.

-- ─── Usuarios de auth ────────────────────────────────────────────────────────
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change, email_change_token_new
)
values
  ('00000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000001',
   'authenticated', 'authenticated', 'cap.leones@test.local', '', now(),
   '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000004',
   'authenticated', 'authenticated', 'cap.tigres@test.local', '', now(),
   '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000007',
   'authenticated', 'authenticated', 'cap.rayos@test.local', '', now(),
   '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '8e7bd5df-5201-4622-8f6b-b94725c18da8',
   'authenticated', 'authenticated', 'player.market@test.local', '', now(),
   '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', '');

-- ─── Perfiles ────────────────────────────────────────────────────────────────
insert into profiles (id, auth_user_id, username, full_name, zone) values
  ('33333333-3333-3333-3333-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001',
   'cap_leones', 'Capitán Leones', 'Palermo'),
  ('33333333-3333-3333-3333-000000000004', 'aaaaaaaa-0000-0000-0000-000000000004',
   'cap_tigres', 'Capitán Tigres', 'Palermo'),
  ('33333333-3333-3333-3333-000000000007', 'aaaaaaaa-0000-0000-0000-000000000007',
   'cap_rayos', 'Capitán Rayos', 'Belgrano'),
  ('ef88b757-4d4e-48b1-b300-51da1cb2e678', '8e7bd5df-5201-4622-8f6b-b94725c18da8',
   'player_market', 'Jugador Mercado', 'Palermo');

-- ─── Equipos y membresías ────────────────────────────────────────────────────
insert into teams (id, name, category, zone, preferred_format) values
  ('22222222-2222-2222-2222-222222222221', 'Los Leones FC',   'HOMBRES', 'Palermo',  'FUTBOL_5'),
  ('22222222-2222-2222-2222-222222222222', 'Tigres Palermo',  'HOMBRES', 'Palermo',  'FUTBOL_5'),
  ('22222222-2222-2222-2222-222222222223', 'Rayos del Norte', 'HOMBRES', 'Belgrano', 'FUTBOL_5');

insert into team_members (team_id, profile_id, role) values
  ('22222222-2222-2222-2222-222222222221', '33333333-3333-3333-3333-000000000001', 'CAPITAN'),
  ('22222222-2222-2222-2222-222222222222', '33333333-3333-3333-3333-000000000004', 'CAPITAN'),
  ('22222222-2222-2222-2222-222222222223', '33333333-3333-3333-3333-000000000007', 'CAPITAN');

-- ─── Temporada activa (espejo del estado de producción) ─────────────────────
insert into seasons (name, slug, starts_at, ends_at, is_active) values
  ('Clausura 2026', 'clausura-2026', '2026-07-01', '2026-12-31', true);

-- ─── Partido terminal de referencia ─────────────────────────────────────────
-- Usado por hotfix_security_rls (H3/H5) y season_lifecycle (T1/T4). El INSERT
-- directo en estado FINALIZADO no dispara stats: el motor sólo actúa en la
-- transición vía UPDATE.
insert into matches (id, team_a_id, team_b_id, match_type, status, scheduled_at, season_id)
values (
  '44444444-4444-4444-4444-000000000003',
  '22222222-2222-2222-2222-222222222222',
  '22222222-2222-2222-2222-222222222223',
  'RANKING', 'FINALIZADO', now() - interval '7 days',
  (select id from seasons where is_active = true)
);

-- ─── Conversación de mercado ─────────────────────────────────────────────────
-- Usada por rls_performance_regression (P5): el player es participante; el
-- lado equipo es Leones (el capitán de Tigres queda como "extraño").
insert into conversations (id, type, player_id, team_id) values (
  '00861a5e-e9f1-4e20-8a9f-9bd1341c5d2a', 'MARKET_DM',
  'ef88b757-4d4e-48b1-b300-51da1cb2e678',
  '22222222-2222-2222-2222-222222222221'
);


-- ============================================================
-- BLOQUE 1: IDENTIDADES Y ROLES (frontend)
-- ============================================================
-- Leyenda de UUIDs deterministas (hardcodeables en las pruebas de UI):
--   auth.users : 0a000000-0000-0000-0000-0000000000NN
--   profiles   : 0b000000-0000-0000-0000-0000000000NN   (NN = mismo nº que su auth)
--   teams      : 0c000000-0000-0000-0000-0000000000TT   (A0/B0/C0 activos · P1/P2 pasados)
--   matches    : 0d000000-0000-0000-0000-0000000000NN
--   convos     : 0e000000-...   ·  mensajes 0f000000-...
--
-- Roster:
--   01 admin_global (is_admin)   02 cap_alfa      03 cap_beta
--   04 alfa_jug1   05 alfa_jug2  06 alfa_jug3     07 beta_jug1
--   08 cap_gamma   09 beta_nuevo (solicitud aceptada)
--   10 free_agent (sin equipo)   11 trotamundos (2 ciclos cerrados + 1 activo)

-- ─── Usuarios de auth (login con contraseña 123456) ─────────────────────────
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change, email_change_token_new
)
values
  ('00000000-0000-0000-0000-000000000000', '0a000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'admin@test.local',       crypt('123456', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '0a000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'cap.alfa@test.local',     crypt('123456', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '0a000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'cap.beta@test.local',     crypt('123456', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '0a000000-0000-0000-0000-000000000004', 'authenticated', 'authenticated', 'alfa.jug1@test.local',    crypt('123456', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '0a000000-0000-0000-0000-000000000005', 'authenticated', 'authenticated', 'alfa.jug2@test.local',    crypt('123456', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '0a000000-0000-0000-0000-000000000006', 'authenticated', 'authenticated', 'alfa.jug3@test.local',    crypt('123456', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '0a000000-0000-0000-0000-000000000007', 'authenticated', 'authenticated', 'beta.jug1@test.local',    crypt('123456', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '0a000000-0000-0000-0000-000000000008', 'authenticated', 'authenticated', 'cap.gamma@test.local',    crypt('123456', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '0a000000-0000-0000-0000-000000000009', 'authenticated', 'authenticated', 'beta.nuevo@test.local',   crypt('123456', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '0a000000-0000-0000-0000-000000000010', 'authenticated', 'authenticated', 'free.agent@test.local',   crypt('123456', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '0a000000-0000-0000-0000-000000000011', 'authenticated', 'authenticated', 'trotamundos@test.local',  crypt('123456', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', '');

-- ─── Perfiles ────────────────────────────────────────────────────────────────
insert into profiles (id, auth_user_id, username, full_name, zone, preferred_position, is_admin, strong_foot, favorite_team) values
  ('0b000000-0000-0000-0000-000000000001', '0a000000-0000-0000-0000-000000000001', 'admin_global', 'Admin Global',      'Palermo',  'CUALQUIERA',    true,  'RIGHT',   'River'),
  ('0b000000-0000-0000-0000-000000000002', '0a000000-0000-0000-0000-000000000002', 'cap_alfa',     'Capitán Alfa',      'Palermo',  'MEDIOCAMPISTA', false, 'RIGHT',   'Boca'),
  ('0b000000-0000-0000-0000-000000000003', '0a000000-0000-0000-0000-000000000003', 'cap_beta',     'Capitán Beta',      'Caballito','DEFENSOR',      false, 'LEFT', 'San Lorenzo'),
  ('0b000000-0000-0000-0000-000000000004', '0a000000-0000-0000-0000-000000000004', 'alfa_jug1',    'Jugador Alfa 1',    'Palermo',  'DELANTERO',     false, 'RIGHT',   'Boca'),
  ('0b000000-0000-0000-0000-000000000005', '0a000000-0000-0000-0000-000000000005', 'alfa_jug2',    'Jugador Alfa 2',    'Palermo',  'ARQUERO',       false, 'RIGHT',   'Racing'),
  ('0b000000-0000-0000-0000-000000000006', '0a000000-0000-0000-0000-000000000006', 'alfa_jug3',    'Jugador Alfa 3',    'Palermo',  'DEFENSOR',      false, 'LEFT', 'River'),
  ('0b000000-0000-0000-0000-000000000007', '0a000000-0000-0000-0000-000000000007', 'beta_jug1',    'Jugador Beta 1',    'Caballito','MEDIOCAMPISTA', false, 'RIGHT',   'Independiente'),
  ('0b000000-0000-0000-0000-000000000008', '0a000000-0000-0000-0000-000000000008', 'cap_gamma',    'Capitán Gamma',     'Belgrano', 'DELANTERO',     false, 'RIGHT',   'Velez'),
  ('0b000000-0000-0000-0000-000000000009', '0a000000-0000-0000-0000-000000000009', 'beta_nuevo',   'Refuerzo Beta',     'Caballito','DELANTERO',     false, 'RIGHT',   'Huracan'),
  ('0b000000-0000-0000-0000-000000000010', '0a000000-0000-0000-0000-000000000010', 'free_agent',   'Agente Libre',      'Palermo',  'MEDIOCAMPISTA', false, 'BOTH','River'),
  ('0b000000-0000-0000-0000-000000000011', '0a000000-0000-0000-0000-000000000011', 'trotamundos',  'El Trotamundos',    'Recoleta', 'DELANTERO',     false, 'RIGHT',   'Boca');


-- ============================================================
-- BLOQUE 2: ENTIDADES CORE (Equipos)
-- ============================================================
-- Los INSERT de team_members disparan el trigger open_team_stint → abren el
-- ciclo vigente en team_stints automáticamente (no hay que insertarlo a mano).

-- ─── Equipos ─────────────────────────────────────────────────────────────────
-- Alfa: consolidado (ELO 1020 > 1000, 1 partido ganado — ver Bloque 3 P3).
-- Beta: buscando jugadores (1 derrota, con market post + solicitudes).
-- Gamma: recién fundado (todo por default).
-- P1/P2: clubes pasados del trotamundos (sólo existen para el FK de sus ciclos).
insert into teams (id, name, category, zone, preferred_format, shield_url,
                   elo_rating, matches_played, in_ranking,
                   season_wins, season_draws, season_losses, season_goals_for, season_goals_against) values
  ('0c000000-0000-0000-0000-0000000000a0', 'Alfa FC',        'HOMBRES', 'Palermo',   'FUTBOL_5', 'https://cdn.test/alfa.png', 1020, 1, true,  1, 0, 0, 4, 2),
  ('0c000000-0000-0000-0000-0000000000b0', 'Beta United',    'HOMBRES', 'Caballito', 'FUTBOL_5', 'https://cdn.test/beta.png',  980, 1, true,  0, 0, 1, 2, 4),
  ('0c000000-0000-0000-0000-0000000000c0', 'Gamma Nuevo',    'MIXTO',   'Belgrano',  'FUTBOL_7', null,                        1000, 0, true,  0, 0, 0, 0, 0),
  ('0c000000-0000-0000-0000-0000000000e1', 'Viejo Club P1',  'HOMBRES', 'Recoleta',  'FUTBOL_5', null,                        1000, 0, false, 0, 0, 0, 0, 0),
  ('0c000000-0000-0000-0000-0000000000e2', 'Ex Equipo P2',   'HOMBRES', 'Nuñez',     'FUTBOL_5', null,                        1000, 0, false, 0, 0, 0, 0, 0);

-- ─── Membresías (abren ciclo vigente vía trigger) ───────────────────────────
insert into team_members (team_id, profile_id, role, joined_at) values
  -- Alfa (5 miembros, incluye al trotamundos como ciclo ACTIVO)
  ('0c000000-0000-0000-0000-0000000000a0', '0b000000-0000-0000-0000-000000000002', 'CAPITAN',   now() - interval '120 days'),
  ('0c000000-0000-0000-0000-0000000000a0', '0b000000-0000-0000-0000-000000000004', 'JUGADOR',   now() - interval '100 days'),
  ('0c000000-0000-0000-0000-0000000000a0', '0b000000-0000-0000-0000-000000000005', 'JUGADOR',   now() - interval '100 days'),
  ('0c000000-0000-0000-0000-0000000000a0', '0b000000-0000-0000-0000-000000000006', 'SUBCAPITAN',now() - interval '90 days'),
  ('0c000000-0000-0000-0000-0000000000a0', '0b000000-0000-0000-0000-000000000011', 'JUGADOR',   now() - interval '15 days'),
  -- Beta (capitán + jugador base + refuerzo con solicitud aceptada)
  ('0c000000-0000-0000-0000-0000000000b0', '0b000000-0000-0000-0000-000000000003', 'CAPITAN',   now() - interval '80 days'),
  ('0c000000-0000-0000-0000-0000000000b0', '0b000000-0000-0000-0000-000000000007', 'JUGADOR',   now() - interval '60 days'),
  ('0c000000-0000-0000-0000-0000000000b0', '0b000000-0000-0000-0000-000000000009', 'JUGADOR',   now() - interval '2 days'),
  -- Gamma (recién fundado: sólo su capitán)
  ('0c000000-0000-0000-0000-0000000000c0', '0b000000-0000-0000-0000-000000000008', 'CAPITAN',   now() - interval '3 days');

-- ─── Trotamundos: 2 ciclos CERRADOS (snapshot congelado para get_player_career) ─
-- El ciclo ACTIVO (en Alfa) ya lo abrió el trigger arriba. Estos dos son
-- históricos: se insertan directo con ended_at + stats congeladas.
insert into team_stints (profile_id, team_id, team_name, shield_url, started_at, ended_at,
                         leave_reason, last_role, stats, stats_computed_at, is_reconstructed) values
  ('0b000000-0000-0000-0000-000000000011', '0c000000-0000-0000-0000-0000000000e1', 'Viejo Club P1', null,
   now() - interval '3 years', now() - interval '18 months', 'TRANSFERENCIA', 'JUGADOR',
   jsonb_build_object(
     'total', jsonb_build_object('pj_ranking', 20, 'pj_amistoso', 5, 'goals', 12, 'mvps', 3, 'clean_sheets', 4, 'wins', 12, 'draws', 3, 'losses', 5),
     'by_season', jsonb_build_array(jsonb_build_object('season_id', null, 'season_name', 'Temporada 2023', 'pj_ranking', 20, 'pj_amistoso', 5, 'goals', 12, 'mvps', 3, 'clean_sheets', 4, 'wins', 12, 'draws', 3, 'losses', 5)),
     'computed_at', (now() - interval '18 months')::text),
   now() - interval '18 months', false),
  ('0b000000-0000-0000-0000-000000000011', '0c000000-0000-0000-0000-0000000000e2', 'Ex Equipo P2', null,
   now() - interval '17 months', now() - interval '4 months', 'ABANDONO', 'SUBCAPITAN',
   jsonb_build_object(
     'total', jsonb_build_object('pj_ranking', 10, 'pj_amistoso', 2, 'goals', 6, 'mvps', 1, 'clean_sheets', 2, 'wins', 5, 'draws', 2, 'losses', 3),
     'by_season', jsonb_build_array(jsonb_build_object('season_id', null, 'season_name', 'Temporada 2024', 'pj_ranking', 10, 'pj_amistoso', 2, 'goals', 6, 'mvps', 1, 'clean_sheets', 2, 'wins', 5, 'draws', 2, 'losses', 3)),
     'computed_at', (now() - interval '4 months')::text),
   now() - interval '4 months', false);

-- ─── Beta: mercado + solicitudes de unión (1 pendiente, 1 aceptada, 1 rechazada) ─
insert into market_team_posts (team_id, created_by, position_wanted, description, zone, complex) values
  ('0c000000-0000-0000-0000-0000000000b0', '0b000000-0000-0000-0000-000000000003', 'ARQUERO',
   'Beta United busca arquero para el Clausura. Entrenamos martes y jueves.', 'Caballito', 'Complejo Central');

insert into market_player_posts (profile_id, post_type, position, description) values
  ('0b000000-0000-0000-0000-000000000010', 'BUSCA_EQUIPO', 'MEDIOCAMPISTA',
   'Mediocampista libre, disponible fines de semana. Zona Palermo/Caballito.');

insert into team_join_requests (id, team_id, profile_id, status) values
  ('0e000000-0000-0000-0000-0000000000f1', '0c000000-0000-0000-0000-0000000000b0', '0b000000-0000-0000-0000-000000000010', 'PENDIENTE'),
  ('0e000000-0000-0000-0000-0000000000f2', '0c000000-0000-0000-0000-0000000000b0', '0b000000-0000-0000-0000-000000000009', 'ACEPTADA'),
  ('0e000000-0000-0000-0000-0000000000f3', '0c000000-0000-0000-0000-0000000000b0', '0b000000-0000-0000-0000-000000000011', 'RECHAZADA');


-- ============================================================
-- BLOQUE 3: MÁQUINA DE ESTADOS (Partidos)
-- ============================================================
-- Estados directos (el INSERT no dispara el motor de ELO; las stats de Alfa/
-- Beta y las filas de elo_history del partido FINALIZADO se cargan a mano).
-- Nota: no existe el estado "WO_RECLAMADO" en match_status; un WO reclamado es
-- un wo_claims PENDIENTE_REVISION sobre un partido CONFIRMADO (Partido 4).
-- Nota: el check-in exige status CONFIRMADO (un PENDIENTE no se puede checkear),
-- por eso el "Partido 1 listo para check-in" está en CONFIRMADO.

-- ─── Partido 0 (PENDIENTE): recién propuesto, aún sin formato ────────────────
insert into matches (id, team_a_id, team_b_id, match_type, status, scheduled_at, season_id)
values ('0d000000-0000-0000-0000-000000000000', '0c000000-0000-0000-0000-0000000000a0', '0c000000-0000-0000-0000-0000000000c0',
        'AMISTOSO', 'PENDIENTE', now() + interval '5 days', (select id from seasons where is_active = true));

-- ─── Partido 1 (CONFIRMADO): convocatorias listas para hacer check-in ────────
insert into matches (id, team_a_id, team_b_id, match_type, status, format, scheduled_at, season_id)
values ('0d000000-0000-0000-0000-000000000001', '0c000000-0000-0000-0000-0000000000a0', '0c000000-0000-0000-0000-0000000000b0',
        'RANKING', 'CONFIRMADO', 'FUTBOL_5', now() + interval '2 days', (select id from seasons where is_active = true));
-- Convocatoria de Alfa: 5 jugadores, sin check-in aún (did_checkin = false).
insert into match_participants (match_id, profile_id, team_id, lineup_role, did_checkin) values
  ('0d000000-0000-0000-0000-000000000001', '0b000000-0000-0000-0000-000000000002', '0c000000-0000-0000-0000-0000000000a0', 'TITULAR',  false),
  ('0d000000-0000-0000-0000-000000000001', '0b000000-0000-0000-0000-000000000004', '0c000000-0000-0000-0000-0000000000a0', 'TITULAR',  false),
  ('0d000000-0000-0000-0000-000000000001', '0b000000-0000-0000-0000-000000000005', '0c000000-0000-0000-0000-0000000000a0', 'TITULAR',  false),
  ('0d000000-0000-0000-0000-000000000001', '0b000000-0000-0000-0000-000000000006', '0c000000-0000-0000-0000-0000000000a0', 'TITULAR',  false),
  ('0d000000-0000-0000-0000-000000000001', '0b000000-0000-0000-0000-000000000011', '0c000000-0000-0000-0000-0000000000a0', 'SUPLENTE', false);

-- ─── Partido 2 (EN_VIVO): ambos equipos presentes, para cargar resultado ─────
insert into matches (id, team_a_id, team_b_id, match_type, status, format, scheduled_at, season_id,
                     checkin_team_a_at, checkin_team_b_at, started_at)
values ('0d000000-0000-0000-0000-000000000002', '0c000000-0000-0000-0000-0000000000a0', '0c000000-0000-0000-0000-0000000000b0',
        'RANKING', 'EN_VIVO', 'FUTBOL_5', now() - interval '20 minutes', (select id from seasons where is_active = true),
        now() - interval '30 minutes', now() - interval '25 minutes', now() - interval '20 minutes');
insert into match_participants (match_id, profile_id, team_id, lineup_role, did_checkin, is_result_loader) values
  ('0d000000-0000-0000-0000-000000000002', '0b000000-0000-0000-0000-000000000002', '0c000000-0000-0000-0000-0000000000a0', 'TITULAR', true, true),
  ('0d000000-0000-0000-0000-000000000002', '0b000000-0000-0000-0000-000000000004', '0c000000-0000-0000-0000-0000000000a0', 'TITULAR', true, false),
  ('0d000000-0000-0000-0000-000000000002', '0b000000-0000-0000-0000-000000000003', '0c000000-0000-0000-0000-0000000000b0', 'TITULAR', true, true),
  ('0d000000-0000-0000-0000-000000000002', '0b000000-0000-0000-0000-000000000007', '0c000000-0000-0000-0000-0000000000b0', 'TITULAR', true, false);

-- ─── Partido 3 (FINALIZADO): stats completas + elo_history ───────────────────
-- Alfa 4-2 Beta. Coherente con teams.elo_rating (Alfa 1020, Beta 980).
insert into matches (id, team_a_id, team_b_id, match_type, status, format, scheduled_at, season_id,
                     checkin_team_a_at, checkin_team_b_at, started_at, finished_at, duration_minutes)
values ('0d000000-0000-0000-0000-000000000003', '0c000000-0000-0000-0000-0000000000a0', '0c000000-0000-0000-0000-0000000000b0',
        'RANKING', 'FINALIZADO', 'FUTBOL_5', now() - interval '10 days', (select id from seasons where is_active = true),
        now() - interval '10 days', now() - interval '10 days', now() - interval '10 days', now() - interval '9 days', 50);
insert into match_participants (match_id, profile_id, team_id, lineup_role, did_checkin) values
  ('0d000000-0000-0000-0000-000000000003', '0b000000-0000-0000-0000-000000000002', '0c000000-0000-0000-0000-0000000000a0', 'TITULAR', true),
  ('0d000000-0000-0000-0000-000000000003', '0b000000-0000-0000-0000-000000000004', '0c000000-0000-0000-0000-0000000000a0', 'TITULAR', true),
  ('0d000000-0000-0000-0000-000000000003', '0b000000-0000-0000-0000-000000000005', '0c000000-0000-0000-0000-0000000000a0', 'TITULAR', true),
  ('0d000000-0000-0000-0000-000000000003', '0b000000-0000-0000-0000-000000000003', '0c000000-0000-0000-0000-0000000000b0', 'TITULAR', true),
  ('0d000000-0000-0000-0000-000000000003', '0b000000-0000-0000-0000-000000000007', '0c000000-0000-0000-0000-0000000000b0', 'TITULAR', true);
insert into match_results (match_id, team_id, submitted_by, goals_scored, goals_against, scorers, mvp_id, status) values
  ('0d000000-0000-0000-0000-000000000003', '0c000000-0000-0000-0000-0000000000a0', '0b000000-0000-0000-0000-000000000002', 4, 2,
   jsonb_build_array(
     jsonb_build_object('profile_id', '0b000000-0000-0000-0000-000000000002', 'goals', 2),
     jsonb_build_object('profile_id', '0b000000-0000-0000-0000-000000000004', 'goals', 2)),
   '0b000000-0000-0000-0000-000000000002', 'CONFIRMADO'),
  ('0d000000-0000-0000-0000-000000000003', '0c000000-0000-0000-0000-0000000000b0', '0b000000-0000-0000-0000-000000000003', 2, 4,
   jsonb_build_array(jsonb_build_object('profile_id', '0b000000-0000-0000-0000-000000000007', 'goals', 2)),
   null, 'CONFIRMADO');
insert into elo_history (team_id, season_id, match_id, elo_before, elo_after, delta) values
  ('0c000000-0000-0000-0000-0000000000a0', (select id from seasons where is_active = true), '0d000000-0000-0000-0000-000000000003', 1000, 1020,  20),
  ('0c000000-0000-0000-0000-0000000000b0', (select id from seasons where is_active = true), '0d000000-0000-0000-0000-000000000003', 1000,  980, -20);

-- ─── Partido 4 (WO reclamado): CONFIRMADO + wo_claims esperando al admin ─────
insert into matches (id, team_a_id, team_b_id, match_type, status, format, scheduled_at, season_id)
values ('0d000000-0000-0000-0000-000000000004', '0c000000-0000-0000-0000-0000000000b0', '0c000000-0000-0000-0000-0000000000c0',
        'RANKING', 'CONFIRMADO', 'FUTBOL_5', now() - interval '1 day', (select id from seasons where is_active = true));
-- Beta se presentó (check-in) y reclama el WO porque Gamma no apareció.
insert into match_participants (match_id, profile_id, team_id, lineup_role, did_checkin) values
  ('0d000000-0000-0000-0000-000000000004', '0b000000-0000-0000-0000-000000000003', '0c000000-0000-0000-0000-0000000000b0', 'TITULAR', true),
  ('0d000000-0000-0000-0000-000000000004', '0b000000-0000-0000-0000-000000000007', '0c000000-0000-0000-0000-0000000000b0', 'TITULAR', true);
insert into wo_claims (id, match_id, claimed_by, claiming_team_id, photo_url, reason, status, scorers, mvp_id) values
  ('0e000000-0000-0000-0000-0000000000a1', '0d000000-0000-0000-0000-000000000004',
   '0b000000-0000-0000-0000-000000000003', '0c000000-0000-0000-0000-0000000000b0',
   'https://cdn.test/evidencia-wo.jpg', 'El rival no se presentó a horario', 'PENDIENTE_REVISION',
   jsonb_build_array(jsonb_build_object('profile_id', '0b000000-0000-0000-0000-000000000007', 'goals', 3)),
   '0b000000-0000-0000-0000-000000000007');


-- ============================================================
-- BLOQUE 4: INTERACCIONES SOCIALES
-- ============================================================

-- ─── Chat de partido (MATCH_CHAT del Partido 2 EN_VIVO) ─────────────────────
insert into conversations (id, type, match_id) values
  ('0e000000-0000-0000-0000-0000000000c1', 'MATCH_CHAT', '0d000000-0000-0000-0000-000000000002');
insert into messages (id, conversation_id, sender_profile_id, sender_team_id, content, is_read, created_at) values
  ('0f000000-0000-0000-0000-000000000001', '0e000000-0000-0000-0000-0000000000c1', '0b000000-0000-0000-0000-000000000002', '0c000000-0000-0000-0000-0000000000a0', 'Listos, entramos a la cancha 3.', true,  now() - interval '35 minutes'),
  ('0f000000-0000-0000-0000-000000000002', '0e000000-0000-0000-0000-0000000000c1', '0b000000-0000-0000-0000-000000000003', '0c000000-0000-0000-0000-0000000000b0', 'Perfecto, ya hicimos el check-in.',   false, now() - interval '33 minutes');

-- ─── DM de mercado (free_agent ↔ Beta United) ───────────────────────────────
insert into conversations (id, type, player_id, team_id) values
  ('0e000000-0000-0000-0000-0000000000c2', 'MARKET_DM', '0b000000-0000-0000-0000-000000000010', '0c000000-0000-0000-0000-0000000000b0');
insert into messages (id, conversation_id, sender_profile_id, sender_team_id, content, is_read, created_at) values
  ('0f000000-0000-0000-0000-000000000003', '0e000000-0000-0000-0000-0000000000c2', '0b000000-0000-0000-0000-000000000010', null,                                    'Hola, vi que buscan arquero. Yo juego de medio pero conozco uno.', true,  now() - interval '2 hours'),
  ('0f000000-0000-0000-0000-000000000004', '0e000000-0000-0000-0000-0000000000c2', '0b000000-0000-0000-0000-000000000003', '0c000000-0000-0000-0000-0000000000b0', 'Buenísimo, pasame el contacto y coordinamos una prueba.',           false, now() - interval '1 hour');

-- ─── Notificaciones (bandeja del admin y de los capitanes) ──────────────────
insert into notifications (profile_id, type, title, body, data, is_read) values
  ('0b000000-0000-0000-0000-000000000001', 'WO_RECLAMADO',          'Nuevo reclamo de WO',       'Beta United reclamó un WO contra Gamma Nuevo.', jsonb_build_object('match_id', '0d000000-0000-0000-0000-000000000004', 'claim_id', '0e000000-0000-0000-0000-0000000000a1'), false),
  ('0b000000-0000-0000-0000-000000000003', 'SOLICITUD_UNION_EQUIPO','Nueva solicitud de unión',  'Agente Libre quiere unirse a Beta United.',      jsonb_build_object('request_id', '0e000000-0000-0000-0000-0000000000f1'), false),
  ('0b000000-0000-0000-0000-000000000002', 'PARTIDO_FINALIZADO',    'Partido finalizado',        'Alfa FC 4 - 2 Beta United.',                     jsonb_build_object('match_id', '0d000000-0000-0000-0000-000000000003'), true);
