import { View } from 'react-native';
import { Skeleton } from '@/components/ui/Skeleton';

/**
 * Silueta de app/(tabs)/index.tsx: acciones pendientes, proximos partidos,
 * ranking de mis equipos y accesos rapidos. Reemplaza al GlobalLoader a pantalla
 * completa para que la estructura no desaparezca durante el fetch.
 */
export function HomeSkeleton() {
  return (
    <View className="flex-1 px-4" style={{ paddingTop: 18 }}>
      {/* PendingActionsCard */}
      <Skeleton className="mb-6 rounded-2xl" style={{ height: 96 }} />

      {/* UpcomingMatchesSection: titulo + 2 tarjetas */}
      <Skeleton className="mb-3 rounded" style={{ height: 14, width: '45%' }} />
      <Skeleton className="mb-2.5 rounded-2xl" style={{ height: 104 }} />
      <Skeleton className="mb-6 rounded-2xl" style={{ height: 104 }} />

      {/* MyTeamsRankingSection: titulo + 2 filas */}
      <Skeleton className="mb-3 rounded" style={{ height: 14, width: '38%' }} />
      <Skeleton className="mb-2 rounded-xl" style={{ height: 58 }} />
      <Skeleton className="mb-6 rounded-xl" style={{ height: 58 }} />

      {/* QuickActionsSection: 3 accesos en fila */}
      <View className="flex-row gap-3">
        <Skeleton className="flex-1 rounded-xl" style={{ height: 76 }} />
        <Skeleton className="flex-1 rounded-xl" style={{ height: 76 }} />
        <Skeleton className="flex-1 rounded-xl" style={{ height: 76 }} />
      </View>
    </View>
  );
}
