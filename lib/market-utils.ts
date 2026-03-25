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
