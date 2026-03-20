import { AppIcon } from './ui/AppIcon';
import { Text, TouchableOpacity, View } from 'react-native';

type GlobalHeaderProps = {
  onNotificationPress?: () => void;
  notificationCount?: number;
};

export function GlobalHeader({ onNotificationPress, notificationCount = 0 }: GlobalHeaderProps) {
  return (
    <View className="relative z-50 flex-row items-center justify-between bg-surface-base/80 px-5 pb-4 pt-12 backdrop-blur-md">
      {/* Logo TorneAR */}
      <View className="flex-row items-center gap-2">
        <View className="h-8 w-8 items-center justify-center rounded-full">
          <AppIcon family="material-community" name="soccer" size={20} color='#53E076'/>
        </View>
        <Text className="font-displayBlack text-lg tracking-wider text-brand-primary">TORNEAR</Text>
      </View>

      {/* Notification Bell */}
      <TouchableOpacity
        onPress={onNotificationPress}
        activeOpacity={0.7}
        className="relative"
      >
        <AppIcon family="material-community" name="bell" size={20}  />
        {notificationCount > 0 && (
          <View className="absolute -top-1 -right-1 h-4 w-4 items-center justify-center rounded-full bg-warning-secondary">
            <Text className="font-uiBold text-[10px] text-surface-base" style={{ fontVariant: ['tabular-nums'] }}>
              {notificationCount > 9 ? '9+' : notificationCount}
            </Text>
          </View>
        )}
      </TouchableOpacity>
    </View>
  );
}
