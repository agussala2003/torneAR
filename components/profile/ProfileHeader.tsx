import { Feather } from '@expo/vector-icons';
import { Image, Text, View } from 'react-native';
import { ProfileRow } from './types';

type ProfileHeaderProps = {
  profile: ProfileRow;
};

function positionLabel(position: string): string {
  return position.replaceAll('_', ' ');
}

export function ProfileHeader({ profile }: ProfileHeaderProps) {
  return (
    <View className="items-center pt-3">
      <View className="relative">
        <View className="h-32 w-32 rounded-full border-4 border-brand-primary-container bg-surface-lowest p-1">
          {profile.avatar_url ? (
            <Image source={{ uri: profile.avatar_url }} className="h-full w-full rounded-full" resizeMode="cover" />
          ) : (
            <View className="h-full w-full rounded-full items-center justify-center bg-surface-high">
              <Feather name="user" size={42} color="#BCCBB9" />
            </View>
          )}
        </View>
        <View className="absolute bottom-1 right-1 rounded-full border-2 border-surface-base bg-brand-primary p-2">
          <Feather name="check" size={12} color="#003914" />
        </View>
      </View>

      <Text className="mt-4 text-3xl font-black tracking-tight text-neutral-on-surface">{profile.full_name}</Text>
      <Text className="mt-1 text-base font-medium text-neutral-on-surface-variant">@{profile.username}</Text>

      <View className="mt-3 flex-row items-center gap-3">
        <View className="flex-row items-center gap-1 rounded-full bg-surface-high px-3 py-1">
          <Feather name="map-pin" size={12} color="#8CCDFF" />
          <Text className="text-xs font-semibold text-neutral-on-surface">{profile.zone ?? 'Sin zona'}</Text>
        </View>

        <View className="flex-row items-center gap-1 rounded-full border border-brand-primary/25 bg-brand-primary-container/20 px-3 py-1">
          <Feather name="crosshair" size={12} color="#53E076" />
          <Text className="text-xs font-bold uppercase text-brand-primary">{positionLabel(profile.preferred_position)}</Text>
        </View>
      </View>
    </View>
  );
}
