import { supabase } from '@/lib/supabase';

/**
 * Nombres de las zonas activas, ordenados alfabéticamente.
 * Fuente única para el ranking y el selector de zonas.
 */
export async function fetchActiveZoneNames(): Promise<string[]> {
  const { data, error } = await supabase
    .from('zones')
    .select('name')
    .eq('is_active', true)
    .order('name');
  if (error) throw error;
  return (data ?? []).map((z) => z.name);
}
