-- ============================================================
-- 110-rls-c1-c2 — Regresión C1/C2, bloque CRÍTICO del audit 2026-07-10 (pgTAP)
-- ============================================================
-- Migración declarativa de tests-legacy/c1_c2_security_regression.sql:
--   C1 — resolve_match: REVOKE de EXECUTE + guarda anti-reentrada
--        (20260711011205_c1_resolve_match_reentrancy_guard.sql; la guarda
--        vive hoy en el motor unificado de 20260714024611).
--   C2 — get_market_inbox: cierre del IDOR sobre inboxes de mercado
--        (20260711011226_c2_market_inbox_idor_guard.sql).
--
-- Identidades del seed (supabase/seed.sql):
--   capitán Tigres : perfil 33333333-...-0004 · auth aaaaaaaa-...-0004
--   player mercado : perfil ef88b757-4d4e-48b1-b300-51da1cb2e678
--                    auth 8e7bd5df-5201-4622-8f6b-b94725c18da8
--   equipo Rayos   : 22222222-2222-2222-2222-222222222223
--
-- Escenario C1b con IDs fijos (prefijo 99999999-...-001x):
--   equipos A/B 9999...0011 / 9999...0012 · partido terminal 9999...0013
--
-- La conversación de mercado de C2 usa get-or-create (ON CONFLICT DO
-- NOTHING): en la base local de desarrollo puede ya existir una para el par
-- (player, Rayos); en el stack efímero de CI nunca existe.
-- ============================================================

begin;
select plan(5);

-- ── C1a. resolve_match — REVOKE: authenticated no puede ejecutarla ──────────
-- La función es interna del motor ELO; sólo triggers/postgres la invocan.
select tests.authenticate_as_profile('aaaaaaaa-0000-0000-0000-000000000004');

select throws_ok(
  $$ select public.resolve_match(gen_random_uuid()) $$,
  '42501',
  null,
  'C1a: resolve_match sigue revocada para authenticated (insufficient_privilege)'
);

-- ── C1b. resolve_match — anti-reentrada: un partido terminal no reprocesa ───
select tests.clear_auth();

insert into teams (id, name, category, zone, preferred_format) values
  ('99999999-0000-0000-0000-000000000011', '__TEST C1 A', 'MIXTO', '__ZC1', 'FUTBOL_5'),
  ('99999999-0000-0000-0000-000000000012', '__TEST C1 B', 'MIXTO', '__ZC1', 'FUTBOL_5');

insert into matches (id, team_a_id, team_b_id, match_type, status, scheduled_at)
values ('99999999-0000-0000-0000-000000000013',
        '99999999-0000-0000-0000-000000000011',
        '99999999-0000-0000-0000-000000000012',
        'RANKING', 'FINALIZADO', now());

-- Snapshot de stats ANTES de invocar (pgTAP no comparte variables entre
-- sentencias: la foto vive en una temp table que muere con el rollback).
create temp table c1b_snapshot as
  select matches_played from teams
  where id = '99999999-0000-0000-0000-000000000011';

-- Invocación directa (como postgres, que conserva EXECUTE): sobre un partido
-- ya FINALIZADO la guarda debe hacer no-op silencioso.
select public.resolve_match('99999999-0000-0000-0000-000000000013');

select results_eq(
  $$ select matches_played from teams
     where id = '99999999-0000-0000-0000-000000000011' $$,
  'select matches_played from c1b_snapshot',
  'C1b: un partido terminal no re-acumula matches_played'
);

select results_eq(
  $$ select status::text from matches
     where id = '99999999-0000-0000-0000-000000000013' $$,
  array['FINALIZADO'],
  'C1b: el status del partido terminal queda intacto'
);

-- ── C2. get_market_inbox — IDOR cerrado ─────────────────────────────────────
-- Setup (privilegiado): conversación de mercado player↔Rayos con un mensaje.
insert into conversations (type, player_id, team_id)
values ('MARKET_DM', 'ef88b757-4d4e-48b1-b300-51da1cb2e678',
        '22222222-2222-2222-2222-222222222223')
on conflict do nothing;

insert into messages (conversation_id, sender_profile_id, content)
select c.id, 'ef88b757-4d4e-48b1-b300-51da1cb2e678', '__test c2'
from conversations c
where c.type = 'MARKET_DM'
  and c.player_id = 'ef88b757-4d4e-48b1-b300-51da1cb2e678'
  and c.team_id   = '22222222-2222-2222-2222-222222222223';

-- Autenticado como el player, pide el inbox de OTRO perfil → 0 filas.
select tests.authenticate_as_profile('8e7bd5df-5201-4622-8f6b-b94725c18da8');

select is_empty(
  $$ select * from public.get_market_inbox('33333333-3333-3333-3333-000000000004'::uuid) $$,
  'C2a: el inbox ajeno devuelve 0 filas (IDOR cerrado)'
);

-- Camino feliz: su propio inbox SÍ tiene contenido.
select isnt_empty(
  $$ select * from public.get_market_inbox('ef88b757-4d4e-48b1-b300-51da1cb2e678'::uuid) $$,
  'C2b: el usuario ve su propio inbox de mercado'
);

select * from finish();
rollback;
