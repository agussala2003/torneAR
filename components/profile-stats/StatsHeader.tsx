import { Image, Text, View } from 'react-native';
import { AppIcon } from '@/components/ui/AppIcon';
import { getSupabaseStorageUrl } from '@/lib/supabase-storage';
import type { ProfileRow } from './types';

function positionLabel(pos: string): string {
  return pos.replaceAll('_', ' ');
}

type StatsHeaderProps = {
  profile: ProfileRow;
};

export function StatsHeader({ profile }: StatsHeaderProps) {
  const avatarUrl = profile.avatar_url
    ? getSupabaseStorageUrl('avatars', profile.avatar_url)
    : null;

  return (
    <View className="items-center pb-2 pt-4">
      <View
        className="border-4 border-brand-primary-container bg-surface-lowest p-1"
        style={{ height: 128, width: 128, borderRadius: 6 }}
      >
        {avatarUrl ? (
          <Image
            source={{ uri: avatarUrl }}
            style={{ height: '100%', width: '100%', borderRadius: 6 }}
            resizeMode="cover"
          />
        ) : (
          <View className="h-full w-full items-center justify-center rounded-lg bg-surface-high">
            <AppIcon family="material-community" name="account" size={42} color="#BCCBB9" />
          </View>
        )}
      </View>

      <Text className="font-displayBlack mt-4 text-3xl tracking-tight text-neutral-on-surface">
        {profile.full_name}
      </Text>
      <Text className="font-ui mt-1 text-base text-neutral-on-surface-variant">
        @{profile.username}
      </Text>

      <View className="mt-3 flex-row items-center gap-3">
        <View className="flex-row items-center gap-1 rounded-full bg-surface-high px-3 py-1">
          <AppIcon family="material-community" name="map-marker-outline" size={12} color="#8CCDFF" />
          <Text className="font-uiBold text-xs text-neutral-on-surface">
            {profile.zone ?? 'Sin zona'}
          </Text>
        </View>
        <View className="flex-row items-center gap-1 rounded-full border border-brand-primary/25 bg-brand-primary-container/20 px-3 py-1">
          <AppIcon family="material-community" name="soccer" size={12} color="#53E076" />
          <Text className="font-display text-xs uppercase text-brand-primary">
            {positionLabel(profile.preferred_position)}
          </Text>
        </View>
      </View>
    </View>
  );
}
