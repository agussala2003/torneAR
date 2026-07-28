import { View, Text, TouchableOpacity } from 'react-native';
import type { MatchCardEntry } from './types';

interface Props {
  entry: MatchCardEntry;
  myTeamId: string;
  onProposePress?: (matchId: string) => void;
  onAcceptProposal?: (proposalId: string, matchId: string) => void;
  onRejectProposal?: (proposalId: string, matchId: string) => void;
  onCancelProposal?: (proposalId: string, matchId: string) => void;
  onLoadResult?: (matchId: string) => void;
}

export function MatchCardFooter({
  entry,
  myTeamId,
  onProposePress,
  onAcceptProposal,
  onRejectProposal,
  onCancelProposal,
  onLoadResult,
}: Props) {
  const { id, status, activeProposal } = entry;

  if (status === 'PENDIENTE') {
    if (!activeProposal) {
      return (
        <TouchableOpacity
          activeOpacity={0.8}
          onPress={() => onProposePress?.(id)}
          className="mt-3 items-center rounded-xl border border-info-secondary/40 py-2.5"
        >
          <Text className="font-uiBold text-[12px] text-info-secondary">Proponer detalles</Text>
        </TouchableOpacity>
      );
    }

    const isFromMe = activeProposal.fromTeamId === myTeamId;
    if (isFromMe) {
      // El texto va en un contenedor `flex-1 minWidth:0` y "Cancelar" en uno
      // `shrink-0`: sin eso, los 38 caracteres del mensaje reclamaban su ancho
      // intrínseco y empujaban el botón fuera de la tarjeta en pantallas
      // angostas, dejándolo intocable. `numberOfLines` sin ancho acotado no
      // alcanza — el Text tiene que poder encoger para que el truncado ocurra.
      return (
        <View className="mt-3 flex-row items-center gap-2 rounded-xl bg-info-secondary/10 px-4 py-2.5">
          <View className="flex-1" style={{ minWidth: 0 }}>
            <Text
              className="font-uiBold text-[12px] text-info-secondary/70"
              numberOfLines={1}
              ellipsizeMode="tail"
            >
              Propuesta enviada · esperando respuesta
            </Text>
          </View>
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={() => onCancelProposal?.(activeProposal.id, id)}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            className="shrink-0"
          >
            <Text className="font-uiBold text-[11px] text-danger-error">Cancelar</Text>
          </TouchableOpacity>
        </View>
      );
    }

    // Opponent's proposal — show accept/reject
    return (
      <View className="mt-3 flex-row gap-2">
        <TouchableOpacity
          activeOpacity={0.8}
          onPress={() => onRejectProposal?.(activeProposal.id, id)}
          className="flex-1 items-center rounded-xl border border-danger-error/30 py-2.5"
        >
          <Text className="font-uiBold text-[12px] text-danger-error">Rechazar</Text>
        </TouchableOpacity>
        <TouchableOpacity
          activeOpacity={0.8}
          onPress={() => onAcceptProposal?.(activeProposal.id, id)}
          className="flex-1 items-center rounded-xl bg-brand-primary py-2.5"
        >
          <Text className="font-uiBold text-[12px] text-surface-base">✓ Aceptar</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (status === 'EN_VIVO') {
    return (
      <TouchableOpacity
        activeOpacity={0.8}
        onPress={() => onLoadResult?.(id)}
        className="mt-3 items-center rounded-xl border border-danger-error/40 py-2.5"
      >
        <Text className="font-uiBold text-[12px] text-danger-error">→ Cargar resultado</Text>
      </TouchableOpacity>
    );
  }

  return null;
}
