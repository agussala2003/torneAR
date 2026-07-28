import { View } from 'react-native';
import { Skeleton } from '@/components/ui/Skeleton';

/**
 * Silueta de app/(tabs)/profile.tsx: header con avatar, grilla de stats, CTA de
 * stats detalladas, insignias, equipos y ajustes.
 */
export function ProfileSkeleton() {
  return (
    <View className="flex-1 px-4" style={{ paddingTop: 18 }}>
      {/* ProfileHeader: avatar + nombre + usuario */}
      <View className="mb-6 flex-row items-center gap-4">
        <Skeleton className="rounded-full" style={{ width: 76, height: 76 }} />
        <View className="flex-1 gap-2">
          <Skeleton className="rounded" style={{ height: 20, width: '65%' }} />
          <Skeleton className="rounded" style={{ height: 12, width: '40%' }} />
          <Skeleton className="rounded-full" style={{ height: 22, width: 96 }} />
        </View>
      </View>

      {/* ProfileStatsGrid: 4 celdas */}
      <View className="mb-3 flex-row gap-2">
        <Skeleton className="flex-1 rounded-xl" style={{ height: 68 }} />
        <Skeleton className="flex-1 rounded-xl" style={{ height: 68 }} />
        <Skeleton className="flex-1 rounded-xl" style={{ height: 68 }} />
        <Skeleton className="flex-1 rounded-xl" style={{ height: 68 }} />
      </View>

      {/* CTA "Ver stats detalladas" */}
      <Skeleton className="mb-8 rounded-xl" style={{ height: 44 }} />

      {/* Insignias: titulo + fila horizontal de medallas */}
      <Skeleton className="mb-4 rounded" style={{ height: 14, width: '42%' }} />
      <View className="mb-8 flex-row gap-4">
        <Skeleton className="rounded-full" style={{ width: 80, height: 80 }} />
        <Skeleton className="rounded-full" style={{ width: 80, height: 80 }} />
        <Skeleton className="rounded-full" style={{ width: 80, height: 80 }} />
      </View>

      {/* Equipos */}
      <Skeleton className="mb-4 rounded" style={{ height: 14, width: '30%' }} />
      <Skeleton className="mb-2 rounded-xl" style={{ height: 64 }} />
      <Skeleton className="rounded-xl" style={{ height: 64 }} />
    </View>
  );
}
