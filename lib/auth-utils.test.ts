import { describe, expect, it } from 'vitest';
import { isProfileComplete } from './auth-utils';

describe('isProfileComplete', () => {
  it('returns false when profile is null', () => {
    expect(isProfileComplete(null)).toBe(false);
  });

  it('returns false when username is missing', () => {
    const profile = {
      full_name: 'Juan Perez',
      preferred_position: 'DELANTERO',
      username: null,
    } as never;

    expect(isProfileComplete(profile)).toBe(false);
  });

  it('returns false when full_name is missing', () => {
    const profile = {
      full_name: null,
      preferred_position: 'DELANTERO',
      username: 'juanp',
    } as never;

    expect(isProfileComplete(profile)).toBe(false);
  });

  it('returns false when preferred_position is missing', () => {
    const profile = {
      full_name: 'Juan Perez',
      preferred_position: null,
      username: 'juanp',
    } as never;

    expect(isProfileComplete(profile)).toBe(false);
  });

  it('returns true when all required fields are present', () => {
    const profile = {
      full_name: 'Juan Perez',
      preferred_position: 'DELANTERO',
      username: 'juanp',
    } as never;

    expect(isProfileComplete(profile)).toBe(true);
  });
});
