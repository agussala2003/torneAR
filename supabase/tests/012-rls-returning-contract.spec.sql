-- ============================================================
-- 012-rls-returning-contract — INSERT ... RETURNING exige policy SELECT (pgTAP)
-- ============================================================
-- Por qué existe esta suite:
--   Subir avatares/escudos/evidencias falló durante semanas con
--   `new row violates row-level security policy`, con las policies de INSERT ya
--   creadas y el path correcto. El diagnóstico se fue por caminos equivocados
--   (formato de API key, JWT signing keys) porque la prueba manual que se hizo
--   para descartar la base ERA UN FALSO NEGATIVO:
--
--     INSERT INTO storage.objects (...) VALUES (...);                  -- pasa ✅
--     INSERT INTO storage.objects (...) VALUES (...) RETURNING id;     -- falla ❌
--
--   La regla es de PostgreSQL, no de Supabase: si la sentencia tiene RETURNING,
--   la fila devuelta hay que poder LEERLA, así que se aplican también las
--   policies de SELECT. Sin ninguna, el INSERT se completa y el RETURNING aborta
--   toda la sentencia — con un mensaje que apunta al INSERT y despista.
--
--   storage-api usa RETURNING para devolver el objeto creado. PostgREST hace lo
--   mismo cuando el cliente encadena `.select()` (p. ej. deleteTeam en
--   lib/team-manage-data.ts).
--
-- Qué fija esta suite:
--   La regla en sí, sobre una tabla desechable. No depende del seed ni del
--   schema de la app, así que no se rompe cuando el modelo cambia. Sirve de
--   documentación ejecutable: quien vuelva a ver este error tiene acá, en 30
--   segundos, la explicación que la primera vez costó horas.
--
--   ⚠️ Corolario práctico: cualquier test que valide una policy de INSERT tiene
--   que usar RETURNING. Sin él, prueba menos de lo que parece.
-- ============================================================

begin;
select plan(3);

-- ── Tabla de laboratorio: RLS activo, sólo policy de INSERT ─────────────────
create table public.__rls_returning_probe (
  id    uuid primary key default gen_random_uuid(),
  owner uuid not null
);

alter table public.__rls_returning_probe enable row level security;
grant insert, select on public.__rls_returning_probe to authenticated;

create policy probe_insert on public.__rls_returning_probe
  for insert to authenticated with check (true);

-- El dueño de la tabla saltea RLS, así que hay que probar como `authenticated`.
set local role authenticated;

-- ── 1. Sin RETURNING: el INSERT pasa ────────────────────────────────────────
select lives_ok(
  $$ insert into public.__rls_returning_probe (owner)
     values ('00000000-0000-0000-0000-000000000001') $$,
  'Con policy de INSERT alcanza cuando la sentencia NO devuelve la fila'
);

-- ── 2. Con RETURNING: falla aunque la policy de INSERT esté ─────────────────
-- Ésta es la aserción que vale: es el escenario real de storage-api / PostgREST.
select throws_ok(
  $$ insert into public.__rls_returning_probe (owner)
     values ('00000000-0000-0000-0000-000000000002') returning id $$,
  '42501',
  null,
  'INSERT ... RETURNING sin policy SELECT es rechazado por RLS'
);

-- ── 3. Con policy SELECT: vuelve a funcionar ────────────────────────────────
reset role;
create policy probe_select on public.__rls_returning_probe
  for select to authenticated using (true);
set local role authenticated;

select lives_ok(
  $$ insert into public.__rls_returning_probe (owner)
     values ('00000000-0000-0000-0000-000000000003') returning id $$,
  'Agregando policy SELECT, el INSERT ... RETURNING pasa'
);

reset role;
select * from finish();
rollback;
