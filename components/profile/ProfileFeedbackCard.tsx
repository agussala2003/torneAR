import { useState } from 'react';
import { ActivityIndicator, Text, TouchableOpacity, View } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { AppIcon } from '@/components/ui/AppIcon';
import { buildFeedbackFormUrl } from '@/lib/feedback';
import { Logger } from '@/lib/logger';

type ProfileFeedbackCardProps = {
  /** Email de la sesion; se precarga en el formulario. */
  email: string | null | undefined;
  onError: (message: string) => void;
};

/**
 * Entrada al canal de feedback de la Beta (Google Form externo).
 *
 * Se abre con `expo-web-browser` y no con `Linking.openURL`: el navegador
 * in-app vuelve solo a torneAR al cerrarse, mientras que `openURL` manda al
 * usuario a Chrome/Safari y lo deja afuera de la app.
 */
export function ProfileFeedbackCard({ email, onError }: ProfileFeedbackCardProps) {
  const [opening, setOpening] = useState(false);

  async function handlePress() {
    if (opening) return;
    setOpening(true);
    try {
      await WebBrowser.openBrowserAsync(buildFeedbackFormUrl(email));
    } catch (error) {
      Logger.error('No se pudo abrir el formulario de feedback', {
        error: error instanceof Error ? error : String(error),
      });
      onError('No pudimos abrir el formulario. Revisá tu conexión e intentá de nuevo.');
    } finally {
      setOpening(false);
    }
  }

  return (
    <TouchableOpacity
      activeOpacity={0.9}
      disabled={opening}
      onPress={() => void handlePress()}
      className="mt-6 flex-row items-center gap-3 rounded-2xl border border-brand-primary/40 bg-surface-container p-4"
    >
      <View className="h-11 w-11 items-center justify-center rounded-xl bg-brand-primary/15">
        <AppIcon family="material-community" name="message-alert-outline" size={22} color="#53E076" />
      </View>
      <View className="flex-1">
        <Text className="font-uiBold text-sm text-neutral-on-surface" numberOfLines={2}>
          Sugerencias o reportar un error
        </Text>
        <Text className="font-ui mt-0.5 text-xs leading-4 text-neutral-on-surface-variant">
          Estamos en Beta: contanos qué mejorarías o qué se rompió.
        </Text>
      </View>
      {opening ? (
        <ActivityIndicator size="small" color="#53E076" />
      ) : (
        <AppIcon family="material-community" name="open-in-new" size={18} color="#869585" />
      )}
    </TouchableOpacity>
  );
}
