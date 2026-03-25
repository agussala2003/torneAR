import type { MarketTeamPost } from './market-api';

const PITCH_META_RE = /^\[\[pitch:((?:FUTBOL_)?(?:5|6|7|8|9|11)|F(?:5|6|7|8|9|11))\]\]\s*/i;

// Deterministic index 0-2 from a UUID-like string
export function imageIndexFromId(id: string): number {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (hash * 31 + id.charCodeAt(i)) | 0;
  }
  return Math.abs(hash) % 3;
}

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// Returns true when matchDate is today in YYYY-MM-DD format
export function isUrgentPost(matchDate: string | null | undefined): boolean {
  if (!matchDate || !ISO_DATE_RE.test(matchDate)) return false;
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  return matchDate === today;
}

const DAY_MAP: Record<number, string> = {
  0: 'Domingo', 1: 'Lunes', 2: 'Martes', 3: 'Miércoles',
  4: 'Jueves', 5: 'Viernes', 6: 'Sábado',
};

// Keeps posts whose match_date falls on a selected weekday.
// Posts with null or non-ISO dates are kept (can't determine day, don't exclude).
export function filterPostsByDay(posts: MarketTeamPost[], selectedDays: string[]): MarketTeamPost[] {
  if (selectedDays.length === 0) return posts;
  return posts.filter(post => {
    if (!post.match_date || !ISO_DATE_RE.test(post.match_date)) return true;
    const dayName = DAY_MAP[new Date(post.match_date + 'T00:00:00').getDay()];
    return selectedDays.includes(dayName);
  });
}

// Sorts posts by match_date ASC; non-ISO and null dates go last.
export function sortPostsByNearest(posts: MarketTeamPost[]): MarketTeamPost[] {
  return [...posts].sort((a, b) => {
    const aValid = a.match_date && ISO_DATE_RE.test(a.match_date);
    const bValid = b.match_date && ISO_DATE_RE.test(b.match_date);
    if (aValid && bValid) return a.match_date!.localeCompare(b.match_date!);
    if (aValid) return -1;
    if (bValid) return 1;
    return 0;
  });
}

export function extractPitchTypeMeta(description: string | null | undefined): string | null {
  if (!description) return null;
  const match = description.match(PITCH_META_RE);
  if (!match) return null;
  const raw = match[1].toUpperCase();
  if (raw.startsWith('FUTBOL_')) return raw;
  if (/^F\d+$/.test(raw)) return `FUTBOL_${raw.slice(1)}`;
  return null;
}

export function sanitizeMarketDescription(description: string | null | undefined): string | null {
  if (!description) return null;
  const cleaned = description.replace(PITCH_META_RE, '').trim();
  return cleaned.length > 0 ? cleaned : null;
}

function parseMatchDateTime(matchDate?: string | null, matchTime?: string | null): Date | null {
  if (!matchDate || !ISO_DATE_RE.test(matchDate)) return null;

  const baseDate = new Date(`${matchDate}T00:00:00`);
  if (Number.isNaN(baseDate.getTime())) return null;

  if (!matchTime) return baseDate;

  const match = matchTime.match(/^(\d{1,2}):(\d{2})/);
  if (!match) return baseDate;

  const hours = Number(match[1]);
  const minutes = Number(match[2]);

  if (
    Number.isNaN(hours) ||
    Number.isNaN(minutes) ||
    hours < 0 ||
    hours > 23 ||
    minutes < 0 ||
    minutes > 59
  ) {
    return baseDate;
  }

  const withTime = new Date(baseDate);
  withTime.setHours(hours, minutes, 0, 0);
  return withTime;
}

function hasValidMatchTime(matchTime?: string | null): boolean {
  if (!matchTime) return false;
  const match = matchTime.match(/^(\d{1,2}):(\d{2})/);
  if (!match) return false;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  return !Number.isNaN(hours) && !Number.isNaN(minutes) && hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59;
}

export function getInitials(name: string): string {
  if (!name.trim()) return '?';
  const words = name.trim().split(/\s+/);
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

// Keeps only active posts relative to current time when they include match date/time metadata.
// - With match_date + match_time: post is active if datetime >= now.
// - With only match_date: post is active until end of that day.
// - Without valid match_date: post is kept (no schedule to expire).
export function filterActiveTeamPostsBySchedule(posts: MarketTeamPost[], now = new Date()): MarketTeamPost[] {
  return posts.filter((post) => {
    const parsed = parseMatchDateTime(post.match_date, post.match_time);
    if (!parsed) return true;

    if (hasValidMatchTime(post.match_time)) {
      return parsed.getTime() >= now.getTime();
    }

    const endOfDay = new Date(parsed);
    endOfDay.setHours(23, 59, 59, 999);
    return endOfDay.getTime() >= now.getTime();
  });
}
