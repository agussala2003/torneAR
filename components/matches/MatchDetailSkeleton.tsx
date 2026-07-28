import { Text, TouchableOpacity, View } from 'react-native';
import { router } from 'expo-router';
import { AppIcon } from '@/components/ui/AppIcon';
import { Skeleton } from '@/components/ui/Skeleton';

/**
 * Silueta de app/match-detail.tsx. Mantiene el header real (con el boton atras
 * operativo) para que el usuario pueda salir sin esperar a que cargue el fetch.
 */
export function MatchDetailSkeleton() {
  return (
    <View className="flex-1 bg-surface-base">
      <View className="flex-row items-center gap-3 px-4 pb-3 pt-14">
        <TouchableOpacity
          onPress={() => router.back()}
          activeOpacity={0.7}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          className="p-1"
        >
          <AppIcon family="material-community" name="arrow-left" size={24} color="#E5E2E1" />
        </TouchableOpacity>
        <Text className="font-uiBold flex-1 text-lg text-neutral-on-surface">Detalle del partido</Text>
        <Skeleton className="rounded-full" style={{ width: 88, height: 24 }} />
      </View>

      <View className="px-4">
        {/* MatchDetailHero: escudos + marcador */}
        <Skeleton className="rounded-2xl" style={{ height: 168 }} />

        {/* Bloque del codigo del partido */}
        <Skeleton className="mt-3 rounded-xl" style={{ height: 72 }} />

        {/* Seccion principal segun estado (propuesta / checkin / resultado) */}
        <Skeleton className="mt-4 rounded-2xl" style={{ height: 132 }} />

        {/* Fila de acciones */}
        <View className="mt-4 flex-row gap-2">
          <Skeleton className="flex-1 rounded-xl" style={{ height: 46 }} />
          <Skeleton className="flex-1 rounded-xl" style={{ height: 46 }} />
        </View>
      </View>
    </View>
  );
}
