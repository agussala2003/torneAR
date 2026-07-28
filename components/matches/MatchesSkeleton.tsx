import { View } from 'react-native';
import { Skeleton } from '@/components/ui/Skeleton';

/**
 * Silueta de app/(tabs)/matches.tsx: banner de equipo activo, cabecera de
 * seccion y tarjetas de partido. Se renderiza debajo del GlobalHeader y del
 * banner de invitado, que quedan siempre montados.
 */
export function MatchesSkeleton() {
  return (
    <View className="flex-1 px-4" style={{ paddingTop: 18 }}>
      {/* Banner de equipo activo */}
      <Skeleton className="mb-4 rounded-2xl" style={{ height: 62 }} />

      {/* MatchSectionHeader "Próximos" */}
      <Skeleton className="mb-3 rounded" style={{ height: 14, width: '40%' }} />

      {/* MatchCards */}
      <Skeleton className="mb-3 rounded-2xl" style={{ height: 118 }} />
      <Skeleton className="mb-3 rounded-2xl" style={{ height: 118 }} />

      {/* MatchSectionHeader "Historial" */}
      <Skeleton className="mb-3 mt-3 rounded" style={{ height: 14, width: '34%' }} />

      <Skeleton className="mb-3 rounded-2xl" style={{ height: 118 }} />
    </View>
  );
}
