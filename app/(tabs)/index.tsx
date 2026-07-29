import { useCallback, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useAuth } from '@/context/AuthContext';
import { GlobalHeader } from '@/components/GlobalHeader';
import { HomeSkeleton } from '@/components/home/HomeSkeleton';
import { useCustomAlert } from '@/hooks/useCustomAlert';
import { getGenericSupabaseErrorMessage } from '@/lib/auth-error-messages';
import { fetchHomeViewData } from '@/lib/home-data';
import { Logger } from '@/lib/logger';
import type { HomeViewData, PendingAction } from '@/components/home/types';
import { HomeOnboardingState } from '@/components/home/HomeOnboardingState';
import { PendingActionsCard } from '@/components/home/PendingActionsCard';
import { UpcomingMatchesSection } from '@/components/home/UpcomingMatchesSection';
import { MyTeamsRankingSection } from '@/components/home/MyTeamsRankingSection';
import { QuickActionsSection } from '@/components/home/QuickActionsSection';

export default function HomeScreen() {
  const { profile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [viewData, setViewData] = useState<HomeViewData | null>(null);
  const { showAlert, AlertComponent } = useCustomAlert();

  const loadData = useCallback(async () => {
    if (!profile) {
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      const data = await fetchHomeViewData(profile.id);
      setViewData(data);
    } catch (error) {
      Logger.error('No se pudo cargar la pantalla de inicio', {
        scope: 'tabs.index.loadData',
        profileId: profile.id,
        error,
      });
      showAlert(
        'Error al cargar inicio',
        getGenericSupabaseErrorMessage(error, 'No se pudo cargar la pantalla de inicio.'),
      );
    } finally {
      setLoading(false);
    }
  }, [profile, showAlert]);

  useFocusEffect(
    useCallback(() => {
      void loadData();
    }, [loadData]),
  );

  // ─── Navigation handlers ──────────────────────────────────────────────────

  const handleMatchPress = (matchId: string) => {
    router.push({ pathname: '/match-detail', params: { matchId } });
  };

  const handleSeeAllMatches = () => {
    router.push('/(tabs)/matches');
  };

  const handleTeamPress = (teamId: string) => {
    router.push({ pathname: '/team-manage', params: { teamId } });
  };

  const handleSeeRanking = () => {
    router.push('/(tabs)/ranking');
  };

  const handleGoToRanking = () => {
    router.push('/(tabs)/ranking');
  };

  const handleGoToMarket = () => {
    router.push('/(tabs)/market');
  };

  const handleManageTeam = () => {
    router.push('/(tabs)/profile');
  };

  // D12 — cada señal lleva al lugar donde SE RESUELVE. Las que apuntan a un
  // partido concreto (`matchId`, que sólo viene cuando hay uno solo) entran
  // directo al detalle; con varias, a la lista de partidos.
  const handlePendingAction = (action: PendingAction) => {
    switch (action.type) {
      case 'DISPUTE':
      case 'LIVE_RESULT':
      case 'MATCH_PROPOSAL':
      case 'CANCELLATION_REQUEST':
        if (action.matchId) {
          router.push({ pathname: '/match-detail', params: { matchId: action.matchId } });
        } else {
          router.push('/(tabs)/matches');
        }
        break;
      case 'CHALLENGE_RECEIVED':
        router.push('/challenge-inbox');
        break;
      case 'MARKET_APPLICATION':
        router.push('/(tabs)/market');
        break;
      case 'TEAM_REQUEST':
        // El perfil es donde vive la gestión de equipos.
        router.push('/(tabs)/profile');
        break;
    }
  };

  const handleCreateTeam = () => {
    router.push('/team-create');
  };

  const handleJoinTeam = () => {
    router.push('/team-join');
  };

  // ─── Render ───────────────────────────────────────────────────────────────

  // Solo la PRIMERA carga muestra esqueleto. En los refrescos por foco el
  // contenido anterior sigue en pantalla y se actualiza en silencio: antes cada
  // regreso a la tab borraba todo y mostraba un loader a pantalla completa.
  const isInitialLoad = loading && !viewData;
  const hasNoTeams = !viewData || viewData.myTeams.length === 0;

  return (
    <View className="flex-1 bg-surface-base">
      <GlobalHeader />

      {isInitialLoad ? (
        <HomeSkeleton />
      ) : hasNoTeams ? (
        // Full-screen onboarding CTA for users without any team
        <HomeOnboardingState
          onCreateTeam={handleCreateTeam}
          onJoinTeam={handleJoinTeam}
          onGoToMarket={handleGoToMarket}
          pendingTransfers={viewData?.pendingTransfers ?? 0}
          onConfirmTransfer={() => router.push('/team-requests')}
        />
      ) : (
        <ScrollView
          className="px-4"
          contentContainerStyle={{ paddingTop: 18, paddingBottom: 114 }}
          showsVerticalScrollIndicator={false}
        >
          <PendingActionsCard
            actions={viewData.pendingActions}
            onActionPress={handlePendingAction}
          />

          <UpcomingMatchesSection
            matches={viewData.upcomingMatches}
            onMatchPress={handleMatchPress}
            onSeeAll={handleSeeAllMatches}
          />

          <MyTeamsRankingSection
            teams={viewData.myTeams}
            onTeamPress={handleTeamPress}
            onSeeRanking={handleSeeRanking}
          />

          <QuickActionsSection
            onGoToRanking={handleGoToRanking}
            onGoToMarket={handleGoToMarket}
            onManageTeam={handleManageTeam}
          />
        </ScrollView>
      )}

      {AlertComponent}
    </View>
  );
}
