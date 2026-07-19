import { Image, Text, TouchableOpacity, View } from 'react-native';
import { usePlayerCareer } from '@/hooks/usePlayerCareer';
import { GuestAppearance } from '@/lib/career-data';
import { CareerStintCard } from './CareerStintCard';
import { AppIcon } from '@/components/ui/AppIcon';
import { Skeleton } from '@/components/ui/Skeleton';
import { getSupabaseStorageUrl } from '@/lib/supabase-storage';

type CareerTimelineProps = {
  profileId: string;
};

function SectionTitle({ children }: { children: string }) {
  return (
    <Text className="font-display mb-4 px-1 text-sm uppercase tracking-wider text-neutral-on-surface-variant">
      {children}
    </Text>
  );
}

// Dos cards fantasma con la misma silueta que CareerStintCard: el contenido
// real aparece en su lugar sin saltos de layout.
function CareerTimelineSkeleton() {
  return (
    <View className="gap-3">
      {[0, 1].map((key) => (
        <View key={key} className="rounded-xl bg-surface-low p-3">
          <View className="flex-row items-center gap-3">
            <Skeleton className="h-12 w-12 rounded-lg" />
            <View className="flex-1 gap-2">
              <Skeleton className="h-4 w-2/3 rounded" />
              <Skeleton className="h-3 w-1/2 rounded" />
            </View>
          </View>
          <View className="mt-3 flex-row gap-1.5">
            <Skeleton className="h-6 w-16 rounded-md" />
            <Skeleton className="h-6 w-16 rounded-md" />
            <Skeleton className="h-6 w-16 rounded-md" />
          </View>
        </View>
      ))}
    </View>
  );
}

function GuestAppearanceRow({ guest }: { guest: GuestAppearance }) {
  const shieldUrl = guest.shield_url ? getSupabaseStorageUrl('shields', guest.shield_url) : '';
  const pj = guest.pj_ranking + guest.pj_amistoso;

  return (
    <View className="flex-row items-center gap-3 rounded-xl bg-surface-low p-3">
      <View className="h-10 w-10 items-center justify-center rounded-lg bg-surface-variant">
        {shieldUrl ? (
          <Image source={{ uri: shieldUrl }} className="h-7 w-7" resizeMode="contain" />
        ) : (
          <AppIcon family="material-community" name="shield-outline" size={16} color="#BCCBB9" />
        )}
      </View>
      <View className="flex-1">
        <Text className="font-ui text-sm text-neutral-on-surface" numberOfLines={1}>
          {guest.team_name}
        </Text>
        <Text className="font-ui mt-0.5 text-xs text-neutral-on-surface-variant" style={{ fontVariant: ['tabular-nums'] }}>
          {pj} PJ ({guest.pj_ranking} Ranking · {guest.pj_amistoso} Amistosos) · {guest.goals} Goles · {guest.mvps} MVP
        </Text>
      </View>
    </View>
  );
}

export function CareerTimeline({ profileId }: CareerTimelineProps) {
  const { career, loading, error, reload } = usePlayerCareer(profileId);

  if (loading) {
    return (
      <View className="mt-8">
        <SectionTitle>Trayectoria</SectionTitle>
        <CareerTimelineSkeleton />
      </View>
    );
  }

  if (error || !career) {
    return (
      <View className="mt-8">
        <SectionTitle>Trayectoria</SectionTitle>
        <View className="items-center rounded-xl bg-surface-low p-4">
          <Text className="font-ui text-center text-sm text-neutral-on-surface-variant">
            No se pudo cargar la trayectoria.
          </Text>
          <TouchableOpacity
            onPress={() => void reload()}
            activeOpacity={0.9}
            className="mt-3 flex-row items-center gap-1.5 rounded-lg bg-surface-high px-4 py-2"
          >
            <AppIcon family="material-icons" name="refresh" size={14} color="#BCCBB9" />
            <Text className="font-display text-[11px] uppercase tracking-wide text-neutral-on-surface-variant">
              Reintentar
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  const hasStints = career.stints.length > 0;
  const hasGuestAppearances = career.guest_appearances.length > 0;

  if (!hasStints && !hasGuestAppearances) {
    return (
      <View className="mt-8">
        <SectionTitle>Trayectoria</SectionTitle>
        <View className="items-center rounded-xl bg-surface-low p-5">
          <Text className="font-ui text-center text-sm text-neutral-on-surface-variant">
            Aún no hay historial registrado 📖
          </Text>
          <Text className="font-ui mt-1 text-center text-xs text-neutral-on-surface-variant">
            Tu historia se escribe con cada partido.
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View className="mt-8">
      {hasStints && (
        <>
          <SectionTitle>Trayectoria</SectionTitle>
          <View className="gap-3">
            {career.stints.map((stint) => (
              <CareerStintCard key={stint.stint_id} stint={stint} />
            ))}
          </View>
        </>
      )}

      {hasGuestAppearances && (
        <View className={hasStints ? 'mt-6' : undefined}>
          <SectionTitle>Apariciones como invitado</SectionTitle>
          <View className="gap-2">
            {career.guest_appearances.map((guest) => (
              <GuestAppearanceRow key={guest.team_id} guest={guest} />
            ))}
          </View>
        </View>
      )}
    </View>
  );
}
