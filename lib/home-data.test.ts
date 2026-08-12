import { describe, it, expect, vi } from 'vitest';
import { buildPendingActions } from './home-data';

// home-data importa el cliente real sólo para `fetchHomeViewData`; lo que se
// prueba acá es la parte pura (D12), pero el import se resuelve igual.
vi.mock('@/lib/supabase', () => ({
  supabase: { from: vi.fn() },
}));
// Mismo motivo: `Logger` arrastra `react-native`, que el runtime `node` de
// estos tests no puede parsear.
vi.mock('@/lib/logger', () => ({
  Logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

describe('buildPendingActions (D12)', () => {
  it('descarta las señales en cero: la bandeja no muestra "0 desafíos"', () => {
    const actions = buildPendingActions([
      { type: 'DISPUTE', count: 0 },
      { type: 'TEAM_REQUEST', count: 2 },
    ]);

    expect(actions).toHaveLength(1);
    expect(actions[0].type).toBe('TEAM_REQUEST');
  });

  // El orden es de producto: primero lo que se cierra solo si nadie actúa.
  it('ordena por urgencia, no por el orden en que llegan los conteos', () => {
    const actions = buildPendingActions([
      { type: 'MARKET_APPLICATION', count: 1 },
      { type: 'TEAM_REQUEST', count: 1 },
      { type: 'LIVE_RESULT', count: 1 },
      { type: 'MATCH_PROPOSAL', count: 1 },
    ]);

    expect(actions.map((a) => a.type)).toEqual([
      'LIVE_RESULT',
      'MATCH_PROPOSAL',
      'TEAM_REQUEST',
      'MARKET_APPLICATION',
    ]);
  });

  it('usa singular con 1 y plural con más', () => {
    expect(buildPendingActions([{ type: 'MATCH_PROPOSAL', count: 1 }])[0].label).toBe(
      '1 propuesta de partido esperando tu respuesta',
    );
    expect(buildPendingActions([{ type: 'MATCH_PROPOSAL', count: 3 }])[0].label).toBe(
      '3 propuestas de partido esperando tu respuesta',
    );
  });

  it('cubre las cuatro señales nuevas de D12', () => {
    const actions = buildPendingActions([
      { type: 'LIVE_RESULT', count: 1 },
      { type: 'MATCH_PROPOSAL', count: 1 },
      { type: 'CANCELLATION_REQUEST', count: 1 },
      { type: 'MARKET_APPLICATION', count: 1 },
    ]);

    expect(actions).toHaveLength(4);
    for (const action of actions) {
      expect(action.label.length).toBeGreaterThan(0);
    }
  });

  // El atajo directo al partido sólo puede existir cuando no hay ambigüedad:
  // con dos propuestas pendientes, entrar a una de las dos sería arbitrario.
  it('conserva el matchId sólo cuando la acción es única', () => {
    expect(buildPendingActions([{ type: 'DISPUTE', count: 1, matchId: 'm-1' }])[0].matchId).toBe(
      'm-1',
    );
    expect(
      buildPendingActions([{ type: 'DISPUTE', count: 2, matchId: 'm-1' }])[0].matchId,
    ).toBeNull();
  });

  it('deja el matchId en null cuando la señal no apunta a un partido', () => {
    expect(buildPendingActions([{ type: 'TEAM_REQUEST', count: 1 }])[0].matchId).toBeNull();
  });
});
