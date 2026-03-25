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
import { AppIcon } from '@/components/ui/AppIcon';
import { useAuth } from '@/context/AuthContext';
import { getInitials } from '@/lib/market-utils';
import { getSupabaseStorageUrl } from '@/lib/supabase-storage';
import {
  fetchMessages,
  sendMessage,
  fetchInbox,
  fetchConfirmedMatchForTeam,
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
        const [msgs, inbox] = await Promise.all([fetchMessages(id), fetchInbox()]);
        setMessages(msgs);

        const currentChat = inbox.find((c: MarketConversation) => c.id === id);
        if (currentChat) {
          setChatData(currentChat);
          const actingAsCaptain = currentChat.player_id !== profile.id;
          setIsCaptainMode(actingAsCaptain);

          if (actingAsCaptain) {
            setIsLoadingCodes(true);
            const [inviteCode, confirmedMatchCode] = await Promise.all([
              fetchTeamInviteCode(currentChat.team_id),
              fetchConfirmedMatchForTeam(currentChat.team_id),
            ]);
            setTeamInviteCode(inviteCode);
            setMatchCode(confirmedMatchCode);
            setIsLoadingCodes(false);
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

  const handleSend = async (content?: string) => {
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
    };

    setMessages((prev) => [...prev, tempMsg]);
    if (!content) setInputText('');
    setIsSending(true);

    try {
      const realMsg = await sendMessage(id, textToSend, senderTeamId);
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
    handleSend(
      `¡Queremos que te unas a nuestro equipo! Ingresá este código en la sección "Unirse a Equipo": ${teamInviteCode}`,
    );
  };

  const handleInviteToMatch = () => {
    if (!matchCode) return;
    handleSend(
      `Te invitamos a jugar un partido con nosotros. Usá este código para sumarte: ${matchCode}`,
    );
  };

  const renderMessage = ({ item }: { item: MarketMessage }) => {
    const isMine = item.sender_profile_id === profile?.id;
    const isTemp = item.id.startsWith('temp-');

    return (
      <View className={`mb-4 px-4 flex-row ${isMine ? 'justify-end' : 'justify-start'}`}>
        <View
          className={`max-w-[75%] p-3 rounded-2xl border ${isMine
            ? 'bg-brand-primary border-brand-primary rounded-tr-sm'
            : 'bg-surface-high border-surface-variant rounded-tl-sm'
            } ${isTemp ? 'opacity-60' : ''}`}
        >
          <Text className={isMine ? 'text-[#003914]' : 'text-neutral-on-surface'}>
            {item.content}
          </Text>
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
