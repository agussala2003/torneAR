import { useState } from 'react';
import { ActivityIndicator, Linking, Text, TouchableOpacity, View } from 'react-native';
import { AppIcon } from '@/components/ui/AppIcon';
import { Logger } from '@/lib/logger';

type ProfileSocialSectionProps = {
  onError: (message: string) => void;
};

type SocialNetwork = {
  key: 'instagram' | 'tiktok';
  label: string;
  /** Ionicons: es la única familia de AppIcon que trae los dos logos. */
  icon: string;
  url: string;
};

/**
 * A diferencia del formulario de feedback (ProfileFeedbackCard), acá SÍ va
 * `Linking.openURL` y no `expo-web-browser`: el sistema operativo resuelve el
 * link de Instagram/TikTok hacia la app nativa si está instalada, que es donde
 * el usuario ya tiene sesión iniciada. Un navegador in-app lo dejaría deslogueado
 * frente a un muro de login.
 */
const NETWORKS: SocialNetwork[] = [
  {
    key: 'instagram',
    label: 'Instagram',
    icon: 'logo-instagram',
    url: 'https://instagram.com/tornear.app',
  },
  {
    key: 'tiktok',
    label: 'TikTok',
    icon: 'logo-tiktok',
    url: 'https://tiktok.com/@tornear.app',
  },
];

export function ProfileSocialSection({ onError }: ProfileSocialSectionProps) {
  const [opening, setOpening] = useState<SocialNetwork['key'] | null>(null);

  async function handlePress(network: SocialNetwork) {
    if (opening) return;
    setOpening(network.key);
    try {
      await Linking.openURL(network.url);
    } catch (error) {
      // `openURL` rechaza cuando no hay ninguna app capaz de abrir el esquema
      // (emuladores sin navegador, perfiles restringidos). Sin este catch el
      // rechazo quedaba como unhandled rejection y el tap no hacía nada visible.
      Logger.error('No se pudo abrir la red social', {
        scope: 'ProfileSocialSection.handlePress',
        network: network.key,
        error,
      });
      onError(`No pudimos abrir ${network.label}. Buscanos como @tornear.app.`);
    } finally {
      setOpening(null);
    }
  }

  return (
    <View className="mt-8">
      <Text className="font-display mb-4 px-1 text-sm uppercase tracking-wider text-neutral-on-surface-variant">
        Comunidad
      </Text>

      <View className="rounded-2xl border border-brand-primary/25 bg-surface-container p-4">
        <Text className="font-uiBold text-sm text-neutral-on-surface">
          Seguinos en nuestras redes
        </Text>
        <Text className="font-ui mt-0.5 text-xs leading-4 text-neutral-on-surface-variant">
          Novedades, partidos destacados y todo lo que se viene después de la Beta.
        </Text>

        <View className="mt-3 flex-row gap-2">
          {NETWORKS.map((network) => (
            <TouchableOpacity
              key={network.key}
              activeOpacity={0.85}
              disabled={opening !== null}
              onPress={() => void handlePress(network)}
              className="flex-1 flex-row items-center justify-center gap-2 rounded-xl bg-surface-high py-3"
            >
              {opening === network.key ? (
                <ActivityIndicator size="small" color="#53E076" />
              ) : (
                <AppIcon family="ionicons" name={network.icon} size={18} color="#53E076" />
              )}
              <Text className="font-uiBold text-sm text-neutral-on-surface">{network.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
    </View>
  );
}
