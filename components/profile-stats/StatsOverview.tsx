import { Text, View } from 'react-native';
import type { ProfileStatsSummary } from './types';

type StatCardProps = {
  label: string;
  value: string;
  colorClass?: string;
};

function StatCard({ label, value, colorClass = 'text-neutral-on-surface' }: StatCardProps) {
  return (
    <View className="flex-1 items-center justify-center rounded-xl bg-surface-low p-4">
      <Text
        className={`font-displayBlack text-4xl tracking-tighter ${colorClass}`}
        style={{ fontVariant: ['tabular-nums'] }}
      >
        {value}
      </Text>
      <Text className="font-uiBold mt-1 text-center text-[10px] uppercase tracking-widest text-neutral-on-surface-variant">
        {label}
      </Text>
    </View>
  );
}

type StatsOverviewProps = {
  stats: ProfileStatsSummary;
};

export function StatsOverview({ stats }: StatsOverviewProps) {
  return (
    <View className="mt-6">
      <Text className="font-display mb-3 px-1 text-sm uppercase tracking-wider text-neutral-on-surface-variant">
        Estadísticas
      </Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
        <View style={{ width: '48.5%' }}>
          <StatCard label="Partidos" value={String(stats.matchesPlayed)} />
        </View>
        <View style={{ width: '48.5%' }}>
          <StatCard label="Goles" value={String(stats.goals)} colorClass="text-brand-primary" />
        </View>
        <View style={{ width: '48.5%' }}>
          <StatCard label="MVPs" value={String(stats.mvps)} colorClass="text-warning-tertiary" />
        </View>
        <View style={{ width: '48.5%' }}>
          <StatCard label="Victorias" value={String(stats.wins)} colorClass="text-info-secondary" />
        </View>
        <View style={{ width: '48.5%' }}>
          <StatCard label="Prom. Goles" value={stats.avgGoals} colorClass="text-brand-primary" />
        </View>
        <View style={{ width: '48.5%' }}>
          <StatCard label="% Victorias" value={stats.winPercent} colorClass="text-info-secondary" />
        </View>
      </View>
    </View>
  );
}
