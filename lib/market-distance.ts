import { supabase } from '@/lib/supabase';
import { Logger } from '@/lib/logger';
import { distanceInMeters, formatDistance, type Coordinates } from '@/lib/geo';

/**
 * Distancia entre el usuario y un complejo, para todas las superficies que la
 * muestran: tarjetas del Mercado, selector de complejo al crear una oferta y
 * selector de la propuesta de partido.
 *
 * ## Por qué está centralizado
 *
 * Las tres pantallas mostraban números distintos para el MISMO predio (el
 * "100 m acá y 600 m allá" del QA). No era el destino: era el ORIGEN. La
 * propuesta de partido medía desde el GPS real del dispositivo y el Mercado
 * desde el centroide de la zona del perfil, así que los dos números eran
 * correctos y respondían a preguntas distintas. Con el cálculo repartido en
 * cada pantalla, esa diferencia era invisible desde el código.
 *
 * Acá se resuelven los DOS extremos con una única prioridad.
 *
 * ## Destino (`PostLocation`), de mejor a peor
 *
 *   1. `coords` — el aviso está enlazado al catálogo por `venue_id`.
 *      Coordenadas reales de la cancha. Si están, mandan.
 *   2. Match del nombre del complejo contra el catálogo, dentro de su zona.
 *      Cubre los avisos anteriores a la FK que el backfill no alcanzó.
 *   3. Centroide de la zona del aviso.
 *
 * El emparejamiento por nombre es fiable en la práctica porque el alta del
 * aviso usa un selector de complejos y guarda el nombre del catálogo tal cual
 * (`app/(modals)/market-create.tsx`). Los avisos viejos con texto a mano caen
 * al centroide, que sigue siendo un número honesto a nivel zona.
 *
 * ## Origen (`DistanceOrigin`), de mejor a peor
 *
 *   1. `coords` — última posición conocida del dispositivo. Sólo se usa si el
 *      permiso de ubicación YA estaba concedido: ver una distancia no justifica
 *      pedir un permiso nuevo.
 *   2. Centroide de los complejos de la zona del perfil. Es la mejor
 *      aproximación sin GPS — `zones` no tiene lat/lng.
 *
 * Por eso `hasPreciseOrigin` acompaña al resultado: con GPS la cifra es la
 * distancia real desde donde está el usuario; sin GPS es distancia entre zonas,
 * y la UI la marca con "~" para no prometer una precisión que no tiene.
 */

/** Índice en memoria: se arma una vez por carga del Mercado. */
export interface MarketDistanceIndex {
  /** Centroide por nombre de zona. */
  zoneCentroids: Map<string, Coordinates>;
  /** Coordenadas exactas por `zona::complejo` normalizado. */
  venueCoords: Map<string, Coordinates>;
}

export const EMPTY_DISTANCE_INDEX: MarketDistanceIndex = {
  zoneCentroids: new Map(),
  venueCoords: new Map(),
};

/** Case y acentos aparte: "Cancha San Martín" y "cancha san martin" son la misma. */
function normalize(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    // Marcas diacríticas combinantes: es lo que NFD separa de cada vocal.
    .replace(/[̀-ͯ]/g, '');
}

function venueKey(zone: string, complex: string): string {
  return `${normalize(zone)}::${normalize(complex)}`;
}

interface VenueRow {
  name: string;
  lat: number | null;
  lng: number | null;
  zones: { name: string } | null;
}

/**
 * Arma el índice a partir del catálogo de complejos.
 *
 * Una sola consulta para toda la pantalla: son pocas decenas de filas y evita
 * un N+1 por tarjeta.
 */
export function buildDistanceIndex(rows: VenueRow[]): MarketDistanceIndex {
  const venueCoords = new Map<string, Coordinates>();
  const accumulator = new Map<string, { lat: number; lng: number; count: number }>();

  for (const row of rows) {
    const zoneName = row.zones?.name;
    // Un complejo sin zona o sin coordenadas no ubica nada: se descarta en vez
    // de entrar al promedio como un (0,0) que arrastraría el centroide al
    // golfo de Guinea.
    if (!zoneName || row.lat === null || row.lng === null) continue;

    venueCoords.set(venueKey(zoneName, row.name), { lat: row.lat, lng: row.lng });

    const key = normalize(zoneName);
    const acc = accumulator.get(key) ?? { lat: 0, lng: 0, count: 0 };
    accumulator.set(key, { lat: acc.lat + row.lat, lng: acc.lng + row.lng, count: acc.count + 1 });
  }

  const zoneCentroids = new Map<string, Coordinates>();
  for (const [key, acc] of accumulator) {
    zoneCentroids.set(key, { lat: acc.lat / acc.count, lng: acc.lng / acc.count });
  }

  return { zoneCentroids, venueCoords };
}

