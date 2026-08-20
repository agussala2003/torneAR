import { Image, Text, View } from 'react-native';
import { AppIcon } from '@/components/ui/AppIcon';
import { getSupabaseStorageUrl } from '@/lib/supabase-storage';
import { formatAge } from '@/lib/age';
import type { PublicProfileRow } from './types';

function positionLabel(pos: string): string {
  return pos.replaceAll('_', ' ');
}

type StatsHeaderProps = {
  profile: PublicProfileRow;
  /**
   * Ya calculada server-side (columna derivada de `profiles_public`) — ver
   * el comentario en `ProfileStatsViewData.age`. Nunca se deriva de
   * `date_of_birth`: esa columna no es legible por SELECT directo.
   */
  age: number | null;
  /** Ver el mismo prop en `components/profile/ProfileHeader.tsx`. */
  isEmbajador?: boolean;
};

export function StatsHeader({ profile, age, isEmbajador = false }: StatsHeaderProps) {
  const avatarUrl = profile.avatar_url
    ? getSupabaseStorageUrl('avatars', profile.avatar_url)
    : null;

  // `null` cuando el jugador no cargo su fecha de nacimiento: en ese caso no se
  // renderiza el badge en vez de mostrar un "0 años" que parece un dato real.
  const ageLabel = formatAge(age);

  return (
    <View className="items-center pb-2 pt-4">
      <View
        className={`rounded-full border-4 bg-surface-lowest p-1 ${
          isEmbajador ? 'border-brand-gold' : 'border-brand-primary-container'
        }`}
        style={{ height: 128, width: 128 }}
      >
        {avatarUrl ? (
          <Image
            source={{ uri: avatarUrl }}
            className="rounded-full"
            style={{ height: '100%', width: '100%' }}
            resizeMode="cover"
          />
        ) : (
          <View className="h-full w-full items-center justify-center rounded-full bg-surface-high">
            <AppIcon family="material-community" name="account" size={42} color="#BCCBB9" />
          </View>
        )}
      </View>

      <Text className="font-uiBold mt-4 text-3xl text-neutral-on-surface">
        {profile.full_name}
      </Text>
      <Text className="font-ui mt-1 text-base text-neutral-on-surface-variant">
        @{profile.username}
      </Text>

      <View className="mt-3 flex-row flex-wrap items-center justify-center gap-3">
        {ageLabel && (
          <View className="flex-row items-center gap-1 rounded-full bg-surface-high px-3 py-1">
            <AppIcon family="material-community" name="cake-variant-outline" size={12} color="#FABD32" />
            <Text className="font-uiBold text-xs text-neutral-on-surface">{ageLabel}</Text>
          </View>
        )}
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
