import { supabase } from './supabase';
import { computeUnread, deriveRole } from './chat-utils';

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
  message_type: 'TEXT' | 'TEAM_INVITE' | 'MATCH_INVITE';
  sender_full_name: string;
  sender_role: 'CAPITAN' | 'SUBCAPITAN' | 'JUGADOR' | null;
}

// (private — not exported)
interface RawMessageRow {
  id: string;
  conversation_id: string;
  sender_profile_id: string;
  sender_team_id: string | null;
  content: string;
  created_at: string;
  message_type: string;
  sender_profile: { full_name: string } | null;
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

  const { data, error } = await supabase.rpc('get_market_inbox', { p_profile_id: profileId });
  if (error) throw error;

  return (data ?? []).map((row) => ({
    id: row.id,
    type: row.type,
    player_id: row.player_id,
    team_id: row.team_id,
    created_at: row.created_at,
    player: row.player_full_name
      ? { full_name: row.player_full_name, avatar_url: row.player_avatar ?? null }
      : undefined,
    team: row.team_name
      ? { name: row.team_name, shield_url: row.team_shield ?? null }
      : undefined,
    last_msg_content: row.last_msg_content ?? null,
    last_msg_at: row.last_msg_at ?? null,
    last_msg_sender: row.last_msg_sender ?? null,
    last_read_at: row.last_read_at ?? null,
    unread: computeUnread(
      row.last_msg_at,
      row.last_msg_sender,
      row.last_read_at,
      profileId,
    ),
  }));
}

/**
 * Retorna los mensajes de una conversación enriquecidos con nombre y rol del remitente.
 * teamId es el equipo de la conversación — se usa para resolver el rol de miembros del equipo.
 */
export async function fetchMessages(
  conversationId: string,
  teamId?: string,
): Promise<MarketMessage[]> {
  // Build role map from team_members if teamId provided
  const roleMap: Record<string, string> = {};
  if (teamId) {
    const { data: members } = await supabase
      .from('team_members')
      .select('profile_id, role')
      .eq('team_id', teamId);
    for (const m of (members ?? [])) {
      roleMap[(m as { profile_id: string; role: string }).profile_id] =
        (m as { profile_id: string; role: string }).role;
    }
  }

  const { data, error } = await supabase
    .from('messages')
    .select('*, sender_profile:profiles!sender_profile_id(full_name)')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true });

  if (error) throw error;

  return ((data ?? []) as unknown as RawMessageRow[]).map((row) => ({
    id: row.id,
    conversation_id: row.conversation_id,
    sender_profile_id: row.sender_profile_id,
    sender_team_id: row.sender_team_id,
    content: row.content,
    created_at: row.created_at,
    message_type: (row.message_type ?? 'TEXT') as 'TEXT' | 'TEAM_INVITE' | 'MATCH_INVITE',
    sender_full_name: row.sender_profile?.full_name ?? 'Desconocido',
    sender_role: deriveRole(row.sender_team_id, row.sender_profile_id, roleMap),
  }));
}


export async function markConversationAsRead(conversationId: string): Promise<void> {
  const profileId = await getProfileId();

  const { error } = await supabase
    .from('conversation_reads')
    .upsert(
      { profile_id: profileId, conversation_id: conversationId, last_read_at: new Date().toISOString() },
      { onConflict: 'profile_id,conversation_id' }
    );

  if (error) throw error;
}

export async function fetchUnreadChatCount(): Promise<number> {
  const profileId = await getProfileId();

  const { data, error } = await supabase.rpc('get_unread_market_chat_count', {
    p_profile_id: profileId,
  });

  if (error) throw error;
  return data ?? 0;
}

/**
 * Envía un mensaje en una conversación.
 * senderTeamId se popula cuando el usuario actúa en nombre de un equipo.
 * messageType distingue mensajes de texto de burbujas especiales de código.
 */
export async function sendMessage(
  conversationId: string,
  content: string,
  senderTeamId?: string,
  messageType: 'TEXT' | 'TEAM_INVITE' | 'MATCH_INVITE' = 'TEXT',
): Promise<MarketMessage> {
  const profileId = await getProfileId();

  const { data, error } = await supabase
    .from('messages')
    .insert({
      conversation_id: conversationId,
      sender_profile_id: profileId,
      sender_team_id: senderTeamId || null,
      content,
      message_type: messageType,
    })
    .select('*, sender_profile:profiles!sender_profile_id(full_name)')
    .single();

  if (error) throw error;

  const row = data as unknown as RawMessageRow;
  return {
    id: row.id,
    conversation_id: row.conversation_id,
    sender_profile_id: row.sender_profile_id,
    sender_team_id: row.sender_team_id,
    content: row.content,
    created_at: row.created_at,
    message_type: (row.message_type ?? 'TEXT') as 'TEXT' | 'TEAM_INVITE' | 'MATCH_INVITE',
    sender_full_name: row.sender_profile?.full_name ?? 'Desconocido',
    sender_role: null, // role not critical for optimistic update; replaced by next fetchMessages
  };
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
