import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createQueryBuilder } from './test-utils/supabase-mock';
import { resolveAndSetReferral } from './referral-data';

const { supabaseMock, loggerMock } = vi.hoisted(() => ({
  supabaseMock: {
    from: vi.fn(),
    rpc: vi.fn(),
  },
  loggerMock: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('@/lib/supabase', () => ({ supabase: supabaseMock }));
vi.mock('@/lib/logger', () => ({ Logger: loggerMock }));

const AUTH_USER_ID = 'auth-1';
const SELF = { id: 'me', referred_by: null };
const REFERRER = { id: 'cap' };

/**
 * `resolveAndSetReferral` dispara las dos lecturas con `Promise.all` en orden
 * fijo: primero el perfil propio, después el del referente.
 */
function mockReads(
  self: { data: unknown; error: unknown },
  referrer: { data: unknown; error: unknown },
) {
  supabaseMock.from
    .mockReturnValueOnce(createQueryBuilder(self))
    .mockReturnValueOnce(createQueryBuilder(referrer));
}

function lastInfoDetails() {
  return loggerMock.info.mock.calls.at(-1)?.[1] as Record<string, unknown>;
}

beforeEach(() => {
  vi.clearAllMocks();
  supabaseMock.rpc.mockResolvedValue({ error: null });
});

describe('resolveAndSetReferral', () => {
  it('registra `applied` cuando el referente existe y el perfil no tenía uno', async () => {
    mockReads({ data: SELF, error: null }, { data: REFERRER, error: null });

    const status = await resolveAndSetReferral('capitan', AUTH_USER_ID);

    expect(status).toBe('applied');
    expect(supabaseMock.rpc).toHaveBeenCalledWith('set_referral', {
      p_referred_by_username: 'capitan',
    });
    expect(lastInfoDetails()).toMatchObject({
      event: 'referral.resolve',
      status: 'applied',
      referredByUsername: 'capitan',
      referrerProfileId: 'cap',
    });
  });

  it('registra `noop_invalid` cuando el username no existe', async () => {
    mockReads({ data: SELF, error: null }, { data: null, error: null });

    expect(await resolveAndSetReferral('fantasma', AUTH_USER_ID)).toBe('noop_invalid');
    expect(lastInfoDetails()).toMatchObject({ status: 'noop_invalid', referrerProfileId: null });
  });

  it('registra `noop_self` cuando el referente es el propio usuario', async () => {
    mockReads({ data: SELF, error: null }, { data: { id: SELF.id }, error: null });

    expect(await resolveAndSetReferral('yomismo', AUTH_USER_ID)).toBe('noop_self');
  });

  it('registra `noop_already_set` cuando el perfil ya tenía referente', async () => {
    mockReads({ data: { id: 'me', referred_by: 'otro' }, error: null }, { data: REFERRER, error: null });

    expect(await resolveAndSetReferral('capitan', AUTH_USER_ID)).toBe('noop_already_set');
  });

  it('prioriza `noop_invalid` sobre `noop_already_set`, igual que la RPC', async () => {
    // `set_referral` corta por referente inexistente ANTES de mirar
    // `referred_by`. Si acá se invirtiera el orden, el log diría que el usuario
    // ya tenía referente cuando en realidad el link estaba roto.
    mockReads({ data: { id: 'me', referred_by: 'otro' }, error: null }, { data: null, error: null });

    expect(await resolveAndSetReferral('fantasma', AUTH_USER_ID)).toBe('noop_invalid');
  });

  it('registra `rpc_error` y no rompe el onboarding cuando falla la RPC', async () => {
    mockReads({ data: SELF, error: null }, { data: REFERRER, error: null });
    supabaseMock.rpc.mockResolvedValue({ error: { message: 'network' } });

    expect(await resolveAndSetReferral('capitan', AUTH_USER_ID)).toBe('rpc_error');
    expect(loggerMock.warn).toHaveBeenCalledTimes(1);
    expect(loggerMock.warn.mock.calls[0][1]).toMatchObject({ status: 'rpc_error' });
    expect(loggerMock.info).not.toHaveBeenCalled();
  });

  it('cae en `unknown` si una lectura falla, en vez de inventar un diagnóstico', async () => {
    mockReads({ data: null, error: { message: 'rls' } }, { data: REFERRER, error: null });

    expect(await resolveAndSetReferral('capitan', AUTH_USER_ID)).toBe('unknown');
    // La RPC igual se llama: la clasificación no decide nada.
    expect(supabaseMock.rpc).toHaveBeenCalledTimes(1);
  });

  it('normaliza el username en el log pero manda el original a la RPC', async () => {
    mockReads({ data: SELF, error: null }, { data: REFERRER, error: null });

    await resolveAndSetReferral('  CapitaN  ', AUTH_USER_ID);

    expect(supabaseMock.rpc).toHaveBeenCalledWith('set_referral', {
      p_referred_by_username: '  CapitaN  ',
    });
    expect(lastInfoDetails()).toMatchObject({ referredByUsername: 'capitan' });
  });
});
