import { Feather } from '@expo/vector-icons';
import { Image, ScrollView, Text, View } from 'react-native';
import { BadgeItem } from './types';
import { getSupabaseStorageUrl } from '@/lib/supabase-storage';

type ProfileBadgesSectionProps = {
  badges: BadgeItem[];
};

export function ProfileBadgesSection({ badges }: ProfileBadgesSectionProps) {
  const earnedBadges = badges.filter((b) => b.isEarned);
  const lockedBadges = badges.filter((b) => !b.isEarned);

  // Helper para obtener URL de insignia
  const getBadgeImageUrl = (badge: BadgeItem): string => {
    if (!badge.iconUrl) return '';
    // Si ya es una URL completa, devolver como está
    if (badge.iconUrl.startsWith('http')) return badge.iconUrl;
    // Si no, tratarla como path en el bucket de badges
    return getSupabaseStorageUrl('badges', badge.iconUrl);
  };

  return (
    <View className="mt-8">
      <View className="mb-4 flex-row items-center justify-between px-1">
        <Text className="text-sm font-bold uppercase tracking-wider text-neutral-on-surface-variant">
          Insignias Ganadas
        </Text>
        <Text className="text-[10px] font-bold uppercase text-neutral-on-surface-variant">
          {earnedBadges.length} de {badges.length}
        </Text>
      </View>

      {badges.length === 0 ? (
        <View className="rounded-xl border border-dashed border-neutral-outline-variant bg-surface-high px-4 py-3">
          <Text className="text-xs text-neutral-on-surface-variant">Aun no hay insignias disponibles.</Text>
        </View>
      ) : (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: 16, paddingHorizontal: 4, paddingVertical: 0 }}
        >
          {/* Insignias ganadas */}
          {earnedBadges.map((badge) => (
            <View key={`earned-${badge.id}`} className="items-center gap-2">
              <View className="h-20 w-20 items-center justify-center rounded-full border-2 border-brand-primary bg-surface-high">
                {getBadgeImageUrl(badge) ? (
                  <Image source={{ uri: getBadgeImageUrl(badge) }} className="h-11 w-11" resizeMode="contain" />
                ) : (
                  <Feather name="award" size={28} color="#53E076" />
                )}
              </View>
              <Text
                className="max-w-[72px] text-center text-[10px] font-bold text-neutral-on-surface"
                numberOfLines={2}
              >
                {badge.name}
              </Text>
            </View>
          ))}

          {/* Insignias bloqueadas */}
          {lockedBadges.map((badge) => (
            <View key={`locked-${badge.id}`} className="items-center gap-2">
              <View className="relative h-20 w-20 items-center justify-center rounded-full border-2 border-dashed border-neutral-outline-variant bg-surface-high">
                {getBadgeImageUrl(badge) ? (
                  <>
                    <Image
                      source={{ uri: getBadgeImageUrl(badge) }}
                      className="h-11 w-11 opacity-30"
                      resizeMode="contain"
                    />
                    <View className="absolute h-6 w-6 items-center justify-center rounded-full bg-neutral-outline-variant">
                      <Feather name="lock" size={12} color="#8CCDFF" />
                    </View>
                  </>
                ) : (
                  <>
                    <Feather name="award" size={28} color="#595959" />
                    <View className="absolute h-6 w-6 items-center justify-center rounded-full bg-neutral-outline-variant">
                      <Feather name="lock" size={12} color="#8CCDFF" />
                    </View>
                  </>
                )}
              </View>
              <Text
                className="max-w-[72px] text-center text-[10px] font-bold text-neutral-on-surface-variant"
                numberOfLines={2}
              >
                {badge.name}
              </Text>
            </View>
          ))}
        </ScrollView>
      )}
    </View>
  );
}
