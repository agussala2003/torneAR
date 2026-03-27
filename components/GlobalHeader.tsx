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

type GlobalHeaderProps = {
  onNotificationPress?: () => void;
  notificationCount?: number;
  isMarketTab?: boolean;
  isRankingTab?: boolean; // NUEVO
};

export function GlobalHeader({ onNotificationPress, notificationCount, isMarketTab, isRankingTab }: GlobalHeaderProps) {
  const { profile } = useAuth();
  const { fetchMyTeams, activeTeamId } = useTeamStore(); // Sacamos activeTeamId para los desafíos
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

    if (error) {
      return;
    }

    setInternalNotificationCount(count ?? 0);
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

  useEffect(() => {
    if (profile?.id) {
      void fetchMyTeams(profile.id);
    }
  }, [profile?.id, fetchMyTeams]);

  // -- Lógica de Mercado --
  const loadChatCount = useCallback(async () => {
    if (!profile?.id) return;
    try {
      const count = await fetchUnreadChatCount();
      setChatCount(count);
    } catch { }
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
    } catch { }
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

      <View className="flex-row items-center gap-4">
        {/* Market Chats Icon */}
        {isMarketTab && (
          <TouchableOpacity onPress={() => router.push('/market-chats' as any)} activeOpacity={0.7} className="relative">
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
          <TouchableOpacity onPress={() => router.push('/challenge-inbox' as any)} activeOpacity={0.7} className="relative">
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
        <TouchableOpacity onPress={handleNotificationPress} activeOpacity={0.7} className="relative">
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