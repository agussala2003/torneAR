import { View } from 'react-native';
import { Image } from 'expo-image';
import { AppIcon } from '@/components/ui/AppIcon';

interface Props {
  shieldUrl: string | null;
  size?: number;
  isMyTeam?: boolean;
}

export function TeamShield({ shieldUrl, size = 48, isMyTeam = false }: Props) {
  const borderClass = isMyTeam
    ? 'border-2 border-brand-primary/40'
    : 'border border-neutral-outline/20';
  return (
    <View
      className={`items-center justify-center rounded-full bg-surface-high ${borderClass}`}
      style={{ width: size, height: size }}
    >
      {shieldUrl ? (
        <Image
          source={{ uri: shieldUrl }}
          style={{ width: size * 0.65, height: size * 0.65 }}
          contentFit="contain"
        />
      ) : (
        <AppIcon
          family="material-community"
          name="shield"
          size={size * 0.55}
          color={isMyTeam ? '#53E076' : '#869585'}
        />
      )}
    </View>
  );
}
