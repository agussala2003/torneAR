import { useCallback, useEffect, useState } from 'react';
import { ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { GlobalHeader } from '@/components/GlobalHeader';
import { GlobalLoader } from '@/components/GlobalLoader';
import { AppIcon } from '@/components/ui/AppIcon';
import { useAuth } from '@/context/AuthContext';
import { useCustomAlert } from '@/hooks/useCustomAlert';
import { getGenericSupabaseErrorMessage } from '@/lib/auth-error-messages';
import { fetchTeamStatsViewData } from '@/lib/team-stats-api';
import type { TeamStatsViewData } from '@/components/team-stats/types';
import { TeamHeader } from '@/components/team-stats/TeamHeader';
import { TeamFormAndSeason } from '@/components/team-stats/TeamFormAndSeason';
import { TeamRecentMatches } from '@/components/team-stats/TeamRecentMatches';
import { TeamMembersSection } from '@/components/team-stats/TeamMembersSection';

export default function TeamStatsScreen() {
  const router = useRouter();
  const { profile } = useAuth();
  const { teamId } = useLocalSearchParams<{ teamId?: string }>();

  const [loading, setLoading] = useState(true);
  const [viewData, setViewData] = useState<TeamStatsViewData | null>(null);
  const { showAlert, AlertComponent } = useCustomAlert();

  const loadData = useCallback(async () => {
    if (!teamId) {
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      setViewData(await fetchTeamStatsViewData(teamId, profile?.id ?? null));
    } catch (error) {
      showAlert(
        'Error al cargar stats',
        getGenericSupabaseErrorMessage(error, 'No se pudo cargar el detalle del equipo.'),
      );
    } finally {
      setLoading(false);
    }
  }, [teamId, profile?.id, showAlert]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  if (loading) return <GlobalLoader label="Cargando stats del equipo" />;

  if (!viewData) {
    return (
      <View className="flex-1 items-center justify-center bg-surface-base px-6">
        <Text className="font-display text-xl text-neutral-on-surface">Equipo no disponible</Text>
        <TouchableOpacity
          onPress={() => router.back()}
          activeOpacity={0.8}
          className="mt-4 rounded-lg bg-surface-high px-4 py-2"
        >
          <Text className="font-ui text-neutral-on-surface">Volver</Text>
        </TouchableOpacity>
        {AlertComponent}
      </View>
    );
  }

  return (
    <View className="flex-1 bg-surface-base">
      <GlobalHeader />
      <ScrollView className="px-4" contentContainerStyle={{ paddingTop: 16, paddingBottom: 114 }}>
        <View className="mb-2 flex-row items-center justify-between">
          <TouchableOpacity
            onPress={() => router.back()}
            activeOpacity={0.85}
            className="flex-row items-center gap-1 rounded-lg bg-surface-high px-3 py-2"
          >
            <AppIcon family="material-icons" name="arrow-back" size={16} color="#BCCBB9" />
            <Text className="font-ui text-xs text-neutral-on-surface-variant">Volver</Text>
          </TouchableOpacity>
          <Text className="font-display text-sm uppercase tracking-widest text-brand-primary">
            Stats del Equipo
          </Text>
        </View>

        <TeamHeader header={viewData.header} />
        <TeamFormAndSeason form={viewData.form} season={viewData.season} />
        <TeamRecentMatches matches={viewData.recentMatches} />
        <TeamMembersSection members={viewData.members} />

        {!viewData.isOwnTeam && (
          <View className="mt-8">
            <TouchableOpacity
              activeOpacity={0.85}
              disabled
              className="flex-row items-center justify-center gap-2 rounded-xl border border-neutral-outline-variant/20 bg-surface-low py-4 opacity-40"
            >
              <AppIcon family="material-community" name="sword-cross" size={18} color="#BCCBB9" />
              <Text className="font-display text-sm uppercase tracking-wide text-neutral-on-surface-variant">
                Desafiar equipo
              </Text>
            </TouchableOpacity>
            <Text className="mt-2 text-center font-ui text-xs text-neutral-on-surface-variant">
              Próximamente disponible
            </Text>
          </View>
        )}
      </ScrollView>
      {AlertComponent}
    </View>
  );
}
