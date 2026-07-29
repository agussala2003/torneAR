import { supabase } from '@/lib/supabase';
import { Logger } from '@/lib/logger';
import { Database } from '@/types/supabase';
import { BadgeItem, ProfileStats, ProfileViewData, TeamItem } from '@/components/profile/types';

type ProfileRow = Database['public']['Tables']['profiles']['Row'];

/**
 * Salida de get_player_global_stats (migración 20260723122000). El RPC declara
 * `Returns: Json`, así que se describe la forma acá para no perder el tipado.
 *
 * Reemplaza a la vista v_player_stats, que derivaba SÓLO de match_participants
 * e ignoraba team_stints: un jugador con historial en ciclos cerrados (club
 * disuelto, datos migrados, backfill) veía 0 en su perfil mientras su
 * trayectoria mostraba 150 goles. Ése era el bug 7.
 */
type PlayerGlobalStats = {
  profile_id: string;
  matches_played: number;
  total_goals: number;
  total_mvps: number;
  total_wins: number;
  pj_ranking: number;
  pj_amistoso: number;
  total_draws: number;
  total_losses: number;
  clean_sheets: number;
  teams_count: number;
  active_teams_count: number;
  guest_breakdown: {
    matches_played: number;
    goals: number;
    mvps: number;
    teams_count: number;
  };
};

type TeamMemberJoinedRow = {
  role: Database['public']['Enums']['team_role'];
  teams: {
    id: string;
    name: string;
    elo_rating: number;
    shield_url: string | null;
  } | null;
};

type BadgeRpcRow = {
  id: string; slug: string; name: string;
  criteria_description: string; icon_url: string;
  entity_type: string; is_earned: boolean;
};

function toStats(row: PlayerGlobalStats | null): ProfileStats {
  return {
    matchesPlayed: row?.matches_played ?? 0,
    goals: row?.total_goals ?? 0,
    mvps: row?.total_mvps ?? 0,
    wins: row?.total_wins ?? 0,
  };
}

function toTeams(rows: TeamMemberJoinedRow[] | null): TeamItem[] {
  if (!rows) return [];

  return rows
    .filter((row) => !!row.teams)
    .map((row) => ({
      id: row.teams!.id,
      name: row.teams!.name,
      prRating: row.teams!.elo_rating,
      shieldUrl: row.teams!.shield_url,
      role: row.role,
    }));
}

function mapBadgesFromRpc(data: BadgeRpcRow[] | null): BadgeItem[] {
  return (data ?? []).map((r) => ({
    id: r.id,
    name: r.name,
    slug: r.slug,
    iconUrl: r.icon_url,
    criteriaDescription: r.criteria_description,
    earnedAt: null,
    isEarned: r.is_earned,
  }));
}

export async function fetchProfileViewData(profile: ProfileRow): Promise<ProfileViewData> {
  const [statsRes, teamsRes, badgesRpcRes] = await Promise.all([
    // Antes: .from('v_player_stats') — ver comentario en PlayerGlobalStats.
    supabase.rpc('get_player_global_stats', { p_profile_id: profile.id }),
    supabase
      .from('team_members')
      .select('role, teams(id, name, elo_rating, shield_url)')
      .eq('profile_id', profile.id),
    supabase.rpc(
      'get_player_badges' as Parameters<typeof supabase.rpc>[0],
      { p_profile_id: profile.id },
    ),
  ]);

  // Los tres tramos degradan a vacío en vez de tirar: el perfil se ve igual,
  // sólo que sin stats, sin equipos o sin insignias. Justamente por eso el log
  // importa — en pantalla, un perfil recién creado y uno roto son idénticos.
  if (statsRes.error) {
    Logger.error('Fallo el RPC de stats globales del perfil', {
      scope: 'profile-data.fetchProfileViewData',
      profileId: profile.id,
      error: statsRes.error,
    });
  }

  if (teamsRes.error) {
    Logger.error('Fallo la consulta de equipos del perfil', {
      scope: 'profile-data.fetchProfileViewData',
      profileId: profile.id,
      error: teamsRes.error,
    });
  }

  if (badgesRpcRes.error) {
    Logger.error('Fallo el RPC de insignias del perfil', {
      scope: 'profile-data.fetchProfileViewData',
      profileId: profile.id,
      error: badgesRpcRes.error,
    });
  }

  return {
    profile,
    stats: toStats(
      statsRes.error ? null : ((statsRes.data as unknown) as PlayerGlobalStats | null),
    ),
    teams: toTeams((teamsRes.error ? null : (teamsRes.data as TeamMemberJoinedRow[] | null)) ?? null),
    badges: mapBadgesFromRpc(badgesRpcRes.error ? null : (badgesRpcRes.data as unknown as BadgeRpcRow[] | null)),
  };
}
