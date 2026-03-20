import { Feather } from '@expo/vector-icons';
import { Text, TouchableOpacity, View } from 'react-native';

type GlobalHeaderProps = {
  onNotificationPress?: () => void;
  notificationCount?: number;
};

export function GlobalHeader({ onNotificationPress, notificationCount = 0 }: GlobalHeaderProps) {
  return (
    <View className="relative z-50 flex-row items-center justify-between bg-surface-base/80 px-5 py-4 backdrop-blur-md">
      {/* Logo TorneAR */}
      <View className="flex-row items-center gap-2">
        <View className="h-8 w-8 items-center justify-center rounded-full bg-brand-primary">
          <Feather name="activity" size={18} color="#003914" />
        </View>
        <Text className="text-lg font-bold tracking-wider text-brand-primary">TORNEAR</Text>
      </View>

      {/* Notification Bell */}
      <TouchableOpacity
        onPress={onNotificationPress}
        activeOpacity={0.7}
        className="relative"
      >
        <Feather name="bell" size={20} color="#8CCDFF" />
        {notificationCount > 0 && (
          <View className="absolute -top-1 -right-1 h-4 w-4 items-center justify-center rounded-full bg-warning-secondary">
            <Text className="text-[10px] font-bold text-surface-base">
              {notificationCount > 9 ? '9+' : notificationCount}
            </Text>
          </View>
        )}
      </TouchableOpacity>
    </View>
  );
}
