import { View, Text, TouchableOpacity } from 'react-native';
import { canLoadResultFromCard } from '@/lib/match-permissions';
import type { MatchCardEntry } from './types';

interface Props {
  entry: MatchCardEntry;
  myTeamId: string;
  /**
   * R2: `get_my_matches` no devuelve el rol, así que esta tarjeta mostraba
   * "Proponer detalles", "Aceptar", "Rechazar" y "Cargar resultado" a cualquier
   * miembro del equipo. Todas rebotaban server-side (RLS de match_proposals /
   * confirm_match_proposal), pero recién después del tap. El rol se resuelve en
   * la pantalla desde `useTeamStore` —mismo patrón que `canChallenge` en la
   * pestaña Ranking— y baja como prop.
   */
  canManage: boolean;
  /**
   * R6: `DIRECTOR_TECNICO` **también** puede cargar el resultado, pero no
   * coordinar. Por eso son dos flags y no uno: `canManage` gatea la rama
   * PENDIENTE (proponer / aceptar / rechazar / cancelar propuesta) y `isStaff`
   * gatea la rama EN_VIVO. Colapsarlos en uno le daría al DT la coordinación
   * del partido, que es justo lo que la decisión de producto excluye.
   */
  isStaff: boolean;
  onProposePress?: (matchId: string) => void;
  onAcceptProposal?: (proposalId: string, matchId: string) => void;
  onRejectProposal?: (proposalId: string, matchId: string) => void;
  onCancelProposal?: (proposalId: string, matchId: string) => void;
  onLoadResult?: (matchId: string) => void;
}

/** Línea informativa que reemplaza a los botones para el resto del plantel. */
function PassiveHint({ label }: { label: string }) {
  return (
    <View className="mt-3 rounded-xl bg-surface-high/40 px-4 py-2.5">
      <Text
        className="font-ui text-center text-[11px] text-neutral-outline"
        numberOfLines={1}
        ellipsizeMode="tail"
      >
        {label}
      </Text>
    </View>
  );
}

export function MatchCardFooter({
  entry,
  myTeamId,
  canManage,
  isStaff,
  onProposePress,
  onAcceptProposal,
  onRejectProposal,
  onCancelProposal,
  onLoadResult,
}: Props) {
  const { id, status, activeProposal } = entry;

  if (status === 'PENDIENTE') {
    // El resto del plantel ve en qué anda el partido, pero no acciones que no
    // puede ejecutar. El detalle explica el resto.
    if (!canManage) {
      return (
        <PassiveHint
          label={activeProposal ? 'Propuesta pendiente de respuesta' : 'Falta coordinar los detalles'}
        />
      );
    }

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
    // D10: la regla completa vive en lib/match-permissions.ts. Acá se resuelve
    // con `isResultLoader = false` porque la lista no sabe quién hizo el
    // check-in (dato exclusivo de get_match_detail): se ofrece el atajo a quien
    // seguro puede, y el resto lo encuentra dentro del detalle. Lo que cambia
    // respecto de antes es que ahora también mira si mi equipo YA cargó — ese
    // era el botón que se seguía ofreciendo después de haber cargado.
    if (!canLoadResultFromCard(entry, myTeamId, isStaff)) return null;

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
