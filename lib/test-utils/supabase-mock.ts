import { vi } from 'vitest';

export type MockResult<T = unknown> = { data: T; error: unknown };

const CHAIN_METHODS = ['select', 'eq', 'in', 'or', 'limit', 'update', 'insert', 'upsert', 'order'] as const;

// Builder chainable mínimo para simular supabase-js: cualquier método de la lista
// devuelve el propio builder (encadenable indefinidamente), y el builder es
// "thenable" para poder hacer `await supabase.from(x).select(y).eq(z, w)` sin
// llamar explícitamente a `.single()` u otro terminal.
export function createQueryBuilder(result: MockResult) {
  const builder: Record<string, unknown> = {};
  for (const method of CHAIN_METHODS) {
    builder[method] = vi.fn(() => builder);
  }
  builder.single = vi.fn(() => Promise.resolve(result));
  builder.maybeSingle = vi.fn(() => Promise.resolve(result));
  builder.then = (
    onFulfilled?: (value: MockResult) => unknown,
    onRejected?: (reason: unknown) => unknown,
  ) => Promise.resolve(result).then(onFulfilled, onRejected);
  return builder;
}

export function createStorageMock(uploadResult: MockResult) {
  return {
    from: vi.fn((_bucket: string) => ({
      upload: vi.fn(() => Promise.resolve(uploadResult)),
    })),
  };
}
