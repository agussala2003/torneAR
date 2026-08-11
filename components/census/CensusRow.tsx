import { View, Text } from 'react-native';
import { ClubCrest } from './ClubCrest';
import type { CensusEntry } from '@/lib/census-data';

interface Props {
  entry: CensusEntry;
  /**
   * Porcentaje del club más votado. Es el que define el 100% de la barra:
   * escalar contra él hace visible la diferencia entre el 2º y el 3º, que
   * contra un eje de 0-100 quedarían como dos tiras casi idénticas.
   */
  leaderPercentage: number;
  /** El cuadro del usuario que está mirando: se resalta como en el ranking. */
  isMine: boolean;
}

/** Oro / plata / bronce para el podio; el resto va en el gris de siempre. */
const PODIUM_COLOR: Record<number, string> = {
  1: '#FABD32',
  2: '#BCCBB9',
  3: '#E0A46A',
};

export function CensusRow({ entry, leaderPercentage, isMine }: Props) {
  const positionColor = PODIUM_COLOR[entry.position] ?? '#869585';
  // `leaderPercentage` puede ser 0 en una base recién creada: sin el guard, la
  // división da NaN y la barra desaparece.
  const barWidth = leaderPercentage > 0 ? (entry.percentage / leaderPercentage) * 100 : 0;

  return (
    <View
      className={`mb-2 flex-row items-center gap-3 rounded-2xl px-3 py-3 ${
        isMine ? 'border border-brand-primary/40 bg-brand-primary/10' : 'bg-surface-container'
      }`}
    >
      <Text
        className="w-6 text-center font-displayBlack text-base"
        style={{ color: positionColor }}
      >
        {entry.position}
      </Text>

      <ClubCrest logoUrl={entry.logoUrl} teamName={entry.teamName} size={40} />

      <View className="flex-1">
        <Text
          className={`font-uiBold text-[14px] ${
            isMine ? 'text-brand-primary' : 'text-neutral-on-surface'
          }`}
          numberOfLines={1}
        >
          {entry.teamName}
        </Text>

        {/* Barra proporcional: el número solo no transmite la brecha. */}
        <View className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface-high">
          <View
            className={`h-full rounded-full ${isMine ? 'bg-brand-primary' : 'bg-brand-primary/45'}`}
            style={{ width: `${barWidth}%` }}
          />
        </View>
      </View>

      <View className="items-end">
        <Text className="font-displayBlack text-lg text-neutral-on-surface">
          {entry.percentage.toFixed(1)}%
        </Text>
        <Text className="font-ui text-[10px] uppercase tracking-wider text-neutral-outline">
          {entry.fans} {entry.fans === 1 ? 'hincha' : 'hinchas'}
        </Text>
      </View>
    </View>
  );
}
