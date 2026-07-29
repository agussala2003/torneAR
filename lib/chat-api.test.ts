import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createQueryBuilder } from './test-utils/supabase-mock';
import {
  getOrCreateMarketChat,
  fetchInbox,
  fetchMessages,
  markConversationAsRead,
  fetchUnreadChatCount,
  sendMessage,
  fetchConfirmedMatchForTeam,
} from './chat-api';

const { supabaseMock } = vi.hoisted(() => ({
  supabaseMock: {
    from: vi.fn(),
    rpc: vi.fn(),
    auth: { getUser: vi.fn() },
  },
}));

vi.mock('@/lib/supabase', () => ({
  supabase: supabaseMock,
}));

const AUTH_USER = { id: 'auth-1' };
const PROFILE = { id: 'profile-1' };

beforeEach(() => {
  vi.clearAllMocks();
  supabaseMock.auth.getUser.mockResolvedValue({ data: { user: AUTH_USER }, error: null });
});

describe('getOrCreateMarketChat', () => {
  it('devuelve la conversación existente si ya hay una MARKET_DM entre el jugador y el equipo', async () => {
    const existingChat = { id: 'conv-1', type: 'MARKET_DM', player_id: 'player-1', team_id: 'team-1' };
    const searchBuilder = createQueryBuilder({ data: existingChat, error: null });
    supabaseMock.from.mockReturnValueOnce(searchBuilder);

    const result = await getOrCreateMarketChat('player-1', 'team-1');

    expect(searchBuilder.eq).toHaveBeenCalledWith('type', 'MARKET_DM');
    expect(searchBuilder.eq).toHaveBeenCalledWith('player_id', 'player-1');
    expect(searchBuilder.eq).toHaveBeenCalledWith('team_id', 'team-1');
    expect(result).toEqual(existingChat);
    expect(supabaseMock.from).toHaveBeenCalledTimes(1); // no crea una nueva
  });

  it('crea una conversación nueva cuando PGRST116 (no encontrada)', async () => {
    const newChat = { id: 'conv-2', type: 'MARKET_DM', player_id: 'player-1', team_id: 'team-1' };
    const searchBuilder = createQueryBuilder({ data: null, error: { code: 'PGRST116' } });
    const insertBuilder = createQueryBuilder({ data: newChat, error: null });
    supabaseMock.from.mockReturnValueOnce(searchBuilder).mockReturnValueOnce(insertBuilder);

    const result = await getOrCreateMarketChat('player-1', 'team-1');

    expect(insertBuilder.insert).toHaveBeenCalledWith({
      type: 'MARKET_DM',
      player_id: 'player-1',
      team_id: 'team-1',
    });
    expect(result).toEqual(newChat);
  });

  it('propaga cualquier otro error de búsqueda', async () => {
    supabaseMock.from.mockReturnValueOnce(
      createQueryBuilder({ data: null, error: { code: 'OTHER', message: 'db error' } }),
    );
    await expect(getOrCreateMarketChat('player-1', 'team-1')).rejects.toBeTruthy();
  });
});

describe('fetchInbox', () => {
  it('mapea las filas del RPC y calcula unread correctamente', async () => {
    supabaseMock.rpc.mockResolvedValueOnce({
      data: [
        {
          id: 'conv-1',
          type: 'MARKET_DM',
          player_id: 'profile-1',
          team_id: 'team-1',
          created_at: '2026-07-01T00:00:00Z',
          player_full_name: null,
          team_name: 'Equipo A',
          team_shield: 'team-1/shield.png',
          last_msg_content: 'Hola',
          last_msg_at: '2026-07-02T00:00:00Z',
          last_msg_sender: 'other-profile',
          last_read_at: null,
        },
      ],
      error: null,
    });
    supabaseMock.from.mockReturnValueOnce(createQueryBuilder({ data: PROFILE, error: null }));

    const result = await fetchInbox();

    expect(supabaseMock.rpc).toHaveBeenCalledWith('get_market_inbox', { p_profile_id: PROFILE.id });
    expect(result[0]).toMatchObject({
      id: 'conv-1',
      team: { name: 'Equipo A', shield_url: 'team-1/shield.png' },
      player: undefined,
      unread: true, // last_read_at null y el remitente no soy yo
    });
  });
});

describe('fetchMessages', () => {
  it('enriquece los mensajes con nombre y rol del remitente usando team_members', async () => {
    const rolesBuilder = createQueryBuilder({
      data: [{ profile_id: 'p1', role: 'CAPITAN' }],
      error: null,
    });
    const messagesBuilder = createQueryBuilder({
      data: [
        {
          id: 'm1',
          conversation_id: 'conv-1',
          sender_profile_id: 'p1',
          sender_team_id: 'team-1',
          content: 'Hola',
          created_at: '2026-07-01T00:00:00Z',
          message_type: 'TEXT',
          sender_profile: { full_name: 'Juan' },
        },
      ],
      error: null,
    });
    supabaseMock.from.mockReturnValueOnce(rolesBuilder).mockReturnValueOnce(messagesBuilder);

    const result = await fetchMessages('conv-1', 'team-1');

    expect(result[0]).toMatchObject({
      sender_full_name: 'Juan',
      sender_role: 'CAPITAN',
      message_type: 'TEXT',
    });
  });

  it('no busca roles si no se pasa teamId, y usa TEXT como default de message_type', async () => {
    const messagesBuilder = createQueryBuilder({
      data: [
        {
          id: 'm1',
          conversation_id: 'conv-1',
          sender_profile_id: 'p1',
          sender_team_id: null,
          content: 'Hola',
          created_at: '2026-07-01T00:00:00Z',
          message_type: null,
          sender_profile: null,
        },
      ],
      error: null,
    });
    supabaseMock.from.mockReturnValueOnce(messagesBuilder);

    const result = await fetchMessages('conv-1');

    expect(supabaseMock.from).toHaveBeenCalledTimes(1);
    expect(result[0].message_type).toBe('TEXT');
    expect(result[0].sender_full_name).toBe('Desconocido');
  });
});

