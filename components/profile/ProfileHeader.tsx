import { Feather } from '@expo/vector-icons';
import { Image, Text, View } from 'react-native';
import { ProfileRow } from './types';
import { getSupabaseStorageUrl } from '@/lib/supabase-storage';

type ProfileHeaderProps = {
  profile: ProfileRow;
};

function positionLabel(position: string): string {
  return position.replaceAll('_', ' ');
}

export function ProfileHeader({ profile }: ProfileHeaderProps) {
  // Construir URL de avatar desde storage de Supabase
  const avatarUrl = profile.avatar_url 
    ? getSupabaseStorageUrl('avatars', profile.avatar_url)
    : null;

  return (
    <View className="items-center pt-3">
      <View className="relative">
        <View 
          className="border-4 border-brand-primary-container bg-surface-lowest p-1"
          style={{ height: 128, width: 128, borderRadius: 64 }}
        >
          {avatarUrl ? (
            <Image 
              source={{ uri: avatarUrl }} 
              style={{ height: '100%', width: '100%', borderRadius: 60 }}
              resizeMode="cover" 
            />
          ) : (
            <View 
              className="items-center justify-center bg-surface-high"
              style={{ height: '100%', width: '100%', borderRadius: 60 }}
            >
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
