import { useCallback, useEffect, useState } from 'react';
import { router } from 'expo-router';
import { AppIcon } from './ui/AppIcon';
import { Text, TouchableOpacity, View } from 'react-native';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';
import { useTeamStore } from '@/stores/teamStore';
import { ActiveTeamSelector } from './ui/ActiveTeamSelector';
import { fetchUnreadChatCount } from '@/lib/chat-api';
import { fetchChallengesInbox } from '@/lib/challenge-actions'; // NUEVO
import { Logger } from '@/lib/logger';

type GlobalHeaderProps = {
  onNotificationPress?: () => void;
  notificationCount?: number;
  isMarketTab?: boolean;
  isRankingTab?: boolean; // NUEVO
};

export function GlobalHeader({ onNotificationPress, notificationCount, isMarketTab, isRankingTab }: GlobalHeaderProps) {
  const { profile } = useAuth();
  // Selector puntual: el header solo necesita el equipo activo para el badge de
  // desafios. Suscribirse al store entero lo re-renderizaba ante cualquier cambio.
  // La carga de `myTeams` vive en app/(tabs)/_layout.tsx — no aca: GlobalHeader se
  // monta en las 5 tabs y disparaba un fetch por tab, y cada uno reemplazaba
  // `myTeams` por un array nuevo, invalidando los useCallback que lo tenian en deps.
  const activeTeamId = useTeamStore((state) => state.activeTeamId);
  const [internalNotificationCount, setInternalNotificationCount] = useState(0);
  const [chatCount, setChatCount] = useState(0);
  const [challengeCount, setChallengeCount] = useState(0); // NUEVO

  const loadUnreadNotificationsCount = useCallback(async () => {
    if (!profile?.id) {
      setInternalNotificationCount(0);
      return;
    }

    const { count, error } = await supabase
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('profile_id', profile.id)
      .eq('is_read', false);

    // Un badge es informacion accesoria: si el conteo falla lo llevamos a 0 para
    // que desaparezca, en vez de dejar colgado un numero viejo que ya no
    // corresponde. El header se renderiza igual — nunca lo bloqueamos por esto.
    if (error) {
      // Supabase devuelve el fallo como valor: sin esto, un badge en 0 por RLS
      // es indistinguible de "no tenés notificaciones sin leer".
      Logger.warn('No se pudo contar las notificaciones sin leer; el badge queda en 0', {
        scope: 'GlobalHeader.loadUnreadNotificationsCount',
        profileId: profile.id,
        error,
      });
    }
    setInternalNotificationCount(error ? 0 : (count ?? 0));
  }, [profile?.id]);

  useEffect(() => {
    void loadUnreadNotificationsCount();

    if (!profile?.id) {
      return;
    }

    const channel = supabase
      .channel(`notifications-unread-${profile.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'notifications',
          filter: `profile_id=eq.${profile.id}`,
        },
        () => {
          void loadUnreadNotificationsCount();
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [loadUnreadNotificationsCount, profile?.id]);

  // -- Lógica de Mercado --
  const loadChatCount = useCallback(async () => {
    if (!profile?.id) return;
    try {
      const count = await fetchUnreadChatCount();
      setChatCount(count);
    } catch (error) {
      // Mismo criterio que las notificaciones: ocultamos el badge y seguimos.
      Logger.warn('No se pudo contar los chats sin leer; el badge queda en 0', {
        scope: 'GlobalHeader.loadChatCount',
        profileId: profile.id,
        error,
      });
      setChatCount(0);
    }
  }, [profile?.id]);

  useEffect(() => {
    if (!isMarketTab || !profile?.id) return;
    void loadChatCount();
    const channel = supabase
      .channel(`market-messages-badge-${profile.id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages' },
        () => { void loadChatCount(); }
      )
      .subscribe();

    return () => { void supabase.removeChannel(channel); };
  }, [isMarketTab, profile?.id, loadChatCount]);

  // -- NUEVO: Lógica de Ranking (Desafíos) --
  const loadChallengeCount = useCallback(async () => {
    if (!activeTeamId) return;
    try {
      const inbox = await fetchChallengesInbox(activeTeamId);
      setChallengeCount(inbox.filter(c => c.direction === 'RECIBIDO' && c.status === 'ENVIADA').length);
    } catch (error) {
      Logger.warn('No se pudo contar los desafíos recibidos; el badge queda en 0', {
        scope: 'GlobalHeader.loadChallengeCount',
        activeTeamId,
        error,
      });
      setChallengeCount(0);
    }
  }, [activeTeamId]);

  useEffect(() => {
    if (!isRankingTab || !activeTeamId) return;
    void loadChallengeCount();

    // Escuchamos cambios en los desafíos dirigidos a nuestro equipo
    const channel = supabase
      .channel(`challenges-badge-${activeTeamId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'challenges', filter: `to_team_id=eq.${activeTeamId}` },
        () => { void loadChallengeCount(); }
      )
      .subscribe();

    return () => { void supabase.removeChannel(channel); };
  }, [isRankingTab, activeTeamId, loadChallengeCount]);

  const resolvedNotificationCount = notificationCount ?? internalNotificationCount;
  const handleNotificationPress = onNotificationPress ?? (() => router.push('/notifications'));

  return (
    <View className="relative z-50 flex-row items-center justify-between bg-surface-base/80 px-5 pb-4 pt-12 backdrop-blur-md">
      {/* Logo TorneAR */}
      <View className="flex-row items-center gap-2">
        <View className="h-8 w-8 items-center justify-center rounded-full">
          <AppIcon family="material-community" name="soccer" size={20} color='#53E076' />
        </View>
        <Text className="font-displayBlack text-lg tracking-wider text-brand-primary">TORNEAR</Text>
      </View>

      <View className="flex-1 flex-row items-center justify-end pr-4">
        <ActiveTeamSelector />
      </View>

      {/* gap-6 (24px) y no gap-4: con hitSlop de 12 por lado, 16px de separacion
          hacia que las areas tactiles de dos iconos vecinos se solaparan y el tap
          en la banda intermedia disparara el handler equivocado. */}
      <View className="flex-row items-center gap-6">
        {/* Market Chats Icon */}
        {isMarketTab && (
          <TouchableOpacity
            onPress={() => router.push('/market-chats' as any)}
            activeOpacity={0.7}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            className="relative"
          >
            <AppIcon family="material-icons" name="chat" size={21} />
            {chatCount > 0 && (
              <View className="absolute -right-1.5 -top-1.5 h-4 w-4 items-center justify-center rounded-full border border-[#53E076] bg-[#003914]">
                <Text className="font-uiBold text-[8px] text-[#53E076]" style={{ fontVariant: ['tabular-nums'] }}>
                  {chatCount > 9 ? '9+' : chatCount}
                </Text>
              </View>
            )}
          </TouchableOpacity>
        )}

        {/* NUEVO: Ranking Challenges Icon */}
        {isRankingTab && (
          <TouchableOpacity
            onPress={() => router.push('/challenge-inbox' as any)}
            activeOpacity={0.7}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            className="relative"
          >
            <AppIcon family="material-community" name="sword-cross" size={21} />
            {challengeCount > 0 && (
              <View className="absolute -right-1.5 -top-1.5 h-4 min-w-[16px] items-center justify-center rounded-full border border-surface-base bg-danger-error px-1">
                <Text className="font-uiBold text-[8px] text-surface-base" style={{ fontVariant: ['tabular-nums'] }}>
                  {challengeCount > 9 ? '9+' : challengeCount}
                </Text>
              </View>
            )}
          </TouchableOpacity>
        )}

        {/* Notification Bell */}
        <TouchableOpacity
          onPress={handleNotificationPress}
          activeOpacity={0.7}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          className="relative"
        >
          <AppIcon family="material-community" name="bell" size={20} />
          {resolvedNotificationCount > 0 && (
            <View className="absolute -right-1 -top-1 h-4 w-4 items-center justify-center rounded-full bg-brand-primary">
              <Text className="font-uiBold text-[9px] text-[#003914]" style={{ fontVariant: ['tabular-nums'] }}>
                {resolvedNotificationCount > 9 ? '9+' : resolvedNotificationCount}
              </Text>
            </View>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}