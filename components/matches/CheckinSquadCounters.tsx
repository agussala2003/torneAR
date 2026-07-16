import { View, Text } from 'react-native';
import type { FormatRulesEntry } from '@/components/matches/types';

interface Props {
  rules: FormatRulesEntry;
  starters: number;
  substitutes: number;
}

const FORMAT_LABELS: Record<string, string> = {
  FUTBOL_5: 'Fútbol 5',
  FUTBOL_6: 'Fútbol 6',
  FUTBOL_7: 'Fútbol 7',
  FUTBOL_8: 'Fútbol 8',
  FUTBOL_9: 'Fútbol 9',
  FUTBOL_11: 'Fútbol 11',
};

function CounterBox({
  label,
  value,
  max,
  tone,
  helper,
}: {
  label: string;
  value: number;
  max: number;
  tone: 'ok' | 'warn' | 'error';
  helper: string;
}) {
  const toneText =
    tone === 'ok' ? 'text-brand-primary' : tone === 'warn' ? 'text-warning-tertiary' : 'text-danger-error';
  const toneBorder =
    tone === 'ok' ? 'border-brand-primary/30' : tone === 'warn' ? 'border-warning-tertiary/30' : 'border-danger-error/40';

  return (
    <View className={`flex-1 rounded-xl border bg-surface-high px-3 py-2 ${toneBorder}`}>
      <Text className="font-ui text-[10px] uppercase tracking-widest text-neutral-on-surface-variant">
        {label}
      </Text>
      <Text className={`font-displayBlack text-xl ${toneText}`}>
        {value}
        <Text className="font-display text-sm text-neutral-on-surface-variant"> / {max}</Text>
      </Text>
      <Text className={`font-ui text-[10px] ${toneText}`} numberOfLines={1}>
        {helper}
      </Text>
    </View>
  );
}

// Header pegadizo de la pantalla de convocatoria: lee las reglas del formato
// y muestra en vivo los cupos de titulares y convocados totales.
export function CheckinSquadCounters({ rules, starters, substitutes }: Props) {
  const total = starters + substitutes;

  const startersTone: 'ok' | 'warn' | 'error' =
    starters > rules.playersOnField ? 'error' : starters < rules.minPlayersToStart ? 'warn' : 'ok';
  const startersHelper =
    starters > rules.playersOnField
      ? `Máximo ${rules.playersOnField} en cancha`
      : starters < rules.minPlayersToStart
        ? `Mínimo ${rules.minPlayersToStart} para presentar`
        : 'Cupo cubierto';

  const totalTone: 'ok' | 'warn' | 'error' = total > rules.maxSquadSize ? 'error' : 'ok';
  const totalHelper =
    total > rules.maxSquadSize ? `Máximo ${rules.maxSquadSize} convocados` : `${substitutes} al banco`;

  return (
    <View className="bg-surface-base pb-3">
      <View className="rounded-2xl bg-surface-container p-3">
        <Text className="font-uiBold mb-2 text-xs uppercase tracking-widest text-neutral-on-surface-variant">
          {FORMAT_LABELS[rules.format] ?? rules.format} · Lista de buena fe
        </Text>
        <View className="flex-row gap-2">
          <CounterBox
            label="Titulares"
            value={starters}
            max={rules.playersOnField}
            tone={startersTone}
            helper={startersHelper}
          />
          <CounterBox
            label="Convocados"
            value={total}
            max={rules.maxSquadSize}
            tone={totalTone}
            helper={totalHelper}
          />
        </View>
      </View>
    </View>
  );
}
