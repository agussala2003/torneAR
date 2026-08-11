-- ============================================================
-- Censo del fútbol argentino — normalización + RPC de conteo
-- ------------------------------------------------------------
-- Dos partes:
--   1) Normaliza `profiles.favorite_team` contra el catálogo oficial del
--      cliente (`lib/favorite-teams.ts`).
--   2) Crea `get_favorite_team_census()`, que agrupa y cuenta hinchas.
--
-- Idempotente: se puede re-aplicar sin efectos. El UPDATE tiene un guard
-- `IS DISTINCT FROM` y la función es CREATE OR REPLACE.
--
-- ⚠️ ESTADO DE LOS DATOS AL ESCRIBIR ESTA MIGRACIÓN (2026-08-11)
-- Se consultó la base de producción antes de escribirla:
--
--     favorite_team    | n
--     -----------------+----
--     NULL             | 40
--     Boca Juniors     |  5
--     Barracas Central |  3
--     Racing Club      |  2
--     Belgrano         |  1
--
-- Es decir: en producción NO hay data legacy — los 11 perfiles con cuadro
-- cargado ya usan nombres del catálogo, porque se cargaron con el <select>
-- nuevo. El paso 1 NO corrige nada hoy en prod.
--
-- Se incluye igual, por dos razones concretas:
--   · `supabase/seed_testing.sql` SÍ genera valores legacy ('River', 'Boca',
--     'Racing', 'Velez', 'Huracan'), así que todo entorno local levantado con
--     ese seed necesita la normalización para que el censo no muestre a Boca
--     dos veces. (El seed también se corrige en este mismo commit.)
--   · Es la red de contención para perfiles viejos que pudieran aparecer desde
--     un backup o desde un entorno que no se haya inspeccionado.
-- ============================================================


-- ─── 1) Normalización de `profiles.favorite_team` ────────────────────────────
--
-- El match es por `lower(btrim(...))`, así que una sola fila del mapa cubre
-- todas las variantes de mayúsculas y espacios ('boca', 'Boca', ' BOCA ').
-- Las filas sin tilde ('huracan', 'lanus') cubren la otra fuente de drift:
-- el input de texto libre viejo, donde nadie escribía los acentos.
--
-- Deliberadamente NO se mapea 'central' a secas: es ambiguo entre Rosario
-- Central y Central Córdoba, y adivinar mal le cambiaría el cuadro a un
-- usuario real. Un valor no reconocido se deja intacto y simplemente aparece
-- con su propio nombre en el censo, que es la falla visible y corregible.
UPDATE public.profiles AS p
   SET favorite_team = m.canonical
  FROM (VALUES
    ('argentinos',                    'Argentinos Juniors'),
    ('argentinos juniors',            'Argentinos Juniors'),
    ('atletico tucuman',              'Atlético Tucumán'),
    ('banfield',                      'Banfield'),
    ('barracas central',              'Barracas Central'),
    ('belgrano',                      'Belgrano'),
    ('boca',                          'Boca Juniors'),
    ('boca jrs',                      'Boca Juniors'),
    ('boca juniors',                  'Boca Juniors'),
    ('central cordoba',               'Central Córdoba'),
    ('defensa y justicia',            'Defensa y Justicia'),
    ('deportivo riestra',             'Deportivo Riestra'),
    ('riestra',                       'Deportivo Riestra'),
    ('estudiantes',                   'Estudiantes de La Plata'),
    ('estudiantes de la plata',       'Estudiantes de La Plata'),
    ('gimnasia',                      'Gimnasia y Esgrima La Plata'),
    ('gimnasia lp',                   'Gimnasia y Esgrima La Plata'),
    ('gimnasia y esgrima la plata',   'Gimnasia y Esgrima La Plata'),
    ('godoy cruz',                    'Godoy Cruz'),
    ('huracan',                       'Huracán'),
    ('independiente',                 'Independiente'),
    ('independiente rivadavia',       'Independiente Rivadavia'),
    ('instituto',                     'Instituto'),
    ('lanus',                         'Lanús'),
    ('newells',                       'Newell''s Old Boys'),
    ('newell''s',                     'Newell''s Old Boys'),
    ('newell''s old boys',            'Newell''s Old Boys'),
    ('ñuls',                          'Newell''s Old Boys'),
    ('platense',                      'Platense'),
    ('racing',                        'Racing Club'),
    ('racing club',                   'Racing Club'),
    ('river',                         'River Plate'),
    ('river plate',                   'River Plate'),
    ('rosario central',               'Rosario Central'),
    ('san lorenzo',                   'San Lorenzo'),
    ('sarmiento',                     'Sarmiento'),
    ('talleres',                      'Talleres'),
    ('tigre',                         'Tigre'),
    ('union',                         'Unión'),
    ('velez',                         'Vélez Sarsfield'),
    ('velez sarsfield',               'Vélez Sarsfield'),
    ('otro',                          'Otro / No tengo'),
    ('ninguno',                       'Otro / No tengo')
  ) AS m(legacy, canonical)
 WHERE lower(btrim(p.favorite_team)) = m.legacy
   -- Sin este guard, re-aplicar la migración reescribiría filas ya correctas
   -- y les movería `updated_at` sin que nada hubiera cambiado.
   AND p.favorite_team IS DISTINCT FROM m.canonical;

