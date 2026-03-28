import { useCallback, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useAuth } from '@/context/AuthContext';
import { GlobalLoader } from '@/components/GlobalLoader';
import { GlobalHeader } from '@/components/GlobalHeader';
import { useCustomAlert } from '@/hooks/useCustomAlert';
import { getGenericSupabaseErrorMessage } from '@/lib/auth-error-messages';
import { fetchHomeViewData } from '@/lib/home-data';
import type { HomeViewData, PendingActionType } from '@/components/home/types';
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

  const handlePendingAction = (type: PendingActionType) => {
    if (type === 'DISPUTE' || type === 'CHALLENGE_RECEIVED') {
      router.push('/(tabs)/ranking');
    } else {
      // TEAM_REQUEST → profile has the team management section
      router.push('/(tabs)/profile');
    }
  };

  const handleCreateTeam = () => {
    router.push('/team-create');
  };

  const handleJoinTeam = () => {
    router.push('/team-join');
  };

  // ─── Render ───────────────────────────────────────────────────────────────

  if (loading) {
    return <GlobalLoader label="Cargando inicio" />;
  }

  const hasNoTeams = !viewData || viewData.myTeams.length === 0;

  return (
    <View className="flex-1 bg-surface-base">
      <GlobalHeader />

      {hasNoTeams ? (
        // Full-screen onboarding CTA for users without any team
        <HomeOnboardingState
          onCreateTeam={handleCreateTeam}
          onJoinTeam={handleJoinTeam}
          onGoToMarket={handleGoToMarket}
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
