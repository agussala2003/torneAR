import { supabase } from '@/lib/supabase';

export interface ZoneEntry {
  id: string;
  name: string;
}

export interface VenueEntry {
  id: string;
  name: string;
  address: string | null;
  zoneId: string;
  lat: number | null;
  lng: number | null;
}

export async function fetchActiveZones(): Promise<ZoneEntry[]> {
  const { data, error } = await supabase
    .from('zones')
    .select('id, name')
    .eq('is_active', true)
    .order('name');
  if (error) throw error;
  return (data ?? []).map((z) => ({ id: z.id as string, name: z.name as string }));
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
