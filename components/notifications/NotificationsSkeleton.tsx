import { Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { AppIcon } from '@/components/ui/AppIcon';
import { Skeleton } from '@/components/ui/Skeleton';

/** Silueta de app/notifications.tsx: cabecera real + 5 filas fantasma. */
export function NotificationsSkeleton() {
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
          Notificaciones
        </Text>
        <Skeleton className="mt-2 rounded" style={{ height: 12, width: 96 }} />

        <View className="mt-5 gap-2">
          {[0, 1, 2, 3, 4].map((key) => (
            <Skeleton key={key} className="rounded-xl" style={{ height: 74 }} />
          ))}
        </View>
      </View>
    </SafeAreaView>
  );
}
