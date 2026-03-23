import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import { AppIcon } from './ui/AppIcon';
import { Text, TouchableOpacity, View } from 'react-native';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';

type GlobalHeaderProps = {
  onNotificationPress?: () => void;
  notificationCount?: number;
};

export function GlobalHeader({ onNotificationPress, notificationCount }: GlobalHeaderProps) {
  const router = useRouter();
  const { profile } = useAuth();
  const [internalNotificationCount, setInternalNotificationCount] = useState(0);

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

  const resolvedNotificationCount = notificationCount ?? internalNotificationCount;
  const handleNotificationPress = onNotificationPress ?? (() => router.push('/notifications'));

  return (
    <View className="relative z-50 flex-row items-center justify-between bg-surface-base/80 px-5 pb-4 pt-12 backdrop-blur-md">
      {/* Logo TorneAR */}
      <View className="flex-row items-center gap-2">
        <View className="h-8 w-8 items-center justify-center rounded-full">
          <AppIcon family="material-community" name="soccer" size={20} color='#53E076'/>
        </View>
        <Text className="font-displayBlack text-lg tracking-wider text-brand-primary">TORNEAR</Text>
      </View>

      {/* Notification Bell */}
      <TouchableOpacity
        onPress={handleNotificationPress}
        activeOpacity={0.7}
        className="relative"
      >
        <AppIcon family="material-community" name="bell" size={20}  />
        {resolvedNotificationCount > 0 && (
          <View className="absolute -top-1 -right-1 h-4 w-4 items-center justify-center rounded-full bg-brand-primary">
            <Text className="font-uiBold text-[9px] text-[#003914]" style={{ fontVariant: ['tabular-nums'] }}>
              {resolvedNotificationCount > 9 ? '9+' : resolvedNotificationCount}
            </Text>
          </View>
        )}
      </TouchableOpacity>
    </View>
  );
}
