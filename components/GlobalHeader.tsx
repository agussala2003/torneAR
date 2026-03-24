import { useCallback, useEffect, useState } from 'react';
import { router } from 'expo-router';
import { AppIcon } from './ui/AppIcon';
import { Text, TouchableOpacity, View } from 'react-native';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';
import { useTeamStore } from '@/stores/teamStore';
import { ActiveTeamSelector } from './ui/ActiveTeamSelector';
import { fetchInbox } from '@/lib/chat-api';

type GlobalHeaderProps = {
  onNotificationPress?: () => void;
  notificationCount?: number;
  isMarketTab?: boolean;
};

export function GlobalHeader({ onNotificationPress, notificationCount, isMarketTab }: GlobalHeaderProps) {
  const { profile } = useAuth();
  const [internalNotificationCount, setInternalNotificationCount] = useState(0);
  const [chatCount, setChatCount] = useState(0);

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

  const { fetchMyTeams, activeTeamId } = useTeamStore();

  useEffect(() => {
    if (profile?.id && !activeTeamId) {
      void fetchMyTeams(profile.id);
    }
  }, [profile?.id, activeTeamId, fetchMyTeams]);

  const loadChatCount = useCallback(async () => {
    if (!profile?.id) return;
    try {
      const inbox = await fetchInbox();
      setChatCount(inbox.length);
    } catch { }
  }, [profile?.id]);

  useEffect(() => {
    if (isMarketTab) {
      void loadChatCount();
    }
  }, [isMarketTab, loadChatCount]);

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
          <TouchableOpacity
            onPress={() => router.push('/market-chats' as any)}
            activeOpacity={0.7}
            className="relative"
          >
            <AppIcon family="material-icons" name="chat" size={21} />
            {chatCount > 0 && (
              <View className="absolute -top-1.5 -right-1.5 h-4 w-4 items-center justify-center rounded-full bg-[#003914] border border-[#53E076]">
                <Text className="font-uiBold text-[8px] text-[#53E076]" style={{ fontVariant: ['tabular-nums'] }}>
                  {chatCount > 9 ? '9+' : chatCount}
                </Text>
              </View>
            )}
          </TouchableOpacity>
        )}

        {/* Notification Bell */}
        <TouchableOpacity
          onPress={handleNotificationPress}
          activeOpacity={0.7}
          className="relative"
        >
          <AppIcon family="material-community" name="bell" size={20} />
          {resolvedNotificationCount > 0 && (
            <View className="absolute -top-1 -right-1 h-4 w-4 items-center justify-center rounded-full bg-brand-primary">
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
