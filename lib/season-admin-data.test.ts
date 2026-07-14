import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createQueryBuilder } from './test-utils/supabase-mock';

const { supabaseMock } = vi.hoisted(() => ({
  supabaseMock: { from: vi.fn(), rpc: vi.fn() },
}));

vi.mock('@/lib/supabase', () => ({
  supabase: supabaseMock,
}));

import { fetchActiveSeasonInfo, transitionSeason } from './season-admin-data';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('transitionSeason', () => {
  it('llama a la RPC transition_season con los parámetros correctos y devuelve el id nuevo', async () => {
    supabaseMock.rpc.mockResolvedValueOnce({ data: 'season-nueva-id', error: null });

    const result = await transitionSeason('Apertura 2027', '2027-01-01', '2027-06-30');

    expect(supabaseMock.rpc).toHaveBeenCalledWith('transition_season', {
      p_new_name: 'Apertura 2027',
      p_starts_at: '2027-01-01',
      p_ends_at: '2027-06-30',
    });
    expect(result).toBe('season-nueva-id');
  });

  it('propaga el error del RPC (ej. caller sin rol admin)', async () => {
    supabaseMock.rpc.mockResolvedValueOnce({
      data: null,
      error: new Error('No autorizado: se requiere rol de administrador'),
    });

    await expect(transitionSeason('Apertura 2027', '2027-01-01', '2027-06-30')).rejects.toThrow(
      'No autorizado',
    );
  });

  it('propaga el error de dominio (ej. slug duplicado o rango de fechas inválido)', async () => {
    supabaseMock.rpc.mockResolvedValueOnce({
      data: null,
      error: new Error('Ya existe una temporada con slug "apertura-2027"'),
    });

    await expect(transitionSeason('Apertura 2027', '2027-01-01', '2027-06-30')).rejects.toThrow(
      'slug',
    );
  });
});

describe('fetchActiveSeasonInfo', () => {
  it('mapea la temporada activa y marca isExpired=false si ends_at es futuro', async () => {
    const builder = createQueryBuilder({
      data: { id: 's1', name: 'Clausura 2026', starts_at: '2026-07-01', ends_at: '2099-12-31' },
      error: null,
    });
    supabaseMock.from.mockReturnValueOnce(builder);

    const info = await fetchActiveSeasonInfo();

    expect(supabaseMock.from).toHaveBeenCalledWith('seasons');
    expect(builder.eq).toHaveBeenCalledWith('is_active', true);
    expect(info).toEqual({
      id: 's1',
      name: 'Clausura 2026',
      startsAt: '2026-07-01',
      endsAt: '2099-12-31',
      isExpired: false,
    });
  });

  it('marca isExpired=true cuando ends_at ya pasó', async () => {
    supabaseMock.from.mockReturnValueOnce(
      createQueryBuilder({
        data: { id: 's0', name: 'Apertura 2020', starts_at: '2020-01-01', ends_at: '2020-06-30' },
        error: null,
      }),
    );

    const info = await fetchActiveSeasonInfo();
    expect(info?.isExpired).toBe(true);
  });

  it('devuelve null si no hay temporada activa', async () => {
    supabaseMock.from.mockReturnValueOnce(createQueryBuilder({ data: null, error: null }));
    expect(await fetchActiveSeasonInfo()).toBeNull();
  });

  it('propaga el error de la query', async () => {
    supabaseMock.from.mockReturnValueOnce(
      createQueryBuilder({ data: null, error: new Error('conexión caída') }),
    );
    await expect(fetchActiveSeasonInfo()).rejects.toThrow('conexión caída');
  });
});