describe('markConversationAsRead', () => {
  it('hace upsert con onConflict profile_id,conversation_id', async () => {
    const profileBuilder = createQueryBuilder({ data: PROFILE, error: null });
    const upsertBuilder = createQueryBuilder({ data: null, error: null });
    supabaseMock.from.mockReturnValueOnce(profileBuilder).mockReturnValueOnce(upsertBuilder);

    await markConversationAsRead('conv-1');

    expect(upsertBuilder.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ profile_id: PROFILE.id, conversation_id: 'conv-1' }),
      { onConflict: 'profile_id,conversation_id' },
    );
  });
});

describe('fetchUnreadChatCount', () => {
  it('llama al RPC con el profile_id resuelto y devuelve el número', async () => {
    supabaseMock.from.mockReturnValueOnce(createQueryBuilder({ data: PROFILE, error: null }));
    supabaseMock.rpc.mockResolvedValueOnce({ data: 3, error: null });

    const result = await fetchUnreadChatCount();

    expect(supabaseMock.rpc).toHaveBeenCalledWith('get_unread_market_chat_count', {
      p_profile_id: PROFILE.id,
    });
    expect(result).toBe(3);
  });

  it('devuelve 0 cuando data es null', async () => {
    supabaseMock.from.mockReturnValueOnce(createQueryBuilder({ data: PROFILE, error: null }));
    supabaseMock.rpc.mockResolvedValueOnce({ data: null, error: null });
    expect(await fetchUnreadChatCount()).toBe(0);
  });
});

describe('sendMessage', () => {
  it('inserta el mensaje con sender_team_id null cuando no se pasa equipo', async () => {
    const profileBuilder = createQueryBuilder({ data: PROFILE, error: null });
    const insertBuilder = createQueryBuilder({
      data: {
        id: 'm1',
        conversation_id: 'conv-1',
        sender_profile_id: PROFILE.id,
        sender_team_id: null,
        content: 'Hola',
        created_at: '2026-07-01T00:00:00Z',
        message_type: 'TEXT',
        sender_profile: { full_name: 'Juan' },
      },
      error: null,
    });
    supabaseMock.from.mockReturnValueOnce(profileBuilder).mockReturnValueOnce(insertBuilder);

    const result = await sendMessage('conv-1', 'Hola');

    expect(insertBuilder.insert).toHaveBeenCalledWith({
      conversation_id: 'conv-1',
      sender_profile_id: PROFILE.id,
      sender_team_id: null,
      content: 'Hola',
      message_type: 'TEXT',
    });
    expect(result.sender_full_name).toBe('Juan');
  });

  it('manda el messageType TEAM_INVITE/MATCH_INVITE cuando se especifica', async () => {
    const profileBuilder = createQueryBuilder({ data: PROFILE, error: null });
    const insertBuilder = createQueryBuilder({
      data: {
        id: 'm2',
        conversation_id: 'conv-1',
        sender_profile_id: PROFILE.id,
        sender_team_id: 'team-1',
        content: 'ABC123',
        created_at: '2026-07-01T00:00:00Z',
        message_type: 'TEAM_INVITE',
        sender_profile: { full_name: 'Juan' },
      },
      error: null,
    });
    supabaseMock.from.mockReturnValueOnce(profileBuilder).mockReturnValueOnce(insertBuilder);

    await sendMessage('conv-1', 'ABC123', 'team-1', 'TEAM_INVITE');

    expect(insertBuilder.insert).toHaveBeenCalledWith({
      conversation_id: 'conv-1',
      sender_profile_id: PROFILE.id,
      sender_team_id: 'team-1',
      content: 'ABC123',
      message_type: 'TEAM_INVITE',
    });
  });
});

describe('fetchConfirmedMatchForTeam', () => {
  it('devuelve el unique_code del próximo partido confirmado', async () => {
    supabaseMock.from.mockReturnValueOnce(
      createQueryBuilder({ data: { unique_code: 'XYZ789' }, error: null }),
    );
    expect(await fetchConfirmedMatchForTeam('team-1')).toBe('XYZ789');
  });

  it('devuelve null si no hay partido confirmado (sin lanzar)', async () => {
    supabaseMock.from.mockReturnValueOnce(
      createQueryBuilder({ data: null, error: { message: 'no rows' } }),
    );
    expect(await fetchConfirmedMatchForTeam('team-1')).toBeNull();
  });
});
