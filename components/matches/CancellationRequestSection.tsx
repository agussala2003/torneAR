import { View, Text, TouchableOpacity } from 'react-native';
import { AppIcon } from '@/components/ui/AppIcon';
import type { CancellationRequestEntry, CancellationReason } from '@/components/matches/types';

const REASON_LABELS: Record<CancellationReason, string> = {
  MUTUO_ACUERDO: 'Mutuo acuerdo',
  FUERZA_MAYOR: 'Fuerza mayor',
  LESION: 'Lesión',
  CAMPO_NO_DISPONIBLE: 'Campo no disponible',
  FALTA_QUORUM: 'Falta de quórum',
  UNILATERAL: 'Unilateral',
  OTRO: 'Otro motivo',
};

interface Props {
  request: CancellationRequestEntry;
  myTeamId: string;
  myRole: 'CAPITAN' | 'SUBCAPITAN' | 'JUGADOR' | 'DIRECTOR_TECNICO' | null;
  opponentName: string;
  onAccept: () => void;
  onReject: () => void;
}

export function CancellationRequestSection({
  request,
  myTeamId,
  myRole,
  opponentName,
  onAccept,
  onReject,
}: Props) {
  const isRequester = request.requestedByTeamId === myTeamId;
  const canRespond = !isRequester && (myRole === 'CAPITAN' || myRole === 'SUBCAPITAN');
  const reasonLabel = REASON_LABELS[request.reason] ?? request.reason;

  return (
    <View className="mt-4 rounded-2xl bg-warning-tertiary/10 p-4">
      <View className="mb-2 flex-row items-center gap-2">
        <AppIcon family="material-community" name="alert-circle-outline" size={18} color="#FABD32" />
        <Text className="font-uiBold text-sm text-warning-tertiary">
          {isRequester ? 'Solicitud de cancelación enviada' : 'Solicitud de cancelación recibida'}
        </Text>
      </View>

      <Text className="font-ui text-sm leading-5 text-neutral-on-surface-variant">
        Motivo: {reasonLabel}
        {request.notes ? ` — "${request.notes}"` : ''}
      </Text>

      {request.isLate && (
        <Text className="font-ui mt-2 text-xs text-warning-tertiary">
          Es una cancelación tardía (menos de 24hs). Si se acepta, {isRequester ? 'tu equipo' : `${opponentName}`} pierde puntos de Fair Play.
        </Text>
      )}

      {isRequester ? (
        <View className="mt-3 rounded-xl bg-surface-container px-4 py-3">
          <Text className="font-ui text-xs text-neutral-on-surface-variant">
            Esperando la respuesta de {opponentName}. El partido sigue en pie hasta que responda.
          </Text>
        </View>
      ) : canRespond ? (
        <View className="mt-3 flex-row gap-2">
          <TouchableOpacity
            onPress={onReject}
            activeOpacity={0.8}
            className="flex-1 items-center rounded-xl border border-danger-error/30 bg-danger-error/10 py-3"
          >
            <Text className="font-uiBold text-sm text-danger-error">Rechazar</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={onAccept}
            activeOpacity={0.8}
            className="flex-1 items-center rounded-xl bg-brand-primary py-3"
          >
            <Text className="font-uiBold text-sm text-[#003914]">Aceptar cancelación</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View className="mt-3 rounded-xl bg-surface-container px-4 py-3">
          <Text className="font-ui text-xs text-neutral-on-surface-variant">
            {opponentName} pidió cancelar el partido. Esperando que tu capitán o subcapitán responda.
          </Text>
        </View>
      )}
    </View>
  );
}
