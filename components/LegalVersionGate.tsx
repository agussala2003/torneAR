import { useState } from 'react';
import { ActivityIndicator, Modal, Text, TouchableOpacity, View } from 'react-native';
import { AppIcon } from '@/components/ui/AppIcon';
import { openLegalDocument } from '@/constants/legal';
import { getGenericSupabaseErrorMessage } from '@/lib/auth-error-messages';
import { recordLegalAcceptance } from '@/lib/auth-data';
import { Logger } from '@/lib/logger';

interface Props {
  /** `true` cuando hay que bloquear: sesión completa + Términos desactualizados. */
  visible: boolean;
}

/**
 * Modal de re-aceptación de Términos y Condiciones.
 *
 * Mismo criterio de no-descartable que `AppUpdateModal`: sin
 * `onRequestClose` que cierre, sin botón de cerrar ni tap-fuera. La decisión
 * de CUÁNDO mostrarse la calcula `needsLegalAcceptance` (lib/auth-data.ts)
 * en `app/_layout.tsx`, comparando `tyc_version` contra
 * `LEGAL_VERSIONS.terms` — este componente sólo resuelve la acción de
 * aceptar, no decide si corresponde mostrarse.
 *
 * "Aceptar" reusa `recordLegalAcceptance()` (ya existía para el alta por
 * Google): dispara `supabase.auth.updateUser()` con la constancia
 * versionada actual. Sin nada más que hacer acá para destrabar la
 * navegación — `updateUser` dispara `USER_UPDATED`, `AuthContext` recoge la
 * metadata nueva sola, y `visible` pasa a `false` porque el `user` con el
 * que se recalcula en `_layout.tsx` ya cambió.
 */
export function LegalVersionGate({ visible }: Props) {
  const [accepting, setAccepting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleAccept() {
    setAccepting(true);
    setErrorMessage(null);

    const { error } = await recordLegalAcceptance();

    setAccepting(false);

    if (error) {
      Logger.error('No se pudo registrar la re-aceptación de Términos', {
        scope: 'LegalVersionGate.handleAccept',
        error,
      });
      setErrorMessage(getGenericSupabaseErrorMessage(error));
    }
  }

  return (
    <Modal visible={visible} animationType="fade" transparent statusBarTranslucent onRequestClose={() => {}}>
      <View className="flex-1 items-center justify-center bg-black/85 px-6">
        <View className="w-full max-w-sm rounded-3xl bg-surface-container p-6">
          <View className="items-center">
            <View className="h-16 w-16 items-center justify-center rounded-full bg-brand-primary/15">
              <AppIcon family="material-community" name="file-document-outline" size={32} color="#53E076" />
            </View>

            <Text className="font-displayBlack mt-4 text-center text-2xl text-neutral-on-surface">
              Actualizamos los Términos
            </Text>

            <Text className="font-ui mt-3 text-center text-sm leading-5 text-neutral-on-surface-variant">
              Actualizamos nuestros Términos y Condiciones. Para seguir usando torneAR necesitás
              aceptar la nueva versión.
            </Text>
          </View>

          <TouchableOpacity
            onPress={() => void openLegalDocument('terms')}
            activeOpacity={0.7}
            className="mt-5 items-center"
          >
            <Text className="font-uiBold text-xs uppercase tracking-wide text-brand-primary underline">
              Leer los Términos actualizados
            </Text>
          </TouchableOpacity>

          {errorMessage && (
            <Text className="font-ui mt-3 text-center text-xs text-danger-error">{errorMessage}</Text>
          )}

          <TouchableOpacity
            onPress={() => void handleAccept()}
            disabled={accepting}
            activeOpacity={0.85}
            className={`mt-5 flex-row items-center justify-center gap-2 rounded-xl bg-brand-primary py-3.5 ${
              accepting ? 'opacity-60' : ''
            }`}
          >
            {accepting ? (
              <ActivityIndicator color="#003914" />
            ) : (
              <>
                <AppIcon family="material-community" name="check-circle-outline" size={18} color="#003914" />
                <Text className="font-uiBold text-sm text-[#003914]">Aceptar nueva versión</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}
