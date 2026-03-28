import { useState } from 'react';
import {
  View,
  Text,
  Modal,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { AppIcon } from '@/components/ui/AppIcon';
import type { MatchResultFormData, MatchParticipantEntry } from '@/components/matches/types';

interface Props {
  visible: boolean;
  onClose: () => void;
  onSubmit: (data: MatchResultFormData) => Promise<void>;
  myParticipants: MatchParticipantEntry[];
}

function Stepper({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <View className="flex-1 items-center rounded-xl bg-surface-high p-4">
      <Text className="font-ui mb-3 text-xs uppercase tracking-widest text-neutral-outline">
        {label}
      </Text>
      <View className="flex-row items-center gap-4">
        <TouchableOpacity
          onPress={() => onChange(Math.max(0, value - 1))}
          activeOpacity={0.7}
          className="h-9 w-9 items-center justify-center rounded-full bg-surface-container"
        >
          <AppIcon family="material-community" name="minus" size={18} color="#BCCBB9" />
        </TouchableOpacity>
        <Text className="font-displayBlack w-8 text-center text-3xl text-neutral-on-surface">
          {value}
        </Text>
        <TouchableOpacity
          onPress={() => onChange(value + 1)}
          activeOpacity={0.7}
          className="h-9 w-9 items-center justify-center rounded-full bg-brand-primary"
        >
          <AppIcon family="material-community" name="plus" size={18} color="#003914" />
        </TouchableOpacity>
      </View>
    </View>
  );
}

export function ResultModal({ visible, onClose, onSubmit, myParticipants }: Props) {
  const [goalsScored, setGoalsScored] = useState(0);
  const [goalsAgainst, setGoalsAgainst] = useState(0);
  const [scorers, setScorers] = useState<Record<string, number>>({});
  const [mvpId, setMvpId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function setScorerGoals(profileId: string, goals: number) {
    setScorers((prev) => ({ ...prev, [profileId]: Math.max(0, goals) }));
  }

  async function handleSubmit() {
    setLoading(true);
    try {
      const scorerEntries = myParticipants
        .filter((p) => (scorers[p.profileId] ?? 0) > 0)
        .map((p) => ({ profileId: p.profileId, goals: scorers[p.profileId] ?? 0 }));

      await onSubmit({
        goalsScored,
        goalsAgainst,
        scorers: scorerEntries,
        mvpProfileId: mvpId,
      });
      onClose();
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View className="flex-1 justify-end bg-black/60">
        <View className="rounded-t-3xl bg-surface-container pb-10">
          {/* Header */}
          <View className="flex-row items-center justify-between px-5 py-4">
            <Text className="font-uiBold text-lg text-neutral-on-surface">Cargar resultado</Text>
            <TouchableOpacity onPress={onClose} activeOpacity={0.7}>
              <AppIcon family="material-community" name="close" size={22} color="#869585" />
            </TouchableOpacity>
          </View>

          <ScrollView
            className="px-5"
            contentContainerStyle={{ paddingBottom: 16 }}
            showsVerticalScrollIndicator={false}
          >
            {/* Goals steppers */}
            <View className="mb-4 flex-row gap-3">
              <Stepper label="Mis goles" value={goalsScored} onChange={setGoalsScored} />
              <Stepper label="Goles rival" value={goalsAgainst} onChange={setGoalsAgainst} />
            </View>

            {/* Scorers */}
            {myParticipants.length > 0 && (
              <>
                <Text className="font-ui mb-2 text-xs uppercase tracking-widest text-neutral-outline">
                  Goleadores (opcional)
                </Text>
                <View className="mb-4 gap-2">
                  {myParticipants.map((p) => (
                    <View
                      key={p.profileId}
                      className="flex-row items-center justify-between rounded-xl bg-surface-high px-4 py-2"
                    >
                      <Text className="font-ui flex-1 text-sm text-neutral-on-surface">
                        {p.fullName}
                      </Text>
                      <View className="flex-row items-center gap-3">
                        <TouchableOpacity
                          onPress={() => setScorerGoals(p.profileId, (scorers[p.profileId] ?? 0) - 1)}
                          activeOpacity={0.7}
                          className="h-7 w-7 items-center justify-center rounded-full bg-surface-container"
                        >
                          <AppIcon family="material-community" name="minus" size={14} color="#BCCBB9" />
                        </TouchableOpacity>
                        <Text className="font-uiBold w-5 text-center text-sm text-neutral-on-surface">
                          {scorers[p.profileId] ?? 0}
                        </Text>
                        <TouchableOpacity
                          onPress={() => setScorerGoals(p.profileId, (scorers[p.profileId] ?? 0) + 1)}
                          activeOpacity={0.7}
                          className="h-7 w-7 items-center justify-center rounded-full bg-brand-primary"
                        >
                          <AppIcon family="material-community" name="plus" size={14} color="#003914" />
                        </TouchableOpacity>
                      </View>
                    </View>
                  ))}
                </View>

                {/* MVP selector */}
                <Text className="font-ui mb-2 text-xs uppercase tracking-widest text-neutral-outline">
                  MVP (opcional)
                </Text>
                <View className="mb-4 flex-row flex-wrap gap-2">
                  {myParticipants.map((p) => (
                    <TouchableOpacity
                      key={p.profileId}
                      onPress={() => setMvpId(mvpId === p.profileId ? null : p.profileId)}
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
                        {mvpId === p.profileId ? '⭐ ' : ''}{p.fullName}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </>
            )}

            {/* Submit */}
            <TouchableOpacity
              onPress={() => void handleSubmit()}
              disabled={loading}
              activeOpacity={0.8}
              className="rounded-xl bg-brand-primary py-3.5"
            >
              <Text className="font-uiBold text-center text-sm text-[#003914]">
                {loading ? 'Enviando...' : 'Confirmar resultado'}
              </Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}
