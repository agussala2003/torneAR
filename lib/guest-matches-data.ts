import { supabase } from '@/lib/supabase';
import { getSupabaseStorageUrl } from '@/lib/supabase-storage';
import type { MatchCardEntry } from '@/components/matches/types';
import type { Database } from '@/types/supabase';

type MatchStatus = Database['public']['Enums']['match_status'];
type MatchType = Database['public']['Enums']['match_type'];
type TeamFormat = Database['public']['Enums']['team_format'];

interface TeamEmbed {
  id: string;
  name: string;
  shield_url: string | null;
  elo_rating: number | null;
}

interface GuestMatchRow {
  id: string;
  status: MatchStatus;
  match_type: MatchType;
  scheduled_at: string | null;
  format: TeamFormat | null;
  location: string | null;
  checkin_team_a_at: string | null;
  checkin_team_b_at: string | null;
  team_a_id: string;
  team_b_id: string;
  venue: { name: string } | { name: string }[] | null;
  team_a: TeamEmbed | TeamEmbed[] | null;
  team_b: TeamEmbed | TeamEmbed[] | null;
  results: { team_id: string; goals_scored: number }[] | null;
}

export interface GuestMatchesData {
  /** Mismo tipo que los partidos propios: las tarjetas no distinguen el origen. */
  entries: MatchCardEntry[];
  /**
   * `matchId` → equipo por el que entró el invitado.
   *
   * Va por separado y no dentro de `MatchCardEntry` a propósito: el lado es del
   * vínculo entre ESTE usuario y ESE partido, no del partido. `MatchesViewData`
   * tiene un único `myTeamId` para toda la vista porque un socio mira siempre
   * desde su equipo; un invitado puede haber entrado por bandos distintos en
   * dos partidos.
   */
  teamIdByMatchId: Record<string, string>;
}

const EMPTY: GuestMatchesData = { entries: [], teamIdByMatchId: {} };

/**
 * `matchId` → equipo por el que el usuario entró como invitado.
 *
 * Es la mitad barata de {@link fetchGuestMatchesData}: el Inicio ya trae los
 * partidos en su propia consulta y sólo necesita saber cuáles sumar y desde qué
 * lado mirarlos.
 */
export async function fetchGuestMatchSides(profileId: string): Promise<Record<string, string>> {
  const { data, error } = await supabase
    .from('match_participants')
    .select('match_id, team_id')
    .eq('profile_id', profileId)
    .eq('is_guest', true);

  if (error) throw error;

  const sides: Record<string, string> = {};
  for (const row of data ?? []) {
    if (row.match_id && row.team_id) sides[row.match_id] = row.team_id;
  }
  return sides;
}

/** PostgREST devuelve el embed como objeto o como array según infiera la relación. */
function firstOrSelf<T>(value: T | T[] | null): T | null {
  if (value === null) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

/**
 * Partidos a los que el usuario entró **con código de invitado**.
 *
 * `join_match_as_guest` anota al invitado en `match_participants` con
 * `is_guest = true` y sin crear membresía, así que estos partidos no aparecían
 * por ningún lado: `get_my_matches` filtra por equipo y exige membresía, y el
 * Inicio filtra por `team_members`. El canje funcionaba, se veía el detalle una
 * vez… y después no había forma de volver (auditoría E2E, módulo 6.3).
 *
 * No pasa por la RPC justamente porque el invitado no es miembro de nada: se
 * arma contra las tablas, que son de lectura pública bajo RLS. El alcance sigue
 * acotado por `match_participants` — sólo los partidos que canjeó.
 */
export async function fetchGuestMatchesData(profileId: string): Promise<GuestMatchesData> {
  const teamIdByMatchId = await fetchGuestMatchSides(profileId);
  const matchIds = Object.keys(teamIdByMatchId);
  if (matchIds.length === 0) return EMPTY;

  const { data, error } = await supabase
    .from('matches')
    .select(
      `id, status, match_type, scheduled_at, format, location,
       checkin_team_a_at, checkin_team_b_at, team_a_id, team_b_id,
       venue:venues!venue_id(name),
       team_a:teams!team_a_id(id, name, shield_url, elo_rating),
       team_b:teams!team_b_id(id, name, shield_url, elo_rating),
       results:match_results(team_id, goals_scored)`,
    )
    .in('id', matchIds)
    .order('scheduled_at', { ascending: true, nullsFirst: false });

  if (error) throw error;

  const rows = (data ?? []) as unknown as GuestMatchRow[];

  const entries: MatchCardEntry[] = rows.map((row) => {
    const teamA = firstOrSelf(row.team_a);
    const teamB = firstOrSelf(row.team_b);
    const venue = firstOrSelf(row.venue);
    const results = row.results ?? [];

    return {
      id: row.id,
      status: row.status,
      matchType: row.match_type,
      scheduledAt: row.scheduled_at,
      format: row.format,
      venue: venue?.name ?? row.location ?? null,
      teamA: {
        id: row.team_a_id,
        name: teamA?.name ?? 'Equipo A',
        shieldUrl: teamA?.shield_url ? getSupabaseStorageUrl('shields', teamA.shield_url) : null,
        eloRating: teamA?.elo_rating ?? 1000,
      },
      teamB: {
        id: row.team_b_id,
        name: teamB?.name ?? 'Equipo B',
        shieldUrl: teamB?.shield_url ? getSupabaseStorageUrl('shields', teamB.shield_url) : null,
        eloRating: teamB?.elo_rating ?? 1000,
      },
      checkinTeamAAt: row.checkin_team_a_at,
      checkinTeamBAt: row.checkin_team_b_at,
      // Un invitado no coordina el partido: no propone, no acepta ni cancela.
      // La tarjeta se pinta sin acciones y el detalle sigue mandando.
      activeProposal: null,
      hasPendingCancellation: false,
      resultTeamA: results.find((r) => r.team_id === row.team_a_id)?.goals_scored ?? null,
      resultTeamB: results.find((r) => r.team_id === row.team_b_id)?.goals_scored ?? null,
    };
  });

  return { entries, teamIdByMatchId };
}
