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
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppIcon } from '@/components/ui/AppIcon';
import { useAuth } from '@/context/AuthContext';
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
  // true cuando el usuario actúa como CAPITÁN/SUBCAPITÁN del equipo en esta conversación
  const [isCaptainMode, setIsCaptainMode] = useState(false);

  // Códigos reales obtenidos desde la BD
  const [teamInviteCode, setTeamInviteCode] = useState<string | null>(null);
  const [matchCode, setMatchCode] = useState<string | null>(null);
  const [isLoadingCodes, setIsLoadingCodes] = useState(false);

  useEffect(() => {
    if (!profile || !id) return;

    const loadConversation = async () => {
      try {
        const [msgs, inbox] = await Promise.all([
          fetchMessages(id),
          fetchInbox(),
        ]);
        setMessages(msgs);

        const currentChat = inbox.find((c: MarketConversation) => c.id === id);
        if (currentChat) {
          setChatData(currentChat);
          // Comparamos con profile.id (profiles.id), NO con auth user.id
          const actingAsCaptain = currentChat.player_id !== profile.id;
          setIsCaptainMode(actingAsCaptain);

          // Si actúa como capitán, pre-carga los códigos de invitación
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

    // Mensaje optimista
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
      // Revertir mensaje optimista en caso de error
      setMessages((prev) => prev.filter((m) => m.id !== tempMsg.id));
      console.error('Error sending message:', error);
    } finally {
      setIsSending(false);
    }
  };

  const handleInviteToTeam = () => {
    if (!teamInviteCode) return;
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
          className={`max-w-[75%] p-3 rounded-2xl border ${
            isMine
              ? 'bg-primary border-primary rounded-tr-sm'
              : 'bg-surface-container-high border-surface-container-highest rounded-tl-sm'
          } ${isTemp ? 'opacity-60' : ''}`}
        >
          <Text className={isMine ? 'text-on-primary' : 'text-on-surface'}>{item.content}</Text>
        </View>
      </View>
    );
  };

  const chatTitle = chatData
    ? isCaptainMode
      ? chatData.player?.full_name ?? 'Jugador'
      : chatData.team?.name ?? 'Equipo'
    : 'Cargando...';

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top']}>
      {/* Header */}
      <View className="px-6 py-4 flex-row items-center border-b border-surface-container-high bg-surface-base">
        <TouchableOpacity
          onPress={() => router.back()}
          className="mr-4"
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <AppIcon family="material-icons" name="arrow-back" size={24} color="#00E65B" />
        </TouchableOpacity>
        <Text className="text-on-surface font-displayBlack text-xl tracking-wider" numberOfLines={1}>
          {chatTitle}
        </Text>
      </View>

      {isLoading ? (
        <View className="flex-1 justify-center items-center">
          <ActivityIndicator size="large" color="#00E65B" />
        </View>
      ) : (
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
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
                <Text className="text-on-surface-variant font-uiMedium text-sm text-center">
                  Aún no hay mensajes.{'\n'}¡Rompé el hielo!
                </Text>
              </View>
            }
          />

          {/* Barra de acciones + input */}
          <View className="p-4 bg-surface-container-low border-t border-surface-container-high">
            {/* Botones de acción rápida para CAPITÁN/SUBCAPITÁN */}
            {isCaptainMode && (
              <View className="flex-row gap-2 mb-3">
                {isLoadingCodes ? (
                  <View className="flex-1 items-center py-2">
                    <ActivityIndicator size="small" color="#00E65B" />
                  </View>
                ) : (
                  <>
                    <TouchableOpacity
                      className={`flex-1 py-2 rounded-lg items-center border ${
                        teamInviteCode
                          ? 'bg-primary/10 border-primary/20'
                          : 'bg-surface-container-high border-transparent opacity-40'
                      }`}
                      onPress={handleInviteToTeam}
                      disabled={!teamInviteCode || isSending}
                      activeOpacity={0.7}
                    >
                      <Text
                        className={`text-xs font-uiBold ${teamInviteCode ? 'text-primary' : 'text-on-surface-variant'}`}
                      >
                        Invitar a Equipo
                      </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      className={`flex-1 py-2 rounded-lg items-center border ${
                        matchCode
                          ? 'bg-surface-container-high border-surface-container-highest'
                          : 'bg-surface-container-high border-transparent opacity-40'
                      }`}
                      onPress={handleInviteToMatch}
                      disabled={!matchCode || isSending}
                      activeOpacity={0.7}
                    >
                      <Text
                        className={`text-xs font-uiMedium ${matchCode ? 'text-on-surface' : 'text-on-surface-variant'}`}
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
                className="flex-1 bg-surface-container-highest text-on-surface p-4 rounded-full font-ui"
                placeholder="Escribe un mensaje..."
                placeholderTextColor="#88998D"
                value={inputText}
                onChangeText={setInputText}
                multiline
                maxLength={500}
              />
              <TouchableOpacity
                className={`w-12 h-12 rounded-full items-center justify-center ${
                  inputText.trim() && !isSending ? 'bg-primary' : 'bg-surface-container-high'
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
    </SafeAreaView>
  );
}
