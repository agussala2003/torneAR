import { supabase } from '@/lib/supabase';

// ─── Administración de temporadas (panel admin) ──────────────────────────────
// La transición es una RPC SECURITY DEFINER gateada por is_admin server-side
// (migración 20260714_season_lifecycle.sql). Acá sólo viven la llamada tipada
// y la lectura de contexto para la pantalla.

export interface ActiveSeasonInfo {
  id: string;
  name: string;
  startsAt: string; // YYYY-MM-DD
  endsAt: string;   // YYYY-MM-DD
  /** true si ends_at ya pasó: la transición está pendiente. */
  isExpired: boolean;
}

/** Temporada activa actual (o null si no hay ninguna — estado anómalo). */
export async function fetchActiveSeasonInfo(): Promise<ActiveSeasonInfo | null> {
  const { data, error } = await supabase
    .from('seasons')
    .select('id, name, starts_at, ends_at')
    .eq('is_active', true)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;

  return {
    id: data.id,
    name: data.name,
    startsAt: data.starts_at,
    endsAt: data.ends_at,
    isExpired: new Date(data.ends_at + 'T23:59:59') < new Date(),
  };
}

/**
 * Cierra la temporada activa y abre la nueva (RPC transition_season).
 * Efectos server-side: contadores season_* de todos los equipos a 0
 * (elo_rating y matches_played quedan intactos) y re-etiquetado de los
 * partidos abiertos a la temporada nueva. Devuelve el id de la nueva.
 */
export async function transitionSeason(
  newName: string,
  startsAt: string, // YYYY-MM-DD
  endsAt: string,   // YYYY-MM-DD
): Promise<string> {
  const { data, error } = await supabase.rpc('transition_season', {
    p_new_name: newName,
    p_starts_at: startsAt,
    p_ends_at: endsAt,
  });
  if (error) throw error;
  return data as string;
}
