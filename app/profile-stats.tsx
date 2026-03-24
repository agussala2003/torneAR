import { useCallback, useEffect, useState } from 'react';
import { ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { GlobalHeader } from '@/components/GlobalHeader';
import { GlobalLoader } from '@/components/GlobalLoader';
import { AppIcon } from '@/components/ui/AppIcon';
import { useAuth } from '@/context/AuthContext';
import { useCustomAlert } from '@/hooks/useCustomAlert';
import { getGenericSupabaseErrorMessage } from '@/lib/auth-error-messages';
import { fetchProfileStatsViewData } from '@/lib/profile-stats-api';
import type { ProfileStatsViewData } from '@/components/profile-stats/types';
import { StatsHeader } from '@/components/profile-stats/StatsHeader';
import { StatsOverview } from '@/components/profile-stats/StatsOverview';
import { RecentMatchesSection } from '@/components/profile-stats/RecentMatchesSection';
import { BadgesSection } from '@/components/profile-stats/BadgesSection';
import { TeamsSection } from '@/components/profile-stats/TeamsSection';

export default function ProfileStatsScreen() {
  const router = useRouter();
  const { profile } = useAuth();
  const { profileId: paramProfileId } = useLocalSearchParams<{ profileId?: string }>();
  const profileId = paramProfileId ?? profile?.id ?? null;

  const [loading, setLoading] = useState(true);
  const [viewData, setViewData] = useState<ProfileStatsViewData | null>(null);
  const { showAlert, AlertComponent } = useCustomAlert();

  const loadData = useCallback(async () => {
    if (!profileId) {
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      setViewData(await fetchProfileStatsViewData(profileId));
    } catch (error) {
      showAlert(
        'Error al cargar stats',
        getGenericSupabaseErrorMessage(error, 'No se pudo cargar el detalle de estadísticas.'),
      );
    } finally {
      setLoading(false);
    }
  }, [profileId, showAlert]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  if (loading) return <GlobalLoader label="Cargando stats" />;

  if (!viewData) {
    return (
      <View className="flex-1 items-center justify-center bg-surface-base px-6">
        <Text className="font-display text-xl text-neutral-on-surface">Perfil no disponible</Text>
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
            Stats
          </Text>
        </View>

        <StatsHeader profile={viewData.profile} />
        <StatsOverview stats={viewData.stats} />
        <RecentMatchesSection matches={viewData.recentMatches} />
        <BadgesSection badges={viewData.badges} />
        <TeamsSection teams={viewData.teams} />
      </ScrollView>
      {AlertComponent}
    </View>
  );
}
