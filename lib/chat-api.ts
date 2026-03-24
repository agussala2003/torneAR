import { supabase } from './supabase';

export interface MarketConversation {
  id: string;
  type: string;
  player_id: string;
  team_id: string;
  created_at: string;
  player?: {
    full_name: string;
    avatar_url: string | null;
  };
  team?: {
    name: string;
    shield_url: string | null;
  };
}

export interface MarketMessage {
  id: string;
  conversation_id: string;
  sender_profile_id: string;
  sender_team_id: string | null;
  content: string;
  created_at: string;
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
 * Obtiene o crea una conversación MARKET_DM entre un jugador y un equipo.
 * playerId y teamId deben ser profiles.id y teams.id respectivamente.
 */
export async function getOrCreateMarketChat(
  playerId: string,
  teamId: string,
): Promise<MarketConversation> {
  const { data: existing, error: searchError } = await supabase
    .from('conversations')
    .select('*')
    .eq('type', 'MARKET_DM')
    .eq('player_id', playerId)
    .eq('team_id', teamId)
    .single();

  if (existing) return existing as MarketConversation;

  if (searchError && searchError.code === 'PGRST116') {
    const { data: newChat, error: createError } = await supabase
      .from('conversations')
      .insert({ type: 'MARKET_DM', player_id: playerId, team_id: teamId })
      .select()
      .single();

    if (createError) throw createError;
    return newChat as MarketConversation;
  }

  if (searchError) throw searchError;
  throw new Error('Error inesperado al buscar conversación');
}

/**
 * Retorna todas las conversaciones MARKET_DM del usuario autenticado.
 * Si es CAPITÁN/SUBCAPITÁN también incluye los chats de sus equipos.
 */
export async function fetchInbox(): Promise<MarketConversation[]> {
  const profileId = await getProfileId();

  const { data: managedTeams } = await supabase
    .from('team_members')
    .select('team_id')
    .eq('profile_id', profileId)
    .in('role', ['CAPITAN', 'SUBCAPITAN']);

  const teamIds = managedTeams ? managedTeams.map((t) => t.team_id) : [];

  let query = supabase
    .from('conversations')
    .select(`
      *,
      player:profiles!player_id(full_name, avatar_url),
      team:teams!team_id(name, shield_url)
    `)
    .eq('type', 'MARKET_DM')
    .order('created_at', { ascending: false });

  if (teamIds.length > 0) {
    query = query.or(`player_id.eq.${profileId},team_id.in.(${teamIds.join(',')})`);
  } else {
    query = query.eq('player_id', profileId);
  }

  const { data, error } = await query;
  if (error) throw error;

  return (data ?? []).map((c: any) => ({
    ...c,
    player: Array.isArray(c.player) ? c.player[0] : c.player,
    team: Array.isArray(c.team) ? c.team[0] : c.team,
  })) as MarketConversation[];
}

/**
 * Retorna los mensajes de una conversación, ordenados cronológicamente.
 */
export async function fetchMessages(conversationId: string): Promise<MarketMessage[]> {
  const { data, error } = await supabase
    .from('messages')
    .select('*')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true });

  if (error) throw error;
  return (data ?? []) as MarketMessage[];
}

/**
 * Envía un mensaje en una conversación.
 * senderTeamId se popula cuando el usuario actúa en nombre de un equipo.
 */
export async function sendMessage(
  conversationId: string,
  content: string,
  senderTeamId?: string,
): Promise<MarketMessage> {
  const profileId = await getProfileId();

  const { data, error } = await supabase
    .from('messages')
    .insert({
      conversation_id: conversationId,
      sender_profile_id: profileId,
      sender_team_id: senderTeamId || null,
      content,
    })
    .select()
    .single();

  if (error) throw error;
  return data as MarketMessage;
}

/**
 * Retorna el unique_code del próximo partido CONFIRMADO del equipo.
 * Se usa para enviar la invitación de "falta uno" desde el chat.
 */
export async function fetchConfirmedMatchForTeam(teamId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('matches')
    .select('unique_code')
    .or(`team_a_id.eq.${teamId},team_b_id.eq.${teamId}`)
    .eq('status', 'CONFIRMADO')
    .order('scheduled_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error || !data) return null;
  return data.unique_code ?? null;
}