export async function fetchMarketDistanceIndex(): Promise<MarketDistanceIndex> {
  const { data, error } = await supabase
    .from('venues')
    .select('name, lat, lng, zones(name)')
    .eq('is_active', true);

  if (error) {
    // Accesorio: sin índice el Mercado se muestra igual, sólo que sin badges de
    // distancia. Queda registrado porque desde afuera "no hay badges" es
    // indistinguible de "ninguna publicación tiene complejo cargado".
    Logger.warn('No se pudo armar el índice de distancias del Mercado', {
      scope: 'market-distance.fetchMarketDistanceIndex',
      error,
    });
    return EMPTY_DISTANCE_INDEX;
  }

  return buildDistanceIndex((data ?? []) as unknown as VenueRow[]);
}

/** Ubicación de una publicación, en orden de precisión decreciente. */
export interface PostLocation {
  /**
   * Coordenadas del complejo enlazado por `venue_id`. Es el dato EXACTO y tiene
   * prioridad sobre todo lo demás.
   */
  coords?: Coordinates | null;
  zone?: string | null;
  /** Nombre del complejo, para los avisos previos a la FK. */
  complex?: string | null;
}

/** Desde dónde se mide, en orden de precisión decreciente. */
export interface DistanceOrigin {
  /**
   * Última posición conocida del dispositivo. Sólo llega con valor cuando el
   * permiso de ubicación ya estaba concedido: ver `hooks/useDistanceResolver`.
   */
  coords?: Coordinates | null;
  /** `profiles.zone`. Fallback: centroide de los complejos de esa zona. */
  zone?: string | null;
}

/**
 * Punto de origen resuelto, o `null` si no hay ninguno utilizable.
 *
 * Se expone aparte de la distancia porque el llamador necesita saber si la
 * cifra salió del GPS o de un centroide para decidir cómo rotularla.
 */
function resolveOrigin(
  index: MarketDistanceIndex,
  origin: DistanceOrigin,
): { coords: Coordinates; precise: boolean } | null {
  if (origin.coords) return { coords: origin.coords, precise: true };

  if (origin.zone) {
    const centroid = index.zoneCentroids.get(normalize(origin.zone));
    if (centroid) return { coords: centroid, precise: false };
  }

  return null;
}

/** Destino resuelto siguiendo `coords` > match por nombre > centroide de zona. */
function resolveDestination(
  index: MarketDistanceIndex,
  post: PostLocation,
): Coordinates | null {
  return (
    post.coords ??
    (post.zone && post.complex ? index.venueCoords.get(venueKey(post.zone, post.complex)) : undefined) ??
    (post.zone ? index.zoneCentroids.get(normalize(post.zone)) : undefined) ??
    null
  );
}

/**
 * Metros entre el usuario y la publicación, o `null` si falta algún extremo.
 *
 * `null` cuando no hay origen utilizable (sin GPS y sin zona cargada, o con una
 * zona sin complejos con coordenadas) o cuando el aviso no ubica en ningún
 * lado: el llamador no dibuja el badge, que es preferible a mostrar un número
 * inventado.
 */
export function resolveDistanceMeters(
  index: MarketDistanceIndex,
  origin: DistanceOrigin,
  post: PostLocation,
): number | null {
  const from = resolveOrigin(index, origin);
  if (!from) return null;

  const to = resolveDestination(index, post);
  if (!to) return null;

  return distanceInMeters(from.coords, to);
}

/**
 * Etiqueta lista para el badge, o `null` si no hay distancia que mostrar.
 *
 * El "~" no es decorativo: aparece sólo cuando se midió desde el centro de la
 * zona del usuario y no desde su posición real. Con GPS la cifra va sin tilde
 * porque sí es la distancia desde donde está parado.
 */
export function resolveDistanceLabel(
  index: MarketDistanceIndex,
  origin: DistanceOrigin,
  post: PostLocation,
): string | null {
  const from = resolveOrigin(index, origin);
  if (!from) return null;

  const to = resolveDestination(index, post);
  if (!to) return null;

  const meters = distanceInMeters(from.coords, to);

  // Mismo punto: "a 100 m" mentiría por el redondeo hacia arriba de
  // `formatDistance`.
  if (meters < 50) return from.precise ? '📍 Estás acá' : '📍 En tu zona';

  return `📍 ${from.precise ? '' : '~ '}${formatDistance(meters)}`;
}
