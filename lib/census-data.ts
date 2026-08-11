import { supabase } from '@/lib/supabase';
import { getClubLogoUrl } from '@/lib/favorite-teams';

export interface CensusEntry {
  /** Posición en el censo. Los empates comparten posición (1, 2, 2, 4). */
  position: number;
  teamName: string;
  fans: number;
  percentage: number;
  logoUrl: string | null;
}

export interface CensusViewData {
  entries: CensusEntry[];
  /** Perfiles con cuadro válido cargado. Es el denominador de los porcentajes. */
  totalFans: number;
}

/** Fila cruda de `get_favorite_team_census`. */
type CensusRpcRow = {
  team_name: string;
  fans: number;
  /** `numeric` redondeado en la RPC. Puede venir null si el total es 0. */
  percentage: number | null;
};

/**
 * Posiciones con empates compartidos (ranking de competición: 1, 2, 2, 4).
 *
 * Con posiciones por índice, dos clubes con la misma cantidad de hinchas
 * aparecerían como 2º y 3º, y el 3º parecería tener menos que el 2º cuando
 * están iguales. En un censo con base chica los empates son la norma, no la
 * excepción.
 *
 * Asume las filas YA ordenadas de mayor a menor, que es lo que garantiza el
 * ORDER BY de la RPC.
 */
export function assignPositions(fansDescending: number[]): number[] {
  const positions: number[] = [];
  let lastFans: number | null = null;
  let lastPosition = 0;

  fansDescending.forEach((fans, index) => {
    if (fans === lastFans) {
      positions.push(lastPosition);
      return;
    }
    // El salto es a `index + 1`, no a `lastPosition + 1`: después de un empate
    // en 2º con dos clubes, el siguiente es 4º y no 3º.
    lastPosition = index + 1;
    lastFans = fans;
    positions.push(lastPosition);
  });

  return positions;
}

/** Normaliza una fila de la RPC al modelo de la UI. */
export function mapCensusRow(row: CensusRpcRow, position: number): CensusEntry {
  return {
    position,
    teamName: row.team_name,
    fans: Number(row.fans),
    // `?? 0` defensivo: el NULLIF de la RPC devuelve null si no hay ningún
    // perfil con cuadro cargado. Un 0 se pinta bien; un null rompería el
    // `.toFixed()` de la pantalla.
    percentage: Number(row.percentage ?? 0),
    logoUrl: getClubLogoUrl(row.team_name),
  };
}

/**
 * Censo completo, ya ordenado de mayor a menor.
 *
 * La RPC hace el GROUP BY y el porcentaje en la base: traer los perfiles y
 * contarlos en el cliente significaría bajar una fila por usuario para mostrar
 * 28 números.
 */
export async function fetchFavoriteTeamCensus(): Promise<CensusViewData> {
  const { data, error } = await supabase.rpc('get_favorite_team_census');
  if (error) throw error;

  const rows = (data ?? []) as CensusRpcRow[];
  const positions = assignPositions(rows.map((row) => Number(row.fans)));

  return {
    entries: rows.map((row, index) => mapCensusRow(row, positions[index])),
    totalFans: rows.reduce((sum, row) => sum + Number(row.fans), 0),
  };
}
