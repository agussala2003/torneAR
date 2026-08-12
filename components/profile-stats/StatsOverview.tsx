import { Text, View } from 'react-native';
import { StatCard, StatGrid } from '@/components/ui/StatCard';
import type { ProfileStatsSummary } from './types';

type StatsOverviewProps = {
  stats: ProfileStatsSummary;
};

export function StatsOverview({ stats }: StatsOverviewProps) {
  return (
    <View className="mt-6">
      <Text className="font-display mb-3 px-1 text-sm uppercase tracking-wider text-neutral-on-surface-variant">
        Estadísticas
      </Text>
      <StatGrid>
        <StatCard label="Partidos" value={String(stats.matchesPlayed)} />
        <StatCard label="Goles" value={String(stats.goals)} colorClass="text-brand-primary" />
        <StatCard label="MVPs" value={String(stats.mvps)} colorClass="text-brand-gold" />
        <StatCard label="Victorias" value={String(stats.wins)} colorClass="text-info-secondary" />
        <StatCard label="Prom. Goles" value={stats.avgGoals} colorClass="text-brand-primary" />
        <StatCard label="% Victorias" value={stats.winPercent} colorClass="text-info-secondary" />
      </StatGrid>
    </View>
  );
}