-- ↩️ Reversión: no la hay, y es a propósito. El mapeo es de muchos a uno
-- ('boca', 'Boca', 'boca jrs' → 'Boca Juniors'), así que el valor original no
-- se puede reconstruir. Si hiciera falta auditarlo, el backup diario de
-- Supabase es la fuente.


-- ─── 2) RPC del censo ────────────────────────────────────────────────────────
--
-- SECURITY INVOKER (y no DEFINER): la policy `profiles_select_all` es
-- `using (true)`, así que un usuario autenticado ya puede leer estas filas.
-- Con DEFINER estaríamos abriendo un bypass de RLS que nadie necesita.
--
-- Devuelve el porcentaje además del conteo: sobre una base chica, "5 hinchas"
-- no dice nada y "45,5%" sí. El total del denominador son los perfiles con
-- cuadro válido — NO todos los perfiles — porque de lo contrario los 40 perfiles
-- sin cuadro cargado aplastarían todos los porcentajes.
-- `percentage` va como `double precision` y no como `numeric`: PostgREST
-- serializa numeric como STRING para no perder precisión, y el front tendría
-- que hacer parseFloat sobre cada fila. Un porcentaje con un decimal entra
-- holgado en un float sin problemas de representación.
CREATE OR REPLACE FUNCTION public.get_favorite_team_census()
RETURNS TABLE (team_name text, fans bigint, percentage double precision)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  -- Los alias internos (club / hinchas) NO se llaman como las columnas de
  -- RETURNS TABLE: en funciones SQL los nombres de los parámetros de salida son
  -- visibles dentro del cuerpo y colisionarían con las columnas, fallando con
  -- "column reference is ambiguous".
  WITH valid AS (
    SELECT btrim(p.favorite_team) AS club
      FROM public.profiles p
     WHERE p.favorite_team IS NOT NULL
       AND btrim(p.favorite_team) <> ''
       AND btrim(p.favorite_team) <> 'Otro / No tengo'
  ),
  tally AS (
    SELECT v.club, count(*)::bigint AS hinchas
      FROM valid v
     GROUP BY v.club
  ),
  total AS (
    SELECT COALESCE(sum(t.hinchas), 0)::bigint AS n FROM tally t
  )
  SELECT t.club,
         t.hinchas,
         -- NULLIF evita la división por cero cuando todavía no hay ningún
         -- perfil con cuadro cargado: la función devuelve 0 filas, pero si
         -- alguna vez llegara acá con n = 0 daría NULL y no un error.
         round((t.hinchas::numeric * 100) / NULLIF(tt.n, 0), 1)::double precision
    FROM tally t CROSS JOIN total tt
   ORDER BY t.hinchas DESC, t.club ASC;
$$;

COMMENT ON FUNCTION public.get_favorite_team_census() IS
  'Censo del fútbol argentino: hinchas por cuadro favorito, de mayor a menor. '
  'Excluye NULL y "Otro / No tengo". El porcentaje es sobre perfiles con cuadro válido.';

GRANT EXECUTE ON FUNCTION public.get_favorite_team_census() TO authenticated;

-- ↩️ Reversión
-- DROP FUNCTION IF EXISTS public.get_favorite_team_census();
