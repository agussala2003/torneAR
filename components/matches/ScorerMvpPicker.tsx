import { View, Text, TouchableOpacity } from 'react-native';
import { AppIcon } from '@/components/ui/AppIcon';
import type { MatchParticipantEntry } from '@/components/matches/types';

interface ScorerMvpPickerProps {
  participants: MatchParticipantEntry[];
  scorers: Record<string, number>;                 // profileId -> goles
  onScorerGoalsChange: (profileId: string, goals: number) => void;
  mvpId: string | null;
  onMvpChange: (profileId: string | null) => void;
  goalCap?: number;                                 // tope total de goles (WO = 3). Sin tope si undefined.
  scorersLabel?: string;
  mvpLabel?: string;
}

/**
 * Selector reutilizable de goleadores (stepper de goles por jugador) + MVP (chips).
 * Dumb component: recibe todo por props, no hace fetch. Usado por ResultModal y WoModal.
 */
export function ScorerMvpPicker({
  participants,
  scorers,
  onScorerGoalsChange,
  mvpId,
  onMvpChange,
  goalCap,
  scorersLabel = 'Goleadores (opcional)',
  mvpLabel = 'MVP (opcional)',
}: ScorerMvpPickerProps) {
  if (participants.length === 0) return null;

  const totalGoals = Object.values(scorers).reduce((sum, g) => sum + g, 0);
  const capReached = goalCap !== undefined && totalGoals >= goalCap;

  function increment(profileId: string) {
    if (capReached) return;
    onScorerGoalsChange(profileId, (scorers[profileId] ?? 0) + 1);
  }
  function decrement(profileId: string) {
    onScorerGoalsChange(profileId, Math.max(0, (scorers[profileId] ?? 0) - 1));
  }

  return (
    <>
      {/* Goleadores */}
      <View className="mb-2 flex-row items-center justify-between">
        <Text className="font-ui text-xs uppercase tracking-widest text-neutral-outline">
          {scorersLabel}
        </Text>
        {goalCap !== undefined && (
          <Text className="font-uiBold text-xs text-neutral-on-surface-variant">
            {totalGoals}/{goalCap}
          </Text>
        )}
      </View>
      <View className="mb-4 gap-2">
        {participants.map((p) => (
          <View
            key={p.profileId}
            className="flex-row items-center justify-between rounded-xl bg-surface-high px-4 py-2"
          >
            <Text className="font-ui flex-1 text-sm text-neutral-on-surface">{p.fullName}</Text>
            <View className="flex-row items-center gap-3">
              <TouchableOpacity
                onPress={() => decrement(p.profileId)}
                activeOpacity={0.7}
                className="h-7 w-7 items-center justify-center rounded-full bg-surface-container"
              >
                <AppIcon family="material-community" name="minus" size={14} color="#BCCBB9" />
              </TouchableOpacity>
              <Text className="font-uiBold w-5 text-center text-sm text-neutral-on-surface">
                {scorers[p.profileId] ?? 0}
              </Text>
              <TouchableOpacity
                onPress={() => increment(p.profileId)}
                disabled={capReached}
                activeOpacity={0.7}
                className={`h-7 w-7 items-center justify-center rounded-full ${
                  capReached ? 'bg-brand-primary/40' : 'bg-brand-primary'
                }`}
              >
                <AppIcon family="material-community" name="plus" size={14} color="#003914" />
              </TouchableOpacity>
            </View>
          </View>
        ))}
      </View>

      {/* MVP */}
      <Text className="font-ui mb-2 text-xs uppercase tracking-widest text-neutral-outline">
        {mvpLabel}
      </Text>
      <View className="mb-4 flex-row flex-wrap gap-2">
        {participants.map((p) => (
          <TouchableOpacity
            key={p.profileId}
            onPress={() => onMvpChange(mvpId === p.profileId ? null : p.profileId)}
            activeOpacity={0.8}
            className={`rounded-xl px-3 py-2 ${
              mvpId === p.profileId ? 'bg-warning-tertiary/20' : 'bg-surface-high'
            }`}
          >
            <Text
              className={`font-ui text-sm ${
                mvpId === p.profileId ? 'text-warning-tertiary' : 'text-neutral-on-surface-variant'
              }`}
            >
              {mvpId === p.profileId ? '⭐ ' : ''}
              {p.fullName}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </>
  );
}
