import { describe, expect, it } from 'vitest';
import { isProfileComplete } from './auth-utils';

type PartialProfile = Record<string, unknown>;

const baseProfile: PartialProfile = {
  full_name: 'Juan Perez',
  preferred_position: 'DELANTERO',
  username: 'juanp',
  zone: 'Buenos Aires',
  date_of_birth: '1995-06-15',
  gender: 'M',
  strong_foot: 'RIGHT',
};

describe('isProfileComplete', () => {
  it('returns false when profile is null', () => {
    expect(isProfileComplete(null)).toBe(false);
  });

  it('returns false when username is missing', () => {
    expect(isProfileComplete({ ...baseProfile, username: null } as never)).toBe(false);
  });

  it('returns false when full_name is missing', () => {
    expect(isProfileComplete({ ...baseProfile, full_name: null } as never)).toBe(false);
  });

  it('returns false when preferred_position is missing', () => {
    expect(isProfileComplete({ ...baseProfile, preferred_position: null } as never)).toBe(false);
  });

  it('returns false when zone is missing', () => {
    expect(isProfileComplete({ ...baseProfile, zone: null } as never)).toBe(false);
  });

  it('returns false when date_of_birth is missing', () => {
    expect(isProfileComplete({ ...baseProfile, date_of_birth: null } as never)).toBe(false);
  });

  it('returns false when gender is missing', () => {
    expect(isProfileComplete({ ...baseProfile, gender: null } as never)).toBe(false);
  });

  it('returns false when strong_foot is missing', () => {
    expect(isProfileComplete({ ...baseProfile, strong_foot: null } as never)).toBe(false);
  });

  it('returns true when all required fields are present (favorite_team can be null)', () => {
    expect(isProfileComplete({ ...baseProfile, favorite_team: null } as never)).toBe(true);
  });

  it('returns true when all fields including favorite_team are present', () => {
    expect(isProfileComplete({ ...baseProfile, favorite_team: 'River Plate' } as never)).toBe(true);
  });
});
