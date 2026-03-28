import { View, Text } from 'react-native';
import type { MatchCardEntry } from './types';

interface Props {
  entry: MatchCardEntry;
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  const h = d.getHours().toString().padStart(2, '0');
  const m = d.getMinutes().toString().padStart(2, '0');
  return `${h}:${m}`;
}

export function MatchCardCenter({ entry }: Props) {
  const { status, scheduledAt, resultTeamA, resultTeamB } = entry;

  if (status === 'EN_VIVO') {
    const scoreA = resultTeamA !== null ? resultTeamA : '?';
    const scoreB = resultTeamB !== null ? resultTeamB : '?';
    return (
      <View className="items-center gap-1">
        <Text className="font-displayBlack text-[22px] leading-none text-danger-error">
          {scoreA} – {scoreB}
        </Text>
        <View className="flex-row items-center gap-1.5">
          <View className="h-1.5 w-1.5 rounded-full bg-danger-error" />
          <Text className="font-uiBold text-[9px] uppercase tracking-wide text-danger-error">
            En vivo
          </Text>
        </View>
      </View>
    );
  }

  if (status === 'FINALIZADO' || status === 'EN_DISPUTA') {
    return (
      <Text className="font-displayBlack text-[22px] leading-none text-neutral-on-surface">
        {resultTeamA ?? '–'} – {resultTeamB ?? '–'}
      </Text>
    );
  }

  if (status === 'WO_A' || status === 'WO_B') {
    return (
      <Text className="font-displayBlack text-[16px] leading-none text-neutral-on-surface-variant">
        W.O.
      </Text>
    );
  }

  if (status === 'CANCELADO') {
    return (
      <Text className="font-displayBlack text-[20px] leading-none text-neutral-outline/50">
        – –
      </Text>
    );
  }

  // PENDIENTE or CONFIRMADO
  if (scheduledAt) {
    return (
      <Text className="font-displayBlack text-[22px] leading-none text-neutral-on-surface">
        {formatTime(scheduledAt)}
      </Text>
    );
  }

  return (
    <Text className="font-displayBlack text-[20px] leading-none text-neutral-outline/50">
      – –
    </Text>
  );
}
