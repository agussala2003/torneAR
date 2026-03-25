import { supabase } from './supabase';
import { computeUnread } from './chat-utils';

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
  last_msg_content: string | null;
  last_msg_at: string | null;
  last_msg_sender: string | null;
  last_read_at: string | null;
  unread: boolean;
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

  if (existing) return existing as unknown as MarketConversation;

  if (searchError && searchError.code === 'PGRST116') {
    const { data: newChat, error: createError } = await supabase
      .from('conversations')
      .insert({ type: 'MARKET_DM', player_id: playerId, team_id: teamId })
      .select()
      .single();

    if (createError) throw createError;
    return newChat as unknown as MarketConversation;
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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any).rpc('get_market_inbox', { p_profile_id: profileId });
  if (error) throw error;

  return ((data ?? []) as Record<string, unknown>[]).map((row: Record<string, unknown>) => ({
    id: row.id as string,
    type: row.type as string,
    player_id: row.player_id as string,
    team_id: row.team_id as string,
    created_at: row.created_at as string,
    player: row.player_full_name
      ? { full_name: row.player_full_name as string, avatar_url: (row.player_avatar as string | null) ?? null }
      : undefined,
    team: row.team_name
      ? { name: row.team_name as string, shield_url: (row.team_shield as string | null) ?? null }
      : undefined,
    last_msg_content: (row.last_msg_content as string | null) ?? null,
    last_msg_at: (row.last_msg_at as string | null) ?? null,
    last_msg_sender: (row.last_msg_sender as string | null) ?? null,
    last_read_at: (row.last_read_at as string | null) ?? null,
    unread: computeUnread(
      row.last_msg_at as string | null,
      row.last_msg_sender as string | null,
      row.last_read_at as string | null,
      profileId,
    ),
  }));
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


export async function markConversationAsRead(conversationId: string): Promise<void> {
  const profileId = await getProfileId();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any)
    .from('conversation_reads')
    .upsert(
      { profile_id: profileId, conversation_id: conversationId, last_read_at: new Date().toISOString() },
      { onConflict: 'profile_id,conversation_id' }
    );

  if (error) throw error;
}

export async function fetchUnreadChatCount(): Promise<number> {
  const profileId = await getProfileId();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any).rpc('get_unread_market_chat_count', {
    p_profile_id: profileId,
  });

  if (error) throw error;
  return (data as number) ?? 0;
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
