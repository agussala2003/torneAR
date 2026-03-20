import { Text, View } from 'react-native';
import { ProfileStats } from './types';

type StatCardProps = {
  label: string;
  value: number;
  colorClass?: string;
};

function StatCard({ label, value, colorClass = 'text-neutral-on-surface' }: StatCardProps) {
  return (
    <View className="items-center justify-center rounded-xl border border-neutral-outline-variant/10 bg-surface-low p-5">
      <Text className={`text-5xl font-black tracking-tighter ${colorClass}`}>{value}</Text>
      <Text className="mt-1 text-[10px] font-bold uppercase tracking-widest text-neutral-on-surface-variant">{label}</Text>
    </View>
  );
}

type ProfileStatsGridProps = {
  stats: ProfileStats;
};

export function ProfileStatsGrid({ stats }: ProfileStatsGridProps) {
  return (
    <View className="mt-7 grid grid-cols-2 gap-3">
      <StatCard label="Partidos" value={stats.matchesPlayed} />
      <StatCard label="Goles" value={stats.goals} colorClass="text-brand-primary" />
      <StatCard label="MVPs" value={stats.mvps} colorClass="text-warning-tertiary" />
      <StatCard label="Victorias" value={stats.wins} colorClass="text-info-secondary" />
    </View>
  );
}
