import { useState } from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { AppIcon } from '@/components/ui/AppIcon';
import { FeedbackModal } from '@/components/profile/FeedbackModal';

type ProfileFeedbackCardProps = {
  /** `profiles.id` de la sesión — es lo que exige el `WITH CHECK` de la RLS
   *  de `app_feedback` (`profile_id = mi profile.id`). */
  profileId: string | null | undefined;
};

/**
 * Entrada al canal de feedback de la Beta.
 *
 * Antes abría un Google Form externo con `expo-web-browser`
 * (`lib/feedback.ts`, ya sin uso). Ahora el mensaje se escribe y se manda sin
 * salir de la app: `onPress` sólo abre `FeedbackModal`, que es quien hace el
 * INSERT — acá no queda estado async que manejar.
 */
export function ProfileFeedbackCard({ profileId }: ProfileFeedbackCardProps) {
  const [visible, setVisible] = useState(false);

  return (
    <>
      <TouchableOpacity
        activeOpacity={0.9}
        disabled={!profileId}
        onPress={() => setVisible(true)}
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
        <AppIcon family="material-icons" name="chevron-right" size={20} color="#869585" />
      </TouchableOpacity>

      {profileId && (
        <FeedbackModal visible={visible} onClose={() => setVisible(false)} profileId={profileId} />
      )}
    </>
  );
}
