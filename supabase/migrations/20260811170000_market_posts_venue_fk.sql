-- ============================================================
-- MERCADO: ENLACE REAL AL CATÁLOGO DE COMPLEJOS — 2026-08-11
-- ------------------------------------------------------------
-- `market_team_posts.complex` guarda el NOMBRE del complejo como texto libre.
-- Alcanza para mostrarlo, pero no para ubicarlo: el badge de distancia del
-- Mercado tenía que adivinar las coordenadas emparejando ese texto contra
-- `venues.name`, y cuando no había match caía al centroide de la zona.
--
-- Con la FK el cálculo deja de adivinar: la publicación apunta al complejo y
-- sus `lat`/`lng` viajan en la misma consulta que arma la lista.
--
-- ─── `complex` NO se elimina ─────────────────────────────────────────────────
-- Expand, no contract. Se mantiene por tres motivos:
--   · Los avisos viejos con texto a mano que no matchean ningún complejo del
--     catálogo seguirían mostrando algo. Dropear la columna los deja sin sede.
--   · El alta permite escribir una cancha que no está en el catálogo.
--   · La UI lo lee hoy (`MarketTeamCard`), y `venue_id` es nullable: hasta que
--     todos los avisos vivos tengan complejo del catálogo, el nombre es el
--     único dato garantizado.
-- El CONTRACT queda para cuando el alta exija complejo del catálogo.
--
-- Idempotente: se puede re-aplicar sin efectos.
-- ============================================================


-- ═══════════════════════════════════════════════════════════════
-- 1. La columna
-- ═══════════════════════════════════════════════════════════════
-- `ON DELETE SET NULL` y no CASCADE: dar de baja un complejo del catálogo no
-- puede borrar publicaciones de equipos que no tienen nada que ver. El aviso
-- sobrevive con su `complex` de texto y pierde sólo la precisión del badge.
ALTER TABLE public.market_team_posts
  ADD COLUMN IF NOT EXISTS venue_id uuid
  REFERENCES public.venues(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.market_team_posts.venue_id IS
  'Complejo del catálogo donde se juega. Nullable: los avisos con cancha escrita a mano (o anteriores a esta migración y sin match) sólo tienen `complex`. Es la fuente de las coordenadas del badge de distancia del Mercado.';

-- FK sin índice = seq scan en cada baja de complejo (mismo criterio que
-- 20260331235000_fk_indexes.sql). Parcial: la mayoría de las filas viejas
-- quedan en NULL y no aportan nada al índice.
CREATE INDEX IF NOT EXISTS market_team_posts_venue_id_idx
  ON public.market_team_posts (venue_id)
  WHERE venue_id IS NOT NULL;


-- ═══════════════════════════════════════════════════════════════
-- 2. Grants: la columna nueva NO los hereda
-- ═══════════════════════════════════════════════════════════════
-- ⚠️ `market_team_posts` tiene privilegios a nivel COLUMNA (los dejó
-- 20260719130000_restore_hotfix_column_lockdown.sql). Cuando una tabla tiene
-- grants por columna, una columna agregada después NO queda incluida: sin este
-- bloque `venue_id` sería invisible en el SELECT de PostgREST y el INSERT del
-- alta fallaría con "permission denied for column". Es un fallo silencioso en
-- desarrollo local (donde se suele correr como owner) y ruidoso en producción.
GRANT SELECT (venue_id), INSERT (venue_id), UPDATE (venue_id)
  ON public.market_team_posts TO anon, authenticated, service_role;


-- ═══════════════════════════════════════════════════════════════
-- 3. Backfill de los avisos existentes
-- ═══════════════════════════════════════════════════════════════
-- El alta usa un selector de complejos y guarda `venues.name` tal cual
-- (`app/(modals)/market-create.tsx`), así que la coincidencia exacta por
-- nombre recupera la enorme mayoría de los avisos vivos.
--
-- El match se acota a la MISMA zona a propósito: hay nombres de cancha que se
-- repiten entre barrios ("El Potrero", "La Bombonerita"), y sin la zona un
-- aviso podría quedar enlazado a un complejo homónimo del otro lado del AMBA —
-- que es exactamente el error que esta migración viene a eliminar.
--
-- Sin `unaccent` en esta base: se normaliza con lower(btrim(...)), que alcanza
-- porque los dos lados salen de la misma fila del catálogo.
UPDATE public.market_team_posts p
SET venue_id = v.id
FROM public.venues v
JOIN public.zones z ON z.id = v.zone_id
WHERE p.venue_id IS NULL
  AND p.complex IS NOT NULL
  AND p.zone IS NOT NULL
  AND v.is_active
  AND lower(btrim(p.complex)) = lower(btrim(v.name))
  AND lower(btrim(p.zone))    = lower(btrim(z.name));
