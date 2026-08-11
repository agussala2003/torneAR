import { supabase } from '@/lib/supabase';
import { Logger } from '@/lib/logger';
import { distanceInMeters, formatDistance, type Coordinates } from '@/lib/geo';

/**
 * Distancia aproximada entre el usuario y una publicación del Mercado.
 *
 * ## De dónde salen las coordenadas
 *
 * Ni el usuario ni la publicación las tienen directamente:
 *
 *   · `profiles.zone` es el NOMBRE de la zona (texto). `zones` no tiene lat/lng.
 *   · `market_team_posts.complex` es el NOMBRE del complejo (texto). No hay
 *     `venue_id`: la publicación no está enlazada al catálogo.
 *
 * Lo único con coordenadas reales es `venues`. Así que:
 *
 *   · **Punto del usuario**: centroide de los complejos de su zona. Es una
 *     aproximación, y es la mejor disponible sin pedirle el GPS (permiso que
 *     hoy sólo se pide en el check-in) ni agregarle lat/lng a `zones`.
 *   · **Punto de la publicación**: si el `complex` coincide con un complejo del
 *     catálogo EN ESA ZONA, sus coordenadas exactas. Si no —el campo admite
 *     texto libre—, el centroide de la zona de la publicación.
 *
 * El emparejamiento por nombre es fiable en la práctica porque el alta del
 * aviso usa un selector de complejos y guarda el nombre del catálogo tal cual
 * (`app/(modals)/market-create.tsx`). Los avisos viejos con texto a mano caen
 * al centroide, que sigue siendo un número honesto a nivel zona.
 *
 * ⚠️ Por eso el badge dice "~": es distancia entre zonas cuando no hay match de
 * complejo, y nunca la distancia desde dónde está parado el usuario ahora.
 * Enlazar `market_team_posts` con `venues` por FK es lo que haría exacto este
 * cálculo, y es una migración pendiente.
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

/**
 * Metros entre el usuario y la publicación, o `null` si falta algún extremo.
 *
 * `null` cuando el usuario no cargó zona, cuando la publicación no tiene zona,
 * o cuando ninguna de las dos zonas tiene complejos con coordenadas. El
 * llamador no dibuja el badge: es preferible a mostrar un número inventado.
 */
export function resolveDistanceMeters(
  index: MarketDistanceIndex,
  userZone: string | null | undefined,
  postZone: string | null | undefined,
  postComplex: string | null | undefined,
): number | null {
  if (!userZone || !postZone) return null;

  const from = index.zoneCentroids.get(normalize(userZone));
  if (!from) return null;

  const to =
    (postComplex ? index.venueCoords.get(venueKey(postZone, postComplex)) : undefined) ??
    index.zoneCentroids.get(normalize(postZone));
  if (!to) return null;

  return distanceInMeters(from, to);
}

/**
 * Etiqueta lista para el badge, o `null` si no hay distancia que mostrar.
 *
 * El "~" no es decorativo: avisa que el origen es el centro de la zona del
 * usuario y no su posición real (ver el bloque de arriba).
 */
export function resolveDistanceLabel(
  index: MarketDistanceIndex,
  userZone: string | null | undefined,
  postZone: string | null | undefined,
  postComplex: string | null | undefined,
): string | null {
  const meters = resolveDistanceMeters(index, userZone, postZone, postComplex);
  if (meters === null) return null;

  // Misma zona y mismo complejo: "a 100 m" mentiría por redondeo hacia arriba.
  if (meters < 50) return '📍 En tu zona';

  return `📍 ${formatDistance(meters)}`;
}
