import { StatCard, StatGrid } from '@/components/ui/StatCard';
import { ProfileStats } from './types';

type ProfileStatsGridProps = {
  stats: ProfileStats;
};

export function ProfileStatsGrid({ stats }: ProfileStatsGridProps) {
  return (
    <StatGrid className="mt-7">
      <StatCard size="lg" label="Partidos" value={String(stats.matchesPlayed)} />
      <StatCard size="lg" label="Goles" value={String(stats.goals)} colorClass="text-brand-primary" />
      <StatCard size="lg" label="MVPs" value={String(stats.mvps)} colorClass="text-brand-gold" />
      <StatCard size="lg" label="Victorias" value={String(stats.wins)} colorClass="text-info-secondary" />
    </StatGrid>
  );
}
