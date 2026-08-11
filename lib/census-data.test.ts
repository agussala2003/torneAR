import { describe, expect, it, vi, beforeEach } from 'vitest';
import { assignPositions, fetchFavoriteTeamCensus, mapCensusRow } from './census-data';

const { supabaseMock } = vi.hoisted(() => ({
  supabaseMock: { from: vi.fn(), rpc: vi.fn() },
}));

// `census-data` importa el cliente real, que arrastra `react-native` y no existe
// en el runtime `node` de esta suite.
vi.mock('@/lib/supabase', () => ({ supabase: supabaseMock }));

beforeEach(() => {
  supabaseMock.rpc.mockReset();
});

describe('assignPositions', () => {
  it('numera 1..n cuando no hay empates', () => {
    expect(assignPositions([10, 7, 3])).toEqual([1, 2, 3]);
  });

  it('comparte la posición entre empatados', () => {
    expect(assignPositions([10, 7, 7, 3])).toEqual([1, 2, 2, 4]);
  });

  it('salta las posiciones consumidas por el empate', () => {
    // Tres empatados en 2º: el siguiente es 5º, no 3º.
    expect(assignPositions([10, 7, 7, 7, 3])).toEqual([1, 2, 2, 2, 5]);
  });

  it('maneja un empate en el primer puesto', () => {
    expect(assignPositions([5, 5, 1])).toEqual([1, 1, 3]);
  });

  it('devuelve vacío sin filas', () => {
    expect(assignPositions([])).toEqual([]);
  });
});

describe('mapCensusRow', () => {
  it('resuelve el escudo del catálogo', () => {
    const entry = mapCensusRow({ team_name: 'Boca Juniors', fans: 5, percentage: 45.5 }, 1);
    expect(entry.logoUrl).toBe(
      'https://assets.football-logos.cc/logos/argentina/256x256/boca-juniors.533fd0f6.png',
    );
    expect(entry.fans).toBe(5);
    expect(entry.percentage).toBe(45.5);
  });

  it('deja el escudo en null para un club fuera del catálogo', () => {
    // Un valor legacy que la migración no pudo resolver no debe romper la
    // pantalla: se muestra con su nombre y sin escudo.
    const entry = mapCensusRow({ team_name: 'Deportivo Inventado', fans: 1, percentage: 9.1 }, 3);
    expect(entry.logoUrl).toBeNull();
    expect(entry.teamName).toBe('Deportivo Inventado');
  });

  it('convierte un porcentaje null en 0', () => {
    // La RPC devuelve null vía NULLIF si todavía no hay ningún cuadro cargado.
    const entry = mapCensusRow({ team_name: 'Belgrano', fans: 0, percentage: null }, 1);
    expect(entry.percentage).toBe(0);
  });
});

describe('fetchFavoriteTeamCensus', () => {
  it('mapea las filas y suma el total de hinchas', async () => {
    // Las mismas cifras que devolvió la base de producción al escribir la RPC.
    supabaseMock.rpc.mockResolvedValue({
      data: [
        { team_name: 'Boca Juniors', fans: 5, percentage: 45.5 },
        { team_name: 'Barracas Central', fans: 3, percentage: 27.3 },
        { team_name: 'Racing Club', fans: 2, percentage: 18.2 },
        { team_name: 'Belgrano', fans: 1, percentage: 9.1 },
      ],
      error: null,
    });

    const result = await fetchFavoriteTeamCensus();

    expect(supabaseMock.rpc).toHaveBeenCalledWith('get_favorite_team_census');
    expect(result.totalFans).toBe(11);
    expect(result.entries.map((entry) => entry.position)).toEqual([1, 2, 3, 4]);
    expect(result.entries[0].teamName).toBe('Boca Juniors');
    expect(result.entries[0].logoUrl).toContain('boca-juniors');
  });

  it('devuelve vacío cuando la RPC no trae filas', async () => {
    // `data: null` es lo que manda PostgREST ante un set vacío en algunos casos;
    // la pantalla tiene que caer en su estado vacío, no explotar.
    supabaseMock.rpc.mockResolvedValue({ data: null, error: null });

    const result = await fetchFavoriteTeamCensus();

    expect(result.entries).toEqual([]);
    expect(result.totalFans).toBe(0);
  });

  it('propaga el error de la RPC', async () => {
    supabaseMock.rpc.mockResolvedValue({ data: null, error: { message: 'boom' } });

    await expect(fetchFavoriteTeamCensus()).rejects.toEqual({ message: 'boom' });
  });
});
