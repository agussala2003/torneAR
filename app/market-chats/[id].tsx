import React, { useEffect, useState, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Modal,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Image } from 'expo-image';
import * as Clipboard from 'expo-clipboard';
import { AppIcon } from '@/components/ui/AppIcon';
import { useAuth } from '@/context/AuthContext';
import { getInitials } from '@/lib/market-utils';
import { getSupabaseStorageUrl } from '@/lib/supabase-storage';
import {
  fetchMessages,
  sendMessage,
  fetchInbox,
  fetchConfirmedMatchForTeam,
  markConversationAsRead,
  MarketMessage,
  MarketConversation,
} from '@/lib/chat-api';
import { fetchTeamInviteCode } from '@/lib/market-api';

export default function MarketChatScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { profile } = useAuth();
  const flatListRef = useRef<FlatList>(null);

  const [messages, setMessages] = useState<MarketMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);

  const [chatData, setChatData] = useState<MarketConversation | null>(null);
  const [isCaptainMode, setIsCaptainMode] = useState(false);

  const [teamInviteCode, setTeamInviteCode] = useState<string | null>(null);
  const [matchCode, setMatchCode] = useState<string | null>(null);
  const [isLoadingCodes, setIsLoadingCodes] = useState(false);
  const [showInviteConfirmModal, setShowInviteConfirmModal] = useState(false);

  useEffect(() => {
    if (!profile || !id) return;

    const loadConversation = async () => {
      try {
        // Fetch inbox first to get team_id for sender role enrichment
        const inbox = await fetchInbox();
        const currentChat = inbox.find((c: MarketConversation) => c.id === id);

        // Fetch messages with team_id (enables sender role lookup)
        const msgs = await fetchMessages(id, currentChat?.team_id);
        setMessages(msgs);

        // Mark as read — non-fatal
        try {
          await markConversationAsRead(id);
        } catch (e) {
          console.error('markConversationAsRead failed:', e);
        }

        if (currentChat) {
          setChatData(currentChat);
          const actingAsCaptain = currentChat.player_id !== profile.id;
          setIsCaptainMode(actingAsCaptain);

          if (actingAsCaptain) {
            setIsLoadingCodes(true);
            try {
              const [inviteCode, confirmedMatchCode] = await Promise.all([
                fetchTeamInviteCode(currentChat.team_id),
                fetchConfirmedMatchForTeam(currentChat.team_id),
              ]);
              setTeamInviteCode(inviteCode);
              setMatchCode(confirmedMatchCode);
            } finally {
              setIsLoadingCodes(false);
            }
          }
        }
      } catch (error) {
        console.error('Error fetching chat', error);
      } finally {
        setIsLoading(false);
      }
    };

    loadConversation();
  }, [profile, id]);

  const handleSend = async (
    content?: string,
    messageType: 'TEXT' | 'TEAM_INVITE' | 'MATCH_INVITE' = 'TEXT',
  ) => {
    const textToSend = content ?? inputText.trim();
    if (!textToSend || !profile || !id) return;

    const senderTeamId = isCaptainMode && chatData ? chatData.team_id : undefined;

    const tempMsg: MarketMessage = {
      id: `temp-${Date.now()}`,
      conversation_id: id,
      sender_profile_id: profile.id,
      sender_team_id: senderTeamId ?? null,
      content: textToSend,
      created_at: new Date().toISOString(),
      message_type: messageType,
      sender_full_name: profile.full_name ?? '',
      sender_role: null,
    };

    setMessages((prev) => [...prev, tempMsg]);
    if (!content) setInputText('');
    setIsSending(true);

    try {
      const realMsg = await sendMessage(id, textToSend, senderTeamId, messageType);
      setMessages((prev) => prev.map((m) => (m.id === tempMsg.id ? realMsg : m)));
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
    } catch (error) {
      setMessages((prev) => prev.filter((m) => m.id !== tempMsg.id));
      console.error('Error sending message:', error);
    } finally {
      setIsSending(false);
    }
  };

  const handleInviteToTeam = () => {
    if (!teamInviteCode) return;
    setShowInviteConfirmModal(true);
  };

  const confirmInviteToTeam = () => {
    setShowInviteConfirmModal(false);
    if (teamInviteCode) handleSend(teamInviteCode, 'TEAM_INVITE');
  };

  const handleInviteToMatch = () => {
    if (!matchCode) return;
    handleSend(matchCode, 'MATCH_INVITE');
  };

  function formatRole(role: 'CAPITAN' | 'SUBCAPITAN' | 'JUGADOR' | null): string {
    if (!role) return '';
    const map: Record<string, string> = {
      CAPITAN: 'Capitán',
      SUBCAPITAN: 'Subcapitán',
      JUGADOR: 'Jugador',
    };
    return map[role] ?? '';
  }

  function formatTime(iso: string): string {
    return new Date(iso).toLocaleTimeString('es-AR', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
  }

  const renderMessage = ({ item }: { item: MarketMessage }) => {
    const isMine = item.sender_profile_id === profile?.id;
    const isTemp = item.id.startsWith('temp-');
    const isSpecial = item.message_type === 'TEAM_INVITE' || item.message_type === 'MATCH_INVITE';

    const roleLabel = formatRole(item.sender_role);
    const senderLabel =
      item.sender_full_name && roleLabel
        ? `${item.sender_full_name} · ${roleLabel}`
        : item.sender_full_name;
    const time = formatTime(item.created_at);

    // Colors for code block adapt to bubble side
    const codeBlockBorder = isMine ? '#003914' : '#53E076';
    const codeText = isMine ? '#003914' : '#53E076';
    const copyBg = isMine ? 'rgba(0,57,20,0.2)' : 'rgba(83,224,118,0.12)';

    const inviteHeaderText =
      item.message_type === 'TEAM_INVITE'
        ? '¡Queremos que te unas a nuestro equipo!'
        : 'Te invitamos a jugar un partido con nosotros.';
    const codeLabel =
      item.message_type === 'TEAM_INVITE' ? '🛡️ Código de equipo' : '⚽ Código de partido';

    return (
      <View className={`mb-4 px-4 flex-row ${isMine ? 'justify-end' : 'justify-start'}`}>
        <View className="max-w-[80%]">
          {!isMine && senderLabel ? (
            <Text className="text-neutral-on-surface-variant font-ui text-[10px] mb-1 ml-1">
              {senderLabel}
            </Text>
          ) : null}
          <View
            className={`p-3 rounded-2xl border ${
              isMine
                ? 'bg-brand-primary border-brand-primary rounded-tr-sm'
                : 'bg-surface-high border-surface-variant rounded-tl-sm'
            } ${isTemp ? 'opacity-60' : ''}`}
          >
            {isSpecial ? (
              <>
                <Text
                  className={`${isMine ? 'text-[#003914]' : 'text-neutral-on-surface'} font-ui text-sm mb-2`}
                >
                  {inviteHeaderText}
                </Text>
                <View
                  style={{
                    borderWidth: 1,
                    borderColor: codeBlockBorder,
                    borderRadius: 10,
                    padding: 10,
                    backgroundColor: isMine
                      ? 'rgba(0,57,20,0.15)'
                      : 'rgba(83,224,118,0.07)',
                  }}
                >
                  <Text
                    style={{
                      color: codeText,
                      fontSize: 10,
                      textTransform: 'uppercase',
                      letterSpacing: 1,
                      marginBottom: 6,
                      opacity: 0.7,
                    }}
                  >
                    {codeLabel}
                  </Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Text
                      style={{
                        color: codeText,
                        fontSize: 20,
                        fontWeight: '900',
                        letterSpacing: 4,
                        flex: 1,
                      }}
                    >
                      {item.content}
                    </Text>
                    <TouchableOpacity
                      onPress={() => void Clipboard.setStringAsync(item.content)}
                      style={{
                        backgroundColor: copyBg,
                        borderWidth: 1,
                        borderColor: codeBlockBorder,
                        borderRadius: 6,
                        paddingHorizontal: 8,
                        paddingVertical: 4,
                      }}
                    >
                      <Text style={{ color: codeText, fontSize: 10, fontWeight: 'bold' }}>
                        COPIAR
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </>
            ) : (
              <Text className={`${isMine ? 'text-[#003914]' : 'text-neutral-on-surface'} font-ui text-sm`}>
                {item.content}
              </Text>
            )}
            <Text
              className={`${isMine ? 'text-[#003914]' : 'text-neutral-on-surface-variant'} font-ui text-[10px] text-right mt-1 opacity-60`}
            >
              {time}
            </Text>
          </View>
        </View>
      </View>
    );
  };

  const chatTitle = chatData
    ? isCaptainMode
      ? chatData.player?.full_name ?? 'Jugador'
      : chatData.team?.name ?? 'Equipo'
    : 'Cargando...';

  const resolveAvatarUrl = (path: string | null | undefined, bucket: 'avatars' | 'shields'): string | null => {
    if (!path) return null;
    if (path.startsWith('http')) return path;
    return getSupabaseStorageUrl(bucket, path);
  };

  const chatAvatarUrl = chatData
    ? isCaptainMode
      ? resolveAvatarUrl(chatData.player?.avatar_url, 'avatars')
      : resolveAvatarUrl(chatData.team?.shield_url, 'shields')
    : null;

  const chatSubtitle = isCaptainMode ? 'Jugador' : 'Equipo';

  return (
    <View className="flex-1 bg-surface-base">
      {/* Header */}
      <View className="px-6 pb-4 pt-10 flex-row items-center border-b border-surface-high bg-surface-base">
        <TouchableOpacity
          onPress={() => router.back()}
          className="mr-4"
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <AppIcon family="material-icons" name="arrow-back" size={24} color="#00E65B" />
        </TouchableOpacity>

        {chatData && (
          <>
            {chatAvatarUrl ? (
              <Image
                source={{ uri: chatAvatarUrl }}
                style={{ width: 38, height: 38, borderRadius: 19, borderWidth: 2, borderColor: '#53E076', marginRight: 10 }}
                contentFit="cover"
              />
            ) : (
              <View
                style={{ width: 38, height: 38, borderRadius: 19, borderWidth: 2, borderColor: '#53E076', backgroundColor: '#2A2A2A', alignItems: 'center', justifyContent: 'center', marginRight: 10 }}
              >
                <Text className="text-brand-primary font-uiBold text-sm">
                  {getInitials(chatTitle)}
                </Text>
              </View>
            )}
          </>
        )}

        <View className="flex-1">
          <Text
            className="text-neutral-on-surface font-displayBlack text-xl tracking-wider"
            numberOfLines={1}
          >
            {chatTitle}
          </Text>
          {chatData && (
            <Text className="text-neutral-on-surface-variant font-ui text-xs">
              {chatSubtitle}
            </Text>
          )}
        </View>
      </View>

      {isLoading ? (
        <View className="flex-1 justify-center items-center">
          <ActivityIndicator size="large" color="#00E65B" />
        </View>
      ) : (
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior="padding"
          keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
        >
          <FlatList
            ref={flatListRef}
            data={messages}
            renderItem={renderMessage}
            keyExtractor={(item) => item.id}
            contentContainerStyle={{ paddingVertical: 16 }}
            onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: false })}
            showsVerticalScrollIndicator={false}
            ListEmptyComponent={
              <View className="flex-1 items-center justify-center py-16">
                <Text className="text-neutral-on-surface-variant font-ui text-sm text-center">
                  Aún no hay mensajes.{'\n'}¡Rompé el hielo!
                </Text>
              </View>
            }
          />

          {/* Barra de acciones + input */}
          <View className="p-4 bg-surface-low border-t border-surface-high">
            {isCaptainMode && (
              <View className="flex-row gap-2 mb-3">
                {isLoadingCodes ? (
                  <View className="flex-1 items-center py-2">
                    <ActivityIndicator size="small" color="#00E65B" />
                  </View>
                ) : (
                  <>
                    <TouchableOpacity
                      className={`flex-1 py-2 rounded-lg items-center border ${teamInviteCode
                        ? 'bg-brand-primary/10 border-brand-primary/20'
                        : 'bg-surface-high border-transparent opacity-40'
                        }`}
                      onPress={handleInviteToTeam}
                      disabled={!teamInviteCode || isSending}
                      activeOpacity={0.7}
                    >
                      <Text
                        className={`text-xs font-uiBold ${teamInviteCode ? 'text-brand-primary' : 'text-neutral-on-surface-variant'}`}
                      >
                        Invitar a Equipo
                      </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      className={`flex-1 py-2 rounded-lg items-center border ${matchCode
                        ? 'bg-surface-high border-surface-variant'
                        : 'bg-surface-high border-transparent opacity-40'
                        }`}
                      onPress={handleInviteToMatch}
                      disabled={!matchCode || isSending}
                      activeOpacity={0.7}
                    >
                      <Text
                        className={`text-xs font-ui ${matchCode ? 'text-neutral-on-surface' : 'text-neutral-on-surface-variant'}`}
                      >
                        {matchCode ? 'Invitar a Partido' : 'Sin partido confirmado'}
                      </Text>
                    </TouchableOpacity>
                  </>
                )}
              </View>
            )}

            {/* Input de mensaje */}
            <View className="flex-row items-center gap-2">
              <TextInput
                className="flex-1 bg-surface-high text-neutral-on-surface p-4 rounded-full font-ui"
                placeholder="Escribe un mensaje..."
                placeholderTextColor="#88998D"
                value={inputText}
                onChangeText={setInputText}
                multiline
                maxLength={500}
              />
              <TouchableOpacity
                className={`w-12 h-12 rounded-full items-center justify-center ${inputText.trim() && !isSending ? 'bg-brand-primary' : 'bg-surface-high'
                  }`}
                onPress={() => handleSend()}
                disabled={!inputText.trim() || isSending}
                activeOpacity={0.8}
              >
                {isSending ? (
                  <ActivityIndicator size="small" color="#00E65B" />
                ) : (
                  <AppIcon
                    family="material-icons"
                    name="send"
                    size={24}
                    color={inputText.trim() ? '#003914' : '#88998D'}
                  />
                )}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      )}
      <Modal
        visible={showInviteConfirmModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowInviteConfirmModal(false)}
      >
        <View className="flex-1 bg-black/65 items-center justify-center px-6">
          <View className="w-full rounded-2xl border border-surface-high bg-surface-container p-5">
            <Text className="text-neutral-on-surface font-displayBlack text-lg mb-2">
              Invitar a tu equipo
            </Text>
            <Text className="text-neutral-on-surface-variant font-ui text-sm mb-5">
              ¿Confirmás que querés invitar a este jugador? Se le va a enviar el código de invitación.
            </Text>
            <View className="flex-row gap-3">
              <TouchableOpacity
                onPress={() => setShowInviteConfirmModal(false)}
                activeOpacity={0.8}
                className="flex-1 py-3 rounded-xl bg-surface-high items-center"
              >
                <Text className="text-neutral-on-surface font-uiBold">Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={confirmInviteToTeam}
                activeOpacity={0.8}
                className="flex-1 py-3 rounded-xl bg-brand-primary items-center"
              >
                <Text className="font-uiBold" style={{ color: '#003914' }}>Sí, invitar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}
