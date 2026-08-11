/** Radio medio de la Tierra, en metros. */
const EARTH_RADIUS_M = 6_371_000;

export interface Coordinates {
  lat: number;
  lng: number;
}

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

/**
 * Distancia en metros entre dos puntos, por Haversine.
 *
 * Se calcula en el cliente y no en la base: `venues.lat/lng` ya viaja en la
 * misma consulta que arma el selector de complejos, así que sumar una RPC
 * geoespacial sería un round-trip extra para un dato que ya está en memoria.
 *
 * Haversine asume una Tierra esférica y no elipsoidal. El error es del orden
 * del 0,3%: a 10 km, unos 30 m. Para "¿qué tan lejos me queda esta cancha?" es
 * de sobra; para el geofence del check-in decide el servidor, no esto.
 */
export function distanceInMeters(from: Coordinates, to: Coordinates): number {
  const dLat = toRadians(to.lat - from.lat);
  const dLng = toRadians(to.lng - from.lng);

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(from.lat)) * Math.cos(toRadians(to.lat)) * Math.sin(dLng / 2) ** 2;

  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(a)));
}

/**
 * Distancia lista para mostrar.
 *
 * Bajo el kilómetro se redondea de a 100 m: el GPS de un teléfono no distingue
 * mejor que eso y "a 340 m" sugiere una precisión que el dato no tiene.
 */
export function formatDistance(meters: number): string {
  if (meters < 1000) {
    return `a ${Math.max(100, Math.round(meters / 100) * 100)} m`;
  }

  const km = meters / 1000;
  return `a ${km < 10 ? km.toFixed(1) : Math.round(km)} km`;
}
