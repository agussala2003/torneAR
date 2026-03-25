import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { imageIndexFromId, isUrgentPost, filterPostsByDay, sortPostsByNearest } from './market-utils';
import type { MarketTeamPost } from './market-api';

describe('imageIndexFromId', () => {
  it('returns 0, 1, or 2', () => {
    const indices = ['abc', 'def', 'xyz', '123', 'uuid-style-id'].map(imageIndexFromId);
    indices.forEach(i => expect(i).toBeGreaterThanOrEqual(0));
    indices.forEach(i => expect(i).toBeLessThanOrEqual(2));
  });

  it('returns same value for the same id', () => {
    expect(imageIndexFromId('test-id')).toBe(imageIndexFromId('test-id'));
  });
});

describe('isUrgentPost', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-24T12:00:00Z'));
  });
  afterEach(() => { vi.useRealTimers(); });

  it('returns true when matchDate equals today', () => {
    expect(isUrgentPost('2026-03-24')).toBe(true);
  });

  it('returns false for a future date', () => {
    expect(isUrgentPost('2026-03-25')).toBe(false);
  });

  it('returns false for null', () => {
    expect(isUrgentPost(null)).toBe(false);
  });

  it('returns false for freetext (non-ISO)', () => {
    expect(isUrgentPost('Viernes')).toBe(false);
  });
});

describe('filterPostsByDay', () => {
  const posts = [
    { id: '1', match_date: '2026-03-23' }, // Monday
    { id: '2', match_date: '2026-03-26' }, // Thursday
    { id: '3', match_date: null },
    { id: '4', match_date: 'Viernes' },     // freetext
  ] as unknown as MarketTeamPost[];

  it('returns all posts when selectedDays is empty', () => {
    expect(filterPostsByDay(posts, [])).toHaveLength(4);
  });

  it('returns posts matching selected day + null dates', () => {
    const result = filterPostsByDay(posts, ['Lunes']);
    expect(result.map(p => p.id)).toEqual(['1', '3', '4']);
  });

  it('supports multiple days', () => {
    const result = filterPostsByDay(posts, ['Lunes', 'Jueves']);
    expect(result.map(p => p.id)).toEqual(['1', '2', '3', '4']);
  });
});

describe('sortPostsByNearest', () => {
  const posts = [
    { id: 'a', match_date: '2026-04-01' },
    { id: 'b', match_date: null },
    { id: 'c', match_date: '2026-03-25' },
    { id: 'd', match_date: 'Viernes' },
  ] as unknown as MarketTeamPost[];

  it('sorts ISO dates ascending, nulls/freetext last', () => {
    const sorted = sortPostsByNearest(posts);
    expect(sorted[0].id).toBe('c');
    expect(sorted[1].id).toBe('a');
    // null/freetext at end
    expect(['b', 'd']).toContain(sorted[2].id);
    expect(['b', 'd']).toContain(sorted[3].id);
  });
});
