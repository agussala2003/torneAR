import { useCallback, useEffect, useState } from 'react';
import { ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { GlobalHeader } from '@/components/GlobalHeader';
import { GlobalLoader } from '@/components/GlobalLoader';
import { AppIcon } from '@/components/ui/AppIcon';
import { useAuth } from '@/context/AuthContext';
import { useCustomAlert } from '@/hooks/useCustomAlert';
import { getGenericSupabaseErrorMessage } from '@/lib/auth-error-messages';
import { fetchTeamStatsViewData, fetchTeamBadges } from '@/lib/team-stats-api';
import type { TeamStatsViewData, H2HMatch, TeamBadgeItem } from '@/components/team-stats/types';
import { TeamHeader } from '@/components/team-stats/TeamHeader';
import { TeamFormAndSeason } from '@/components/team-stats/TeamFormAndSeason';
import { TeamRecentMatches } from '@/components/team-stats/TeamRecentMatches';
import { TeamMembersSection } from '@/components/team-stats/TeamMembersSection';
import { TeamBadgesSection } from '@/components/team-stats/TeamBadgesSection';
import { fetchTeamH2H } from '@/lib/team-h2h-data';
import { TeamH2HSection } from '@/components/team-stats/TeamH2HSection';
import { ChallengeButton } from '@/components/ranking/ChallengeButton';
import { getActiveChallengeWithTeam } from '@/lib/challenge-actions';

export default function TeamStatsScreen() {
  const router = useRouter();
  const { profile } = useAuth();
  const { teamId, viewerTeamId } = useLocalSearchParams<{ teamId: string, viewerTeamId?: string }>();

  const [loading, setLoading] = useState(true);
  const [viewData, setViewData] = useState<TeamStatsViewData | null>(null);
  const { showAlert, AlertComponent } = useCustomAlert();
  const [h2hMatches, setH2hMatches] = useState<H2HMatch[]>([]);
  const [alreadyChallenged, setAlreadyChallenged] = useState(false);
  const [teamBadges, setTeamBadges] = useState<TeamBadgeItem[]>([]);

  const isRival = Boolean(viewerTeamId && viewerTeamId !== teamId);

  const loadData = useCallback(async () => {
    if (!teamId) {
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      const data = await fetchTeamStatsViewData(teamId, profile?.id ?? null);
      setViewData(data);

      const badges = await fetchTeamBadges(teamId).catch(() => []);
      setTeamBadges(badges);

      if (isRival && viewerTeamId) {
        const [h2h, challenged] = await Promise.all([
          fetchTeamH2H(viewerTeamId, teamId).catch(() => []),
          getActiveChallengeWithTeam(viewerTeamId, teamId).catch(() => false),
        ]);
        setH2hMatches(h2h as H2HMatch[]);
        setAlreadyChallenged(challenged as boolean);
      }
    } catch (error) {
      showAlert(
        'Error al cargar stats',
        getGenericSupabaseErrorMessage(error, 'No se pudo cargar el detalle del equipo.'),
      );
    } finally {
      setLoading(false);
    }
  }, [teamId, viewerTeamId, isRival, profile?.id, showAlert]);

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

        {/* Botón Volver */}
        <View className="mb-4 flex-row items-center justify-between">
          <TouchableOpacity
            onPress={() => router.back()}
            activeOpacity={0.85}
            className="flex-row items-center gap-1 rounded-lg bg-surface-high px-3 py-2"
          >
            <AppIcon family="material-community" name="arrow-left" size={16} color="#BCCBB9" />
            <Text className="font-ui text-xs text-neutral-on-surface-variant">Volver</Text>
          </TouchableOpacity>
          <Text className="font-displayBlack text-xs uppercase tracking-widest text-brand-primary">
            Stats del Equipo
          </Text>
        </View>

        <TeamHeader header={viewData.header} />
        <TeamFormAndSeason form={viewData.form} season={viewData.season} />
        <TeamRecentMatches matches={viewData.recentMatches} />

        {isRival && (
          <TeamH2HSection
            h2h={h2hMatches}
            myTeamId={viewerTeamId!}
            opponentName={viewData.header.name}
          />
        )}

        {/* Plantilla primero */}
        <TeamMembersSection members={viewData.members} />

        <TeamBadgesSection badges={teamBadges} />

        {/* Botones de desafío al final, después de ver la plantilla */}
        {isRival && profile && viewerTeamId && (
          <View className="mt-4 gap-3">
            <ChallengeButton
              challengerTeamId={viewerTeamId}
              opponentTeamId={teamId}
              matchType="RANKING"
              showAlert={showAlert}
              alreadyChallenged={alreadyChallenged}
              onSuccess={loadData}
            />
            <ChallengeButton
              challengerTeamId={viewerTeamId}
              opponentTeamId={teamId}
              matchType="AMISTOSO"
              showAlert={showAlert}
              alreadyChallenged={alreadyChallenged}
              onSuccess={loadData}
            />
          </View>
        )}

      </ScrollView>
      {AlertComponent}
    </View>
  );
}
