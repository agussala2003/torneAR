-- ============================================================
-- FORCE UPDATE — VERSIÓN MÍNIMA EXIGIDA POR PLATAFORMA — 2026-08-04
-- ------------------------------------------------------------
-- Hoy no hay forma de sacar de circulación una versión rota. Si sale a
-- producción un build que corrompe datos (un cliente que le pega a una RPC con
-- el contrato viejo, por ejemplo), la única salida es publicar el arreglo y
-- esperar a que cada usuario actualice cuando se le ocurra — con la versión
-- mala escribiendo en la base mientras tanto. Esta tabla es el interruptor.
--
-- ── Por qué una tabla nueva y no `app_settings` ────────────────────────────
-- `app_settings` (20260728140000) es `value numeric`: sirve para un radio de
-- geofence o un TTL en horas, no para "1.4.2". Meter una versión ahí obligaría
-- a codificarla como número (1.4.2 → 10402) y a que cada cliente conozca esa
-- codificación. Además hacen falta tres campos por plataforma, no uno.
--
-- ── Lectura pública (anon incluido) — decisión deliberada ──────────────────
-- Es la única tabla del esquema que se lee sin sesión. El chequeo de versión
-- corre al arrancar la app, ANTES del login: si exigiera `authenticated`, un
-- usuario con la versión bloqueada y la sesión vencida entraría al login, no
-- podría actualizar y quedaría en un limbo — justo el caso que este sistema
-- tiene que cubrir. El dato no es sensible: la versión vigente de la app está
-- publicada en las tiendas.
--
-- La ESCRITURA no tiene policy: se hace desde el dashboard o con service_role.
-- Es una palanca de operaciones, no una función del producto.
--
-- ── El CHECK de formato no es cosmético ────────────────────────────────────
-- `min_required_version` es la única fila del esquema capaz de dejar a TODOS
-- los usuarios afuera de la app de una sola vez. Un dedazo tipo '1..0' o 'v2'
-- haría que el comparador del cliente no pueda ordenar las versiones, y ahí el
-- comportamiento depende de cómo cada versión del cliente maneje el parseo. El
-- CHECK corta eso en la base, que es el único lugar donde se puede garantizar.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.app_versions (
  platform             text PRIMARY KEY
                         CHECK (platform IN ('android', 'ios')),
  -- Versión mínima que la app exige para dejar entrar. Por debajo de esto el
  -- cliente muestra el modal bloqueante.
  min_required_version text NOT NULL
                         CHECK (min_required_version ~ '^[0-9]+(\.[0-9]+){0,2}$'),
  -- Última versión publicada. Informativa: alimenta el "hay una versión nueva"
  -- del modal; no bloquea por sí sola.
  latest_version       text NOT NULL
                         CHECK (latest_version ~ '^[0-9]+(\.[0-9]+){0,2}$'),
  -- A dónde manda el botón "Actualizar" (ficha de la tienda).
  update_url           text NOT NULL
                         CHECK (update_url ~ '^https://'),
  updated_at           timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.app_versions IS
  'Force update: versión mínima exigida por plataforma. La lee el root layout al arrancar la app (lib/app-version.ts). Lectura pública —el chequeo corre antes del login—; la escritura es operativa (dashboard / service_role).';

COMMENT ON COLUMN public.app_versions.min_required_version IS
  'Por debajo de esta versión la app se bloquea con un modal no descartable. Subirla saca de circulación a todos los builds anteriores: es la palanca de emergencia.';

COMMENT ON COLUMN public.app_versions.latest_version IS
  'Última versión publicada en la tienda. Informativa: no bloquea.';


-- ─── Datos por defecto ──────────────────────────────────────────────────────
-- Arrancan en 1.0.0 = la versión actual (app.json), o sea: no bloquean a nadie.
-- La tabla nace inerte a propósito; sube el mínimo quien decide sacar una
-- versión de circulación.
INSERT INTO public.app_versions (platform, min_required_version, latest_version, update_url)
VALUES
  ('android', '1.0.0', '1.0.0',
   'https://play.google.com/store/apps/details?id=com.agussala2003.tornear'),
  ('ios', '1.0.0', '1.0.0',
   'https://apps.apple.com/app/tornear/id0000000000')
ON CONFLICT (platform) DO NOTHING;


-- ─── `updated_at` al día ────────────────────────────────────────────────────
-- Sin esto la columna miente después del primer UPDATE, y es el único rastro de
-- cuándo se accionó la palanca.
CREATE OR REPLACE FUNCTION public.touch_app_versions_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_app_versions_updated_at ON public.app_versions;
CREATE TRIGGER trg_app_versions_updated_at
  BEFORE UPDATE ON public.app_versions
  FOR EACH ROW EXECUTE FUNCTION public.touch_app_versions_updated_at();


-- ─── RLS ────────────────────────────────────────────────────────────────────
ALTER TABLE public.app_versions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS app_versions_select_public ON public.app_versions;
CREATE POLICY app_versions_select_public ON public.app_versions
  FOR SELECT TO anon, authenticated USING (true);

-- Sin policies de INSERT/UPDATE/DELETE: con RLS activo eso ya cierra la
-- escritura para anon y authenticated. Los REVOKE dejan la intención explícita
-- para que un GRANT amplio futuro (como el de 20260719120500 sobre profiles) no
-- la reabra por accidente.
REVOKE INSERT, UPDATE, DELETE ON public.app_versions FROM anon, authenticated;
GRANT  SELECT ON public.app_versions TO anon, authenticated;
