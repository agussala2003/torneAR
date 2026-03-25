import { describe, it, expect } from 'vitest';
import { computeUnread } from './chat-utils';

describe('computeUnread', () => {
  const myId = 'user-1';
  const otherId = 'user-2';
  const older = '2026-03-25T10:00:00Z';
  const newer = '2026-03-25T11:00:00Z';

  it('is unread when last_read_at is null (never opened)', () => {
    expect(computeUnread(newer, otherId, null, myId)).toBe(true);
  });

  it('is unread when last message arrived after last_read_at', () => {
    expect(computeUnread(newer, otherId, older, myId)).toBe(true);
  });

  it('is not unread when last_read_at is after last message', () => {
    expect(computeUnread(older, otherId, newer, myId)).toBe(false);
  });

  it('is not unread when I sent the last message', () => {
    expect(computeUnread(newer, myId, older, myId)).toBe(false);
  });

  it('is not unread when there are no messages', () => {
    expect(computeUnread(null, null, null, myId)).toBe(false);
  });
});
