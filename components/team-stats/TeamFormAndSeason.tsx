import { Text, View } from 'react-native';
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
  const totalMatches = season.wins + season.draws + season.losses;

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
      <View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
          <View style={{ width: '48.5%' }} className="rounded-xl bg-surface-high p-3">
            <Text className="font-ui text-[11px] uppercase tracking-wide text-neutral-on-surface-variant">
              Victorias
            </Text>
            <Text
              className="font-displayBlack mt-1 text-2xl text-brand-primary"
              style={{ fontVariant: ['tabular-nums'] }}
            >
              {season.wins}
            </Text>
          </View>
          <View style={{ width: '48.5%' }} className="rounded-xl bg-surface-high p-3">
            <Text className="font-ui text-[11px] uppercase tracking-wide text-neutral-on-surface-variant">
              Empates
            </Text>
            <Text
              className="font-displayBlack mt-1 text-2xl text-warning-tertiary"
              style={{ fontVariant: ['tabular-nums'] }}
            >
              {season.draws}
            </Text>
          </View>
          <View style={{ width: '48.5%' }} className="rounded-xl bg-surface-high p-3">
            <Text className="font-ui text-[11px] uppercase tracking-wide text-neutral-on-surface-variant">
              Derrotas
            </Text>
            <Text
              className="font-displayBlack mt-1 text-2xl text-danger-error"
              style={{ fontVariant: ['tabular-nums'] }}
            >
              {season.losses}
            </Text>
          </View>
          <View style={{ width: '48.5%' }} className="rounded-xl bg-surface-high p-3">
            <Text className="font-ui text-[11px] uppercase tracking-wide text-neutral-on-surface-variant">
              % Victorias
            </Text>
            <Text
              className="font-displayBlack mt-1 text-2xl text-info-secondary"
              style={{ fontVariant: ['tabular-nums'] }}
            >
              {season.winPercent}
            </Text>
          </View>
          <View style={{ width: '48.5%' }} className="rounded-xl bg-surface-high p-3">
            <Text className="font-ui text-[11px] uppercase tracking-wide text-neutral-on-surface-variant">
              Goles a favor
            </Text>
            <Text
              className="font-displayBlack mt-1 text-2xl text-neutral-on-surface"
              style={{ fontVariant: ['tabular-nums'] }}
            >
              {season.goalsFor}
            </Text>
            <Text className="font-ui mt-0.5 text-[10px] text-neutral-on-surface-variant">
              Prom. {season.avgGoals} / PJ
            </Text>
          </View>
          <View style={{ width: '48.5%' }} className="rounded-xl bg-surface-high p-3">
            <Text className="font-ui text-[11px] uppercase tracking-wide text-neutral-on-surface-variant">
              Goles en contra
            </Text>
            <Text
              className="font-displayBlack mt-1 text-2xl text-neutral-on-surface"
              style={{ fontVariant: ['tabular-nums'] }}
            >
              {season.goalsAgainst}
            </Text>
            <Text className="font-ui mt-0.5 text-[10px] text-neutral-on-surface-variant">
              {totalMatches} PJ en temporada
            </Text>
          </View>
        </View>
      </View>
    </View>
  );
}
