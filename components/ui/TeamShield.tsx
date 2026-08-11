import { View, Text } from 'react-native';
import { Image } from 'expo-image';
import { AppIcon } from '@/components/ui/AppIcon';
import { getInitials } from '@/lib/market-utils';

interface Props {
  shieldUrl: string | null;
  size?: number;
  isMyTeam?: boolean;
  /**
   * Nombre del equipo. Si se pasa, el fallback son las **iniciales** en vez del
   * escudo genérico: en una lista de equipos propios el ícono genérico se
   * repite idéntico en cada fila y no distingue a ninguno. Donde el equipo ya
   * está identificado por su nombre al lado (tarjetas de partido, hero), el
   * ícono genérico alcanza y se omite esta prop.
   */
  name?: string;
}

export function TeamShield({ shieldUrl, size = 48, isMyTeam = false, name }: Props) {
  const borderClass = isMyTeam
    ? 'border-2 border-brand-primary/40'
    : 'border border-neutral-outline/20';
  const initialsClass = isMyTeam ? 'text-brand-primary' : 'text-neutral-on-surface-variant';

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
      ) : name ? (
        <Text className={`font-uiBold ${initialsClass}`} style={{ fontSize: size * 0.36 }}>
          {getInitials(name)}
        </Text>
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
