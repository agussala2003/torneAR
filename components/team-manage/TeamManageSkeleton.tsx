import { Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { AppIcon } from '@/components/ui/AppIcon';
import { Skeleton } from '@/components/ui/Skeleton';

/**
 * Silueta de app/team-manage.tsx. Conserva titulo y boton atras reales: el
 * usuario puede volver mientras carga en vez de quedar atrapado en un loader.
 */
export function TeamManageSkeleton() {
  return (
    <SafeAreaView className="flex-1 bg-surface-base">
      <View className="px-4 pb-2 pt-1">
        <TouchableOpacity
          className="w-10"
          activeOpacity={0.8}
          onPress={() => router.back()}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <AppIcon family="material-icons" name="arrow-back-ios-new" size={22} color="#BCCBB9" />
        </TouchableOpacity>
      </View>

      <View className="px-4">
        <Text className="font-displayBlack text-3xl uppercase tracking-tight text-neutral-on-surface">
          Gestion de equipo
        </Text>
        <Text className="font-ui mt-1 text-sm text-neutral-on-surface-variant">
          Administracion y estado de tu plantel.
        </Text>

        {/* TeamManageHeader: escudo + datos + codigo de invitacion */}
        <Skeleton className="mt-4 rounded-2xl" style={{ height: 180 }} />

        {/* Solicitudes pendientes */}
        <Skeleton className="mt-4 rounded-xl" style={{ height: 96 }} />

        {/* Plantel */}
        <View className="mt-4 rounded-xl bg-surface-low p-4">
          <Skeleton className="mb-3 rounded" style={{ height: 12, width: '35%' }} />
          <Skeleton className="mb-2 rounded-lg" style={{ height: 56 }} />
          <Skeleton className="mb-2 rounded-lg" style={{ height: 56 }} />
          <Skeleton className="rounded-lg" style={{ height: 56 }} />
        </View>
      </View>
    </SafeAreaView>
  );
}
