-- ============================================================
-- 010-schema — Canario estructural de las tablas core (pgTAP)
-- ============================================================
-- Red de seguridad de los CIMIENTOS: congela existencia, RLS y la matriz de
-- privilegios de `authenticated` sobre las 6 tablas core. A diferencia de
-- las suites de comportamiento (100/110/120/200), acá no se ejercita lógica:
-- se afirma el estado del schema. Si alguien borra una tabla, deshabilita
-- RLS o cambia un GRANT/REVOKE, esta suite se pone roja ANTES de que un bug
-- de comportamiento lo pise por casualidad.
--
-- Nace del incidente del 19-jul: un `GRANT UPDATE` a nivel tabla reabrió la
-- escalada de privilegios de profiles.is_admin (hallazgo ROJO #2). Los
-- privilegios de columna de profiles/teams NO son RLS — son grants de
-- columna, y sólo un canario como éste los vigila declarativamente.
--
-- ── Sobre los privilegios afirmados (medidos post `supabase db reset`,
--    es decir, contra migraciones puras = lo que construye CI) ──
--   challenges / matches / team_members : los 7 (incluye REFERENCES,
--     TRIGGER, TRUNCATE que Supabase otorga por default a authenticated en
--     toda tabla de public) + INSERT/UPDATE/DELETE de nuestros grants.
--   profiles / teams : los mismos MENOS UPDATE — el lockdown por columna de
--     20260714022651 (restaurado en 20260719130000) revoca UPDATE a nivel
--     tabla y lo re-otorga sólo sobre columnas editables. Que UPDATE NO
--     aparezca en estos arrays ES la aserción de seguridad central.
--   team_stints : sólo lectura + defaults; SIN INSERT/UPDATE/DELETE. El
--     ledger de trayectoria lo escriben exclusivamente los triggers
--     SECURITY DEFINER open/close_team_stint, así que el rol de la app no
--     puede manipular la historia de fichajes. Propiedad deseable, congelada.
--
-- ⚠️ table_privs_are es EXACT-MATCH. Esta suite se midió con Supabase CLI
-- v2.83.0; si CI corre una versión cuyo baseline de default privileges
-- difiere (p.ej. sin TRIGGER/TRUNCATE para authenticated), los arrays acá
-- deberán ajustarse a lo que reporte CI. El job db-tests-pgtap es el árbitro.
-- ============================================================

begin;
select plan(18);

-- ── 1. Existencia de las 6 tablas core ──────────────────────────────────────
select has_table('public', 'profiles',     'tabla core profiles existe');
select has_table('public', 'teams',        'tabla core teams existe');
select has_table('public', 'team_members', 'tabla core team_members existe');
select has_table('public', 'matches',      'tabla core matches existe');
select has_table('public', 'challenges',   'tabla core challenges existe');
select has_table('public', 'team_stints',  'ledger team_stints existe');

-- ── 2. RLS habilitado (relrowsecurity del catálogo) ─────────────────────────
-- Se consulta por OID (public.X::regclass) en vez de relname para no
-- confundir una tabla homónima de otro schema.
select is((select relrowsecurity from pg_class where oid = 'public.profiles'::regclass),
          true, 'RLS habilitado en profiles');
select is((select relrowsecurity from pg_class where oid = 'public.teams'::regclass),
          true, 'RLS habilitado en teams');
select is((select relrowsecurity from pg_class where oid = 'public.team_members'::regclass),
          true, 'RLS habilitado en team_members');
select is((select relrowsecurity from pg_class where oid = 'public.matches'::regclass),
          true, 'RLS habilitado en matches');
select is((select relrowsecurity from pg_class where oid = 'public.challenges'::regclass),
          true, 'RLS habilitado en challenges');
select is((select relrowsecurity from pg_class where oid = 'public.team_stints'::regclass),
          true, 'RLS habilitado en team_stints');

-- ── 3. Matriz de privilegios de `authenticated` (exact-match) ───────────────
-- Tablas con DML completo (los 7 privilegios reales).
select table_privs_are('public', 'challenges', 'authenticated',
  array['DELETE','INSERT','REFERENCES','SELECT','TRIGGER','TRUNCATE','UPDATE'],
  'challenges: authenticated conserva DML completo');
select table_privs_are('public', 'matches', 'authenticated',
  array['DELETE','INSERT','REFERENCES','SELECT','TRIGGER','TRUNCATE','UPDATE'],
  'matches: authenticated conserva DML completo');
select table_privs_are('public', 'team_members', 'authenticated',
  array['DELETE','INSERT','REFERENCES','SELECT','TRIGGER','TRUNCATE','UPDATE'],
  'team_members: authenticated conserva DML completo');

-- profiles / teams: SIN UPDATE a nivel tabla (lockdown de columna). Esta es
-- la aserción que se pone roja si vuelve a colarse un GRANT UPDATE tabla.
select table_privs_are('public', 'profiles', 'authenticated',
  array['DELETE','INSERT','REFERENCES','SELECT','TRIGGER','TRUNCATE'],
  'profiles: authenticated NO tiene UPDATE a nivel tabla (anti-escalada is_admin)');
select table_privs_are('public', 'teams', 'authenticated',
  array['DELETE','INSERT','REFERENCES','SELECT','TRIGGER','TRUNCATE'],
  'teams: authenticated NO tiene UPDATE a nivel tabla (anti-manipulación de elo_rating)');

-- team_stints: sólo lectura + defaults; SIN INSERT/UPDATE/DELETE (lo escriben
-- los triggers SECURITY DEFINER). La app no puede tocar la trayectoria.
select table_privs_are('public', 'team_stints', 'authenticated',
  array['REFERENCES','SELECT','TRIGGER','TRUNCATE'],
  'team_stints: authenticated es sólo-lectura (el ledger lo escriben triggers)');

select * from finish();
rollback;
