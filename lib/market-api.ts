import { supabase } from './supabase';
import { CreateTeamPostInput, CreatePlayerPostInput } from './schemas/marketSchema';

export interface ManagedTeam {
  id: string;
  name: string;
}

export interface MarketTeamPost {
  id: string;
  team_id: string;
  created_by: string;
  position_wanted: string;
  pitch_type?: string | null;
  description: string | null;
  match_date?: string | null;
  match_time?: string | null;
  zone?: string | null;
  complex?: string | null;
  is_active: boolean;
  created_at: string;
  teams: {
    id: string;
    name: string;
    zone?: string | null;
    shield_url: string | null;
  } | null;
}

export interface MarketPlayerPost {
  id: string;
  profile_id: string;
  post_type: string;
  position: string;
  description: string | null;
  is_active: boolean;
  created_at: string;
  profiles: {
    id: string;
    full_name: string;
    avatar_url: string | null;
    username: string;
  } | null;
}

/**
 * Resuelve el profiles.id del usuario autenticado.
 * IMPORTANTE: profiles.id ≠ auth.users.id — siempre usar este helper.
 */
async function getProfileId(): Promise<string> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('No autenticado');
  const { data, error } = await supabase
    .from('profiles')
    .select('id')
    .eq('auth_user_id', user.id)
    .single();
  if (error || !data) throw new Error('Perfil no encontrado');
  return data.id;
}

/**
 * Obtiene las publicaciones activas de equipos que buscan jugadores.
 */
export async function fetchTeamPosts(positionFilter?: string, zoneFilter?: string | null): Promise<MarketTeamPost[]> {
  let query = supabase
    .from('market_team_posts')
    .select(`
      *,
      teams (
        id,
        name,
        zone,
        shield_url
      )
    `)
    .eq('is_active', true)
    .order('created_at', { ascending: false });

  if (positionFilter && positionFilter !== 'CUALQUIERA') {
    query = query.eq('position_wanted', positionFilter as any);
  }

  if (zoneFilter && zoneFilter !== 'CUALQUIERA') {
    query = query.eq('zone', zoneFilter as any);
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as MarketTeamPost[];
}

/**
 * Obtiene las publicaciones activas de jugadores que buscan equipo o partido.
 */
export async function fetchPlayerPosts(positionFilter?: string, typeFilter?: string): Promise<MarketPlayerPost[]> {
  let query = supabase
    .from('market_player_posts')
    .select(`
      *,
      profiles (
        id,
        full_name,
        avatar_url,
        username
      )
    `)
    .eq('is_active', true)
    .order('created_at', { ascending: false });

  if (positionFilter && positionFilter !== 'CUALQUIERA') {
    query = query.eq('position', positionFilter as any);
  }

  if (typeFilter) {
    query = query.eq('post_type', typeFilter as any);
  }

  // Note: market_player_posts has no zone column — zone filtering applies to team posts only.

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as MarketPlayerPost[];
}

/**
 * Crea una publicación donde un equipo busca un jugador.
 * Solo CAPITÁN o SUBCAPITÁN pueden llamar esto (validación de roles en la UI).
 */
export async function createTeamPost(postData: CreateTeamPostInput): Promise<void> {
  const profileId = await getProfileId();

  const { error } = await supabase
    .from('market_team_posts')
    .insert({
      team_id: postData.teamId,
      position_wanted: postData.positionWanted,
      pitch_type: postData.pitchType || null,
      description: postData.description || null,
      match_date: postData.matchDate || null,
      match_time: postData.matchTime || null,
      zone: postData.zone || null,
      complex: postData.complex || null,
      created_by: profileId,
    });

  if (error) throw error;
}

/**
 * Crea una publicación donde un jugador busca equipo o partido.
 */
export async function createPlayerPost(postData: CreatePlayerPostInput): Promise<void> {
  const profileId = await getProfileId();

  const { error } = await supabase
    .from('market_player_posts')
    .insert({
      profile_id: profileId,
      post_type: postData.postType,
      position: postData.position,
      description: postData.description || null,
    });

  if (error) throw error;
}

/**
 * Retorna los equipos donde el usuario autenticado es CAPITÁN o SUBCAPITÁN.
 */
export async function fetchUserManagedTeams(authUserId: string): Promise<ManagedTeam[]> {
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('id')
    .eq('auth_user_id', authUserId)
    .single();

  if (profileError || !profile) return [];

  const { data, error } = await supabase
    .from('team_members')
    .select('teams(id, name)')
    .eq('profile_id', profile.id)
    .in('role', ['CAPITAN', 'SUBCAPITAN']);

  if (error) throw error;

  return (data ?? [])
    .map((m) => m.teams as unknown as ManagedTeam)
    .filter((t): t is ManagedTeam => !!t);
}

/**
 * Obtiene el código de invitación de un equipo (teams.invite_code).
 */
export async function fetchTeamInviteCode(teamId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('teams')
    .select('invite_code')
    .eq('id', teamId)
    .single();
  if (error) return null;
  return data?.invite_code ?? null;
}

/**
 * Activa o desactiva una publicación existente.
 */
export async function togglePostStatus(postId: string, isTeamPost: boolean, isActive: boolean): Promise<void> {
  const table = isTeamPost ? 'market_team_posts' : 'market_player_posts';

  const { error } = await supabase
    .from(table)
    .update({ is_active: isActive })
    .eq('id', postId);

  if (error) throw error;
}
