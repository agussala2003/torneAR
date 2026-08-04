import { useCallback, useEffect, useRef, useState } from 'react';
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
import { AppIcon } from '@/components/ui/AppIcon';
import { EmptyState } from '@/components/ui/EmptyState';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';
import { Logger } from '@/lib/logger';
import { useKeyboardAwareBottomInset } from '@/hooks/useKeyboardAwareBottomInset';
import { fetchMessages, sendMessage, markConversationAsRead } from '@/lib/chat-api';
import type { MarketMessage } from '@/lib/chat-api';

interface MatchChatHeader {
  teamAName: string;
  teamBName: string;
  uniqueCode: string;
  myTeamId: string;
  matchId: string;
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('es-AR', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

export default function MatchChatScreen() {
  const { conversationId, myTeamId: paramTeamId } = useLocalSearchParams<{
    conversationId: string;
    myTeamId?: string;
  }>();
  const router = useRouter();
  const { profile } = useAuth();
  const flatListRef = useRef<FlatList>(null);
  const inputBottomInset = useKeyboardAwareBottomInset();

  const [header, setHeader] = useState<MatchChatHeader | null>(null);
  const [messages, setMessages] = useState<MarketMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [loadingInit, setLoadingInit] = useState(true);
  const [isSending, setIsSending] = useState(false);
  // Si `init` falla, la pantalla quedaba con el header vacio y una lista sin
  // mensajes: indistinguible de un chat legitimamente vacio. Ahora el fallo es
  // explicito y reintentable.
  const [loadError, setLoadError] = useState(false);
  const [retryToken, setRetryToken] = useState(0);

  // Derive effective myTeamId (from param or from match membership)
  const [myTeamId, setMyTeamId] = useState<string>(paramTeamId ?? '');

  useEffect(() => {
    if (!conversationId || !profile) return;

    const init = async () => {
      setLoadingInit(true);
      setLoadError(false);
      try {
        // 1. Fetch conversation to get match_id
        const { data: conv, error: convErr } = await supabase
          .from('conversations')
          .select('match_id')
          .eq('id', conversationId)
          .single();
        if (convErr || !conv?.match_id) throw convErr ?? new Error('Conversación no encontrada');

        const matchId = conv.match_id as string;

        // 2. Fetch match with team names
        const { data: match, error: matchErr } = await supabase
          .from('matches')
          .select('team_a_id, team_b_id, unique_code, team_a:teams!team_a_id(name), team_b:teams!team_b_id(name)')
          .eq('id', matchId)
          .single();
        if (matchErr || !match) throw matchErr ?? new Error('Partido no encontrado');

        const raw = match as unknown as {
          team_a_id: string;
          team_b_id: string;
          unique_code: string;
          team_a: { name: string };
          team_b: { name: string };
        };

        // 3. Determine myTeamId if not passed as param
        let resolvedTeamId = paramTeamId ?? '';
        if (!resolvedTeamId) {
          const { data: membership } = await supabase
            .from('team_members')
            .select('team_id')
            .in('team_id', [raw.team_a_id, raw.team_b_id])
            .eq('profile_id', profile.id)
            .limit(1)
            .maybeSingle();
          resolvedTeamId = (membership?.team_id as string) ?? raw.team_a_id;
        }
        setMyTeamId(resolvedTeamId);

        setHeader({
          teamAName: raw.team_a.name,
          teamBName: raw.team_b.name,
          uniqueCode: raw.unique_code,
          myTeamId: resolvedTeamId,
          matchId,
        });

        // 4. Load messages
        const msgs = await fetchMessages(conversationId, resolvedTeamId);
        setMessages(msgs);

        // 5. Mark as read
        try {
          await markConversationAsRead(conversationId);
        } catch (readError) {
          // No fatal para esta pantalla, pero deja el badge de no leídos
          // inflado para siempre en la lista de conversaciones.
          Logger.warn('No se pudo marcar la conversación como leída', {
            scope: 'chat',
            conversationId,
            error: readError,
          });
        }
      } catch (err) {
        Logger.error('No se pudo cargar el chat del partido', {
          scope: 'chat',
          conversationId,
          error: err,
        });
        setLoadError(true);
      } finally {
        setLoadingInit(false);
      }
    };

    void init();

    // Real-time subscription
    const channel = supabase
      .channel(`match_chat_${conversationId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `conversation_id=eq.${conversationId}` },
        (payload) => {
          const msg = payload.new as MarketMessage;
          if (msg.sender_profile_id !== profile.id) {
            setMessages((prev) => [...prev, msg]);
            markConversationAsRead(conversationId).catch((readError: unknown) => {
              Logger.warn('No se pudo marcar como leído el mensaje entrante', {
                scope: 'chat.realtime',
                conversationId,
                error: readError,
              });
            });
            setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
          }
        },
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [conversationId, profile, paramTeamId, retryToken]);

  const handleSend = async () => {
    const text = inputText.trim();
    if (!text || !profile || !conversationId) return;

    const tempMsg: MarketMessage = {
      id: `temp-${Date.now()}`,
      conversation_id: conversationId,
      sender_profile_id: profile.id,
      sender_team_id: myTeamId || null,
      content: text,
      created_at: new Date().toISOString(),
      message_type: 'TEXT',
      sender_full_name: profile.full_name ?? '',
      sender_role: null,
    };

    setMessages((prev) => [...prev, tempMsg]);
    setInputText('');
    setIsSending(true);

    try {
      const realMsg = await sendMessage(conversationId, text, myTeamId || undefined);
      Logger.info('Mensaje enviado en el chat del partido', {
        scope: 'chat.handleSend',
        conversationId,
        messageId: realMsg.id,
        senderTeamId: myTeamId || null,
      });
      setMessages((prev) => prev.map((m) => (m.id === tempMsg.id ? realMsg : m)));
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
    } catch (err) {
      // El mensaje optimista desaparece de la lista sin ningún aviso: desde el
      // lado del usuario, lo que escribió simplemente se esfumó.
      Logger.error('No se pudo enviar el mensaje del chat de partido', {
        scope: 'chat.handleSend',
        conversationId,
        error: err,
      });
      setMessages((prev) => prev.filter((m) => m.id !== tempMsg.id));
    } finally {
      setIsSending(false);
    }
  };

  const renderMessage = useCallback(({ item }: { item: MarketMessage }) => {
    const isMine = item.sender_profile_id === profile?.id;
    const isTemp = item.id.startsWith('temp-');

    // Show which team sent the message
    const senderLabel = isMine
      ? null
      : item.sender_full_name
        ? item.sender_full_name
        : 'Rival';

    return (
      <View className={`mb-3 px-4 flex-row ${isMine ? 'justify-end' : 'justify-start'}`}>
        <View className="max-w-[80%]">
          {!isMine && senderLabel && (
            <Text className="font-ui text-[10px] text-neutral-on-surface-variant mb-1 ml-1">
              {senderLabel}
            </Text>
          )}
          <View
            className={`rounded-2xl px-3 py-2.5 ${
              isMine
                ? 'bg-brand-primary rounded-tr-sm'
                : 'bg-surface-high rounded-tl-sm'
            } ${isTemp ? 'opacity-60' : ''}`}
          >
            <Text
              className={`font-ui text-sm ${isMine ? 'text-[#003914]' : 'text-neutral-on-surface'}`}
            >
              {item.content}
            </Text>
            <Text
              className={`font-ui text-[10px] text-right mt-1 opacity-60 ${
                isMine ? 'text-[#003914]' : 'text-neutral-on-surface-variant'
              }`}
            >
              {formatTime(item.created_at)}
            </Text>
          </View>
        </View>
      </View>
    );
  }, [profile]);

  const headerTitle = header
    ? `${header.teamAName} vs ${header.teamBName}`
    : 'Chat del partido';

  return (
    <View className="flex-1 bg-surface-base">
      {/* Header */}
      <View className="flex-row items-center gap-3 border-b border-surface-high px-4 pb-3 pt-14">
        <TouchableOpacity onPress={() => router.back()} activeOpacity={0.7} className="p-1">
          <AppIcon family="material-community" name="arrow-left" size={24} color="#E5E2E1" />
        </TouchableOpacity>
        <View className="flex-1">
          <Text className="font-uiBold text-base text-neutral-on-surface" numberOfLines={1}>
            {headerTitle}
          </Text>
          {header && (
            <Text className="font-ui text-[10px] uppercase tracking-widest text-neutral-outline">
              Código: {header.uniqueCode}
            </Text>
          )}
        </View>
        <AppIcon family="material-community" name="soccer" size={20} color="#53E076" />
      </View>

      {loadingInit ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#53E076" />
        </View>
      ) : loadError ? (
        <View className="flex-1 items-center justify-center px-6">
          <EmptyState
            icon="wifi-off"
            title="No se pudo cargar el chat"
            description="Revisá tu conexión e intentá de nuevo. Si el problema sigue, salí y volvé a entrar al partido."
            actionLabel="Reintentar"
            onAction={() => setRetryToken((token) => token + 1)}
          />
        </View>
      ) : (
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          /* `padding` también en Android: la app corre edge-to-edge (app.json →
             android.edgeToEdgeEnabled) y en ese modo la ventana ya no se
             redimensiona sola con el teclado, aunque el manifest declare
             `adjustResize`. Sin el KAV empujando, el input queda tapado. */
          behavior="padding"
          /* 0 en Android: el header es una View de esta misma pantalla y el KAV
             arranca por debajo, así que mide su propia posición y no necesita
             compensación extra. */
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
              <View className="items-center justify-center py-16 px-6">
                <AppIcon family="material-community" name="chat-outline" size={40} color="#869585" />
                <Text className="font-ui mt-3 text-center text-sm text-neutral-on-surface-variant">
                  Aún no hay mensajes.{'\n'}¡Coordiná los detalles del partido acá!
                </Text>
              </View>
            }
          />

          {/* Input bar. El padding inferior sale del hook y no de una constante:
              con `p-4` la barra quedaba pegada al borde en los teléfonos con
              gesture bar. */}
          <View
            className="flex-row items-center gap-2 border-t border-surface-high bg-surface-low px-4 pt-4"
            style={{ paddingBottom: inputBottomInset }}
          >
            <TextInput
              className="flex-1 rounded-full bg-surface-high px-4 py-3 font-ui text-sm text-neutral-on-surface"
              placeholder="Escribí un mensaje..."
              placeholderTextColor="#869585"
              value={inputText}
              onChangeText={setInputText}
              multiline
              maxLength={500}
            />
            <TouchableOpacity
              onPress={() => void handleSend()}
              disabled={!inputText.trim() || isSending}
              activeOpacity={0.8}
              className={`h-11 w-11 items-center justify-center rounded-full ${
                inputText.trim() && !isSending ? 'bg-brand-primary' : 'bg-surface-high'
              }`}
            >
              {isSending ? (
                <ActivityIndicator size="small" color="#53E076" />
              ) : (
                <AppIcon
                  family="material-community"
                  name="send"
                  size={20}
                  color={inputText.trim() ? '#003914' : '#869585'}
                />
              )}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      )}
    </View>
  );
}
