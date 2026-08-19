import { useState } from 'react';
import { Text, TextInput, TouchableOpacity, View } from 'react-native';
import { AppIcon } from '@/components/ui/AppIcon';
import { SafeAreaBottomSheet } from '@/components/ui/SafeAreaBottomSheet';
import { useCustomAlert } from '@/hooks/useCustomAlert';
import { getGenericSupabaseErrorMessage } from '@/lib/auth-error-messages';
import { submitAppFeedback } from '@/lib/feedback-data';
import { Logger } from '@/lib/logger';

/** Mismo techo que la columna `app_feedback.message` (migración
 *  20260818140000): si el usuario lo pasa, mejor que se entere acá con el
 *  contador que con un error de Postgres al enviar. */
const MAX_LENGTH = 2000;

interface Props {
  visible: boolean;
  onClose: () => void;
  profileId: string;
}

/**
 * Reemplaza al Google Form externo (`lib/feedback.ts` / `WebBrowser`): el
 * mensaje se manda directo a `app_feedback`, sin salir de la app.
 */
export function FeedbackModal({ visible, onClose, profileId }: Props) {
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const { showAlert, AlertComponent } = useCustomAlert();

  const trimmed = message.trim();
  const canSubmit = trimmed.length > 0 && trimmed.length <= MAX_LENGTH;

  function handleClose() {
    if (submitting) return;
    onClose();
  }

  async function handleSubmit() {
    if (!canSubmit || submitting) return;
    setSubmitting(true);
    try {
      await submitAppFeedback(profileId, trimmed);
      Logger.info('Feedback enviado', { scope: 'FeedbackModal.handleSubmit', profileId });
      setMessage('');
      onClose();
      // Fuera del <Modal>: uno adentro se desmontaría junto con el sheet al
      // cerrarse (mismo motivo que CancellationModal/ReportModal).
      showAlert('¡Gracias!', 'Recibimos tu mensaje. Lo vamos a leer.');
    } catch (error) {
      Logger.error('No se pudo enviar el feedback', {
        scope: 'FeedbackModal.handleSubmit',
        profileId,
        error,
      });
      showAlert(
        'No se pudo enviar',
        getGenericSupabaseErrorMessage(error, 'No pudimos guardar tu mensaje. Intentá de nuevo.'),
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <SafeAreaBottomSheet
      visible={visible}
      onClose={handleClose}
      maxHeight="80%"
      avoidKeyboard
      overlay={AlertComponent}
    >
      <View className="flex-row items-center justify-between px-5 py-4">
        <Text className="font-uiBold text-lg text-neutral-on-surface">
          Sugerencias o reportar un error
        </Text>
        <TouchableOpacity onPress={handleClose} activeOpacity={0.7} disabled={submitting}>
          <AppIcon family="material-community" name="close" size={22} color="#869585" />
        </TouchableOpacity>
      </View>

      <View className="px-5 pb-2">
        <Text className="font-ui mb-4 text-sm text-neutral-on-surface-variant">
          Estamos en Beta: contanos qué mejorarías o qué se rompió.
        </Text>

        <TextInput
          value={message}
          onChangeText={setMessage}
          multiline
          numberOfLines={6}
          maxLength={MAX_LENGTH}
          placeholder="Escribí acá tu sugerencia o el problema que encontraste..."
          placeholderTextColor="#869585"
          className="mb-2 rounded-xl bg-surface-high px-4 py-3 text-sm text-neutral-on-surface"
          style={{ height: 140, textAlignVertical: 'top' }}
        />
        <Text className="font-ui mb-4 text-right text-xs text-neutral-outline">
          {trimmed.length}/{MAX_LENGTH}
        </Text>

        <TouchableOpacity
          onPress={() => void handleSubmit()}
          disabled={!canSubmit || submitting}
          activeOpacity={0.8}
          className={`rounded-xl py-3.5 ${canSubmit ? 'bg-brand-primary' : 'bg-surface-high'}`}
        >
          <Text
            className={`font-uiBold text-center text-sm ${
              canSubmit ? 'text-[#003914]' : 'text-neutral-outline'
            }`}
          >
            {submitting ? 'Enviando...' : 'Enviar'}
          </Text>
        </TouchableOpacity>
      </View>
    </SafeAreaBottomSheet>
  );
}
