import { useState } from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { AppIcon } from '@/components/ui/AppIcon';
import { SafeAreaBottomSheet } from '@/components/ui/SafeAreaBottomSheet';
import { useCustomAlert } from '@/hooks/useCustomAlert';
import { getGenericSupabaseErrorMessage } from '@/lib/auth-error-messages';
import { Logger } from '@/lib/logger';
import { submitContentReport, type ReportEntityType } from '@/lib/reports-data';

interface Props {
  visible: boolean;
  onClose: () => void;
  /** Perfil o partido que se está denunciando. */
  entityType: ReportEntityType;
  entityId: string;
  /** `profiles.id` de quien denuncia — lo exige el `WITH CHECK` de la RLS. */
  reporterId: string;
}

/** Mismas tres razones para USER y MATCH: no hay hoy un motivo específico
 *  de un tipo de entidad que no aplique igual al otro. */
const REASONS = [
  'Contenido inapropiado',
  'Comportamiento antideportivo',
  'Spam',
] as const;

/**
 * Modal de denuncia. Deliberadamente más simple que `CancellationModal` o
 * `WoModal` (sin campo de notas): elegir una razón ES el envío, no hay un
 * segundo paso de "confirmar" — "modal sencillo" en el pedido original.
 */
export function ReportModal({ visible, onClose, entityType, entityId, reporterId }: Props) {
  const [submittingReason, setSubmittingReason] = useState<string | null>(null);
  const { showAlert, AlertComponent } = useCustomAlert();

  async function handleSelectReason(reason: string) {
    if (submittingReason) return;
    setSubmittingReason(reason);
    try {
      await submitContentReport({ reporterId, entityType, entityId, reason });
      Logger.info('Denuncia enviada', {
        scope: 'ReportModal.handleSelectReason',
        entityType,
        entityId,
        reason,
      });
      onClose();
      // Después de cerrar el sheet: mismo motivo que CancellationModal, un
      // alert propio DENTRO del <Modal> quedaría detrás al desmontarse junto
      // con el sheet.
      showAlert('Denuncia enviada', 'Gracias por avisarnos. Un administrador la va a revisar.');
    } catch (error) {
      Logger.error('No se pudo enviar la denuncia', {
        scope: 'ReportModal.handleSelectReason',
        entityType,
        entityId,
        reason,
        error,
      });
      showAlert(
        'No se pudo enviar',
        getGenericSupabaseErrorMessage(error, 'No pudimos registrar la denuncia. Intentá de nuevo.'),
      );
    } finally {
      setSubmittingReason(null);
    }
  }

  return (
    <SafeAreaBottomSheet visible={visible} onClose={onClose} maxHeight="70%" overlay={AlertComponent}>
      <View className="flex-row items-center justify-between px-5 py-4">
        <Text className="font-uiBold text-lg text-neutral-on-surface">Denunciar</Text>
        <TouchableOpacity onPress={onClose} activeOpacity={0.7} disabled={!!submittingReason}>
          <AppIcon family="material-community" name="close" size={22} color="#869585" />
        </TouchableOpacity>
      </View>

      <View className="px-5 pb-2">
        <Text className="font-ui mb-4 text-sm text-neutral-on-surface-variant">
          {entityType === 'USER'
            ? '¿Por qué querés denunciar este perfil?'
            : '¿Por qué querés denunciar este partido?'}
        </Text>

        <View className="gap-2">
          {REASONS.map((reason) => (
            <TouchableOpacity
              key={reason}
              onPress={() => void handleSelectReason(reason)}
              disabled={!!submittingReason}
              activeOpacity={0.8}
              className={`flex-row items-center justify-between rounded-xl bg-surface-high p-4 ${
                submittingReason && submittingReason !== reason ? 'opacity-40' : ''
              }`}
            >
              <Text className="font-uiBold text-sm text-neutral-on-surface">{reason}</Text>
              {submittingReason === reason ? (
                <AppIcon family="material-community" name="progress-clock" size={18} color="#869585" />
              ) : (
                <AppIcon family="material-icons" name="chevron-right" size={20} color="#869585" />
              )}
            </TouchableOpacity>
          ))}
        </View>
      </View>
    </SafeAreaBottomSheet>
  );
}
