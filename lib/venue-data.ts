import { supabase } from '@/lib/supabase';

export interface ZoneEntry {
  id: string;
  name: string;
  /**
   * Complejos activos cargados en la zona. Hoy 14 de 20 zonas activas están en
   * cero: sin este dato el usuario elegía una zona y recién ahí descubría que no
   * tenía dónde jugar. Con el contador, el picker puede ocultarlas o marcarlas
   * antes del tap.
   */
  venueCount: number;
}

export interface VenueEntry {
  id: string;
  name: string;
  address: string | null;
  zoneId: string;
  lat: number | null;
  lng: number | null;
}

/**
 * Zonas activas con su cantidad de complejos activos.
 *
 * El conteo viaja embebido (`venues(count)`) para no hacer N+1: PostgREST
 * resuelve el agregado en la misma request vía la FK `venues.zone_id`. El filtro
 * `venues.is_active` se aplica sobre la relación embebida, así que una zona con
 * complejos dados de baja cuenta 0 — que es lo correcto para decidir si se puede
 * proponer un partido ahí.
 */
export async function fetchActiveZones(): Promise<ZoneEntry[]> {
  const { data, error } = await supabase
    .from('zones')
    .select('id, name, venues(count)')
    .eq('is_active', true)
    .eq('venues.is_active', true)
    .order('name');
  if (error) throw error;

  return (data ?? []).map((z) => {
    const embedded = (z as { venues?: { count: number }[] | null }).venues;
    return {
      id: z.id as string,
      name: z.name as string,
      venueCount: embedded?.[0]?.count ?? 0,
    };
  });
}

/** Sólo las zonas donde efectivamente se puede jugar. */
export async function fetchZonesWithVenues(): Promise<ZoneEntry[]> {
  const zones = await fetchActiveZones();
  return zones.filter((z) => z.venueCount > 0);
}

export async function fetchVenuesByZoneName(zoneName: string): Promise<VenueEntry[]> {
  const { data: zoneRow } = await supabase
    .from('zones')
    .select('id')
    .eq('name', zoneName)
    .eq('is_active', true)
    .maybeSingle();
  if (!zoneRow) return [];
  return fetchVenuesByZone(zoneRow.id as string);
}

export async function fetchVenuesByZone(zoneId: string): Promise<VenueEntry[]> {
  const { data, error } = await supabase
    .from('venues')
    .select('id, name, address, zone_id, lat, lng')
    .eq('zone_id', zoneId)
    .eq('is_active', true)
    .order('name');
  if (error) throw error;
  return (data ?? []).map((v) => ({
    id: v.id as string,
    name: v.name as string,
    address: (v.address ?? null) as string | null,
    zoneId: v.zone_id as string,
    lat: (v.lat ?? null) as number | null,
    lng: (v.lng ?? null) as number | null,
  }));
}
