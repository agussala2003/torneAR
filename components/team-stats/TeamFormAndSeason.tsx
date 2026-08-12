import { Text, View } from 'react-native';
import { StatCard, StatGrid } from '@/components/ui/StatCard';
import type { FormResult, TeamSeasonRecord } from './types';

function FormBadge({ result }: { result: FormResult }) {
  if (result === 'V') {
    return (
      <View className="h-9 w-9 items-center justify-center rounded-lg bg-brand-primary">
        <Text className="font-displayBlack text-base text-[#003914]">V</Text>
      </View>
    );
  }
  if (result === 'E') {
    return (
      <View className="h-9 w-9 items-center justify-center rounded-lg bg-warning-tertiary">
        <Text className="font-displayBlack text-base text-[#412D00]">E</Text>
      </View>
    );
  }
  return (
    <View className="h-9 w-9 items-center justify-center rounded-lg bg-danger-error/75">
      <Text className="font-displayBlack text-base text-[#690005]">D</Text>
    </View>
  );
}

type TeamFormAndSeasonProps = {
  form: FormResult[];
  season: TeamSeasonRecord;
};

export function TeamFormAndSeason({ form, season }: TeamFormAndSeasonProps) {
  return (
    <View className="mt-6">
      {/* Form strip */}
      <Text className="font-display mb-3 px-1 text-sm uppercase tracking-wider text-neutral-on-surface-variant">
        Forma reciente
      </Text>
      {form.length === 0 ? (
        <View className="rounded-xl bg-surface-low px-4 py-4">
          <Text className="font-ui text-sm text-neutral-on-surface-variant">
            Sin partidos finalizados aún.
          </Text>
        </View>
      ) : (
        <View className="flex-row gap-2 rounded-xl bg-surface-low px-4 py-4">
          {form.map((result, i) => (
            <FormBadge key={i} result={result} />
          ))}
        </View>
      )}

      {/* Season record */}
      <Text className="font-display mb-3 mt-6 px-1 text-sm uppercase tracking-wider text-neutral-on-surface-variant">
        Temporada
      </Text>
      {/* Una metrica por card, igual que la grilla del perfil del jugador. Los
          promedios y los PJ eran renglones chicos dentro de las cards de goles:
          ahi no se leian como datos propios y rompian la simetria con el resto
          de la grilla. */}
      <StatGrid>
        <StatCard label="Partidos" value={String(season.played)} />
        <StatCard label="Victorias" value={String(season.wins)} colorClass="text-brand-primary" />
        <StatCard label="Empates" value={String(season.draws)} colorClass="text-warning-tertiary" />
        <StatCard label="Derrotas" value={String(season.losses)} colorClass="text-danger-error" />
        <StatCard label="% Victorias" value={season.winPercent} colorClass="text-info-secondary" />
        <StatCard label="Goles a favor" value={String(season.goalsFor)} />
        <StatCard label="Goles en contra" value={String(season.goalsAgainst)} />
        <StatCard
          label="Dif. de gol"
          value={season.goalDiff > 0 ? `+${season.goalDiff}` : String(season.goalDiff)}
          colorClass={
            season.goalDiff > 0
              ? 'text-brand-primary'
              : season.goalDiff < 0
                ? 'text-danger-error'
                : 'text-neutral-on-surface'
          }
        />
        <StatCard label="Prom. a favor" value={season.avgGoals} colorClass="text-brand-primary" />
        <StatCard
          label="Prom. en contra"
          value={season.avgGoalsAgainst}
          colorClass="text-danger-error"
        />
      </StatGrid>
    </View>
  );
}
