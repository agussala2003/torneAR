-- ============================================================
-- SEED DEL STACK LOCAL — 2026-07-14
-- ------------------------------------------------------------
-- Datos mínimos para desarrollo local y para las suites de supabase/tests/.
-- Replica las identidades documentadas en los headers de las suites (mismos
-- UUIDs que el seed histórico del proyecto real), de modo que los tests
-- corran idénticos en local (supabase db reset) y contra el proyecto (CI).
--
-- Sólo lo aplica `supabase db reset` — nunca se ejecuta en producción.
-- ============================================================

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
