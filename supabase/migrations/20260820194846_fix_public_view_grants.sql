-- ============================================================
-- HOTFIX DE SEGURIDAD — grants por defecto sobre las vistas públicas
-- 2026-08-20
-- ------------------------------------------------------------
-- ⚠️ CRÍTICO. Verificado explotable contra producción (dentro de una
-- transacción revertida) el 2026-08-20:
--
--     SET ROLE anon;
--     UPDATE public.profiles_public SET full_name = 'PWNED'
--      WHERE username = 'preba';
--     -- UPDATE 1
--
-- Es decir: cualquiera con la anon key —que viaja dentro del bundle de la
-- app publicada y se extrae en un minuto— podía reescribir el nombre, el
-- username o la zona de CUALQUIER perfil, sin sesión. El DELETE sólo lo
-- frenó un FK y el INSERT sólo un NOT NULL: accidentes, no defensas.
--
-- ── Por qué pasó ────────────────────────────────────────────────────────
-- Tres decisiones correctas por separado que se combinan mal:
--
--   1. Supabase trae `ALTER DEFAULT PRIVILEGES ... GRANT ALL ON TABLES TO
--      anon, authenticated` en el schema `public`. Toda relación nueva
--      —tablas Y VISTAS— nace con INSERT/SELECT/UPDATE/DELETE para los dos
--      roles de PostgREST.
--   2. `profiles_public` (20260819100000) se creó a propósito SIN
--      `security_invoker`, para poder derivar `age` pese al REVOKE de
--      columna sobre la tabla base. Una vista así corre con los privilegios
--      de su OWNER.
--   3. La vista es simple (un solo FROM, sin agregados), así que Postgres
--      la considera AUTO-ACTUALIZABLE.
--
-- (1)+(2)+(3) = un canal de escritura que corre como owner y no evalúa ni
-- el REVOKE de columna ni las policies de RLS de `profiles`. El
-- `GRANT SELECT ... TO authenticated` que escribió aquella migración no
-- alcanzaba: un GRANT no quita lo que el default privilege ya había dado.
-- Es el mismo patrón que esa misma migración documentó para la tabla base
-- ("un REVOKE de columna nunca puede angostar lo que el ACL de tabla ya
-- concede") — la lección no se había aplicado a la vista.
--
-- ── El arreglo ──────────────────────────────────────────────────────────
-- REVOKE ALL y volver a otorgar SÓLO el SELECT que cada consumidor real
-- necesita. `anon` se queda sin nada: ningún camino anónimo lee estas
-- vistas —se verificó uno por uno— ni en la app (todas las pantallas que
-- las tocan exigen sesión: profile-stats, team-stats, team-manage, ranking)
-- ni en el dashboard (`app/(public)/i/[username]` no hace una sola llamada
-- a Supabase; es sólo un deep link).
--
-- NO se le pone `security_invoker` a `profiles_public`: eso rompería el
-- cálculo de `age`, que es justamente lo que la vista existe para poder
-- hacer. La superficie se cierra con el ACL, que es donde estaba abierta.
--
-- ── Verificación ────────────────────────────────────────────────────────
-- Con este parche aplicado dentro de una transacción, contra producción:
--   · anon UPDATE / DELETE / SELECT sobre profiles_public → permission denied
--   · authenticated UPDATE sobre profiles_public          → permission denied
--   · anon SELECT sobre v_team_ranking                    → permission denied
--   · jugador logueado leyendo profiles_public, v_team_ranking,
--     v_player_stats y get_team_ranking()                 → siguen pasando
--
-- Idempotente.
-- ============================================================

-- `profiles_public` es la única de las tres con el problema de ESCRITURA
-- (las otras dos no son auto-actualizables: v_team_ranking hace JOIN de dos
-- tablas y v_player_stats agrega). Se tratan igual de todos modos: las tres
-- nacieron con el mismo grant de más y ninguna tiene un consumidor anónimo.
REVOKE ALL ON public.profiles_public FROM anon, authenticated;
REVOKE ALL ON public.v_team_ranking  FROM anon, authenticated;
REVOKE ALL ON public.v_player_stats  FROM anon, authenticated;

GRANT SELECT ON public.profiles_public TO authenticated;
GRANT SELECT ON public.v_team_ranking  TO authenticated;
GRANT SELECT ON public.v_player_stats  TO authenticated;

COMMENT ON VIEW public.profiles_public IS
  'Subconjunto público de profiles para leer datos de OTROS perfiles: age derivada, nunca date_of_birth ni expo_push_token. Sin security_invoker a propósito — corre con privilegio de owner para poder calcular age pese al REVOKE de columna sobre la tabla base. ⚠️ Por eso mismo SÓLO puede tener GRANT SELECT: cualquier grant de escritura sobre esta vista es un bypass directo de la RLS de profiles (ver 20260820194846).';


-- ── Lo que este archivo NO hace, a propósito ────────────────────────────
-- La causa raíz (el default privilege de Supabase) se desarma con:
--
--   ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
--     REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLES FROM anon, authenticated;
--
-- Queda FUERA de este hotfix porque cambia el comportamiento de toda
-- relación futura del schema, y esto entra durante un code freeze: un
-- hotfix tiene que ser chico y revisable de un vistazo. Va como primer
-- ítem de la V2, con las migraciones existentes re-corridas en local para
-- confirmar que ninguna dependía del grant implícito.
