import { Text, View } from 'react-native';
import { ProfileStats } from './types';

type StatCardProps = {
  label: string;
  value: number;
  colorClass?: string;
};

function StatCard({ label, value, colorClass = 'text-neutral-on-surface' }: StatCardProps) {
  return (
    <View className="items-center justify-center rounded-xl bg-surface-low p-5">
      {/* text-5xl en una card al 48% del ancho ya raspa con 3 cifras (150 goles
          del usuario `goleador`) y rompe con 4. adjustsFontSizeToFit reduce la
          tipografía sólo cuando hace falta, así que los valores chicos siguen
          viéndose grandes. */}
      <Text
        className={`font-displayBlack text-5xl tracking-tighter ${colorClass}`}
        style={{ fontVariant: ['tabular-nums'] }}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.5}
      >
        {value}
      </Text>
      <Text
        className="font-uiBold mt-1 text-[10px] uppercase tracking-widest text-neutral-on-surface-variant"
        numberOfLines={1}
      >
        {label}
      </Text>
    </View>
  );
}

type ProfileStatsGridProps = {
  stats: ProfileStats;
};

export function ProfileStatsGrid({ stats }: ProfileStatsGridProps) {
  return (
    <View style={{ display: 'flex', flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 28 }}>
      <View style={{ width: '48%' }}>
        <StatCard label="Partidos" value={stats.matchesPlayed} />
      </View>
      <View style={{ width: '48%' }}>
        <StatCard label="Goles" value={stats.goals} colorClass="text-brand-primary" />
      </View>
      <View style={{ width: '48%' }}>
        <StatCard label="MVPs" value={stats.mvps} colorClass="text-warning-tertiary" />
      </View>
      <View style={{ width: '48%' }}>
        <StatCard label="Victorias" value={stats.wins} colorClass="text-info-secondary" />
      </View>
    </View>
  );
}
