-- ============================================================
-- 130-rls-team-delete — DELETE sobre teams: quién puede y quién no (pgTAP)
-- ============================================================
-- Por qué existe esta suite:
--   El capitán único miembro elegía "Abandonar equipo" → la app ofrecía
--   eliminarlo, mostraba "Equipo eliminado correctamente", navegaba al perfil…
--   y el equipo seguía existiendo.
--
--   `public.teams` tenía RLS habilitado con policies de INSERT/SELECT/UPDATE y
--   NINGUNA de DELETE. Un DELETE sin policy que lo habilite NO es un error en
--   Postgres: no matchea ninguna fila, PostgREST responde 204 sin `error`, y el
--   cliente lo lee como éxito.
--
--   Es exactamente la clase de fallo que 100-rls-security.spec.sql ya describe
--   para UPDATE ("RLS filtra la fila en silencio → is_empty sobre
--   UPDATE ... RETURNING"). La técnica estaba; faltaba aplicarla a teams.
--
--   Por eso las aserciones negativas usan `is_empty` sobre DELETE ... RETURNING
--   y NO `throws_ok`: el punto del test es justamente que Postgres NO lanza.
--
--   Contrapartida en el cliente: lib/team-manage-data.ts → deleteTeam() hace
--   `.select('id')` y trata 0 filas como fallo explícito.
--
-- Identidades del seed (ver 100-rls-security.spec.sql):
--   capitán Leones : perfil 33333333-...-0001 · auth aaaaaaaa-...-0001
--   capitán Rayos  : perfil 33333333-...-0007 · auth aaaaaaaa-...-0007
--   sin equipo     : auth 8e7bd5df-5201-4622-8f6b-b94725c18da8
--
-- Equipos del escenario (prefijo 99999999-, no colisionan con el seed):
--   ...00d1 Solo FC      → un único miembro, capitán ...0007
--   ...00d2 Plantel FC   → capitán ...0007 + jugador ...0001
-- ============================================================

begin;
select plan(5);

-- ── Escenario ───────────────────────────────────────────────────────────────
insert into teams (id, name, zone, category, preferred_format) values
  ('99999999-0000-0000-0000-0000000000d1', 'Solo FC',    'GBA Norte', 'MIXTO', 'FUTBOL_5'),
  ('99999999-0000-0000-0000-0000000000d2', 'Plantel FC', 'GBA Norte', 'MIXTO', 'FUTBOL_5');

insert into team_members (team_id, profile_id, role) values
  ('99999999-0000-0000-0000-0000000000d1', '33333333-3333-3333-3333-000000000007', 'CAPITAN'),
  ('99999999-0000-0000-0000-0000000000d2', '33333333-3333-3333-3333-000000000007', 'CAPITAN'),
  ('99999999-0000-0000-0000-0000000000d2', '33333333-3333-3333-3333-000000000001', 'JUGADOR');

-- ── 1. La policy existe ─────────────────────────────────────────────────────
-- Regresión directa: durante meses no existió y nadie se enteró.
select isnt_empty(
  $$
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'teams' and cmd = 'DELETE'
  $$,
  'teams tiene policy de DELETE (sin ella el borrado falla en silencio, no con error)'
);

-- ── 2. Capitán y único miembro: SÍ puede borrar ─────────────────────────────
-- Único caso que la app ofrece (app/team-manage.tsx → startLeaveFlow).
select tests.authenticate_as_profile('aaaaaaaa-0000-0000-0000-000000000007');

select isnt_empty(
  $$ delete from teams where id = '99999999-0000-0000-0000-0000000000d1' returning id $$,
  'El capitan que es ultimo miembro puede eliminar su equipo'
);

-- ── 3. Capitán con plantel: NO puede ────────────────────────────────────────
-- El guard de "último miembro" evita que por API se borre un equipo con gente
-- y se arrastre en cascada a sus miembros.
select is_empty(
  $$ delete from teams where id = '99999999-0000-0000-0000-0000000000d2' returning id $$,
  'El capitan NO puede eliminar un equipo que todavia tiene otros miembros'
);

-- ── 4. Miembro no capitán: NO puede ─────────────────────────────────────────
select tests.clear_auth();
select tests.authenticate_as_profile('aaaaaaaa-0000-0000-0000-000000000001');

select is_empty(
  $$ delete from teams where id = '99999999-0000-0000-0000-0000000000d2' returning id $$,
  'Un JUGADOR del plantel no puede eliminar el equipo'
);

-- ── 5. Ajeno al equipo: NO puede ────────────────────────────────────────────
select tests.clear_auth();
select tests.authenticate_as_profile('8e7bd5df-5201-4622-8f6b-b94725c18da8');

select is_empty(
  $$ delete from teams where id = '99999999-0000-0000-0000-0000000000d2' returning id $$,
  'Un usuario sin relacion con el equipo no puede eliminarlo'
);

select tests.clear_auth();
select * from finish();
rollback;
