import { useCallback, useEffect, useState } from 'react';
import { ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { GlobalLoader } from '@/components/GlobalLoader';
import { AppIcon } from '@/components/ui/AppIcon';
import { SecondaryHeader } from '@/components/ui/SecondaryHeader';
import { ReportModal } from '@/components/reports/ReportModal';
import { useAuth } from '@/context/AuthContext';
import { useCustomAlert } from '@/hooks/useCustomAlert';
import { getGenericSupabaseErrorMessage } from '@/lib/auth-error-messages';
import { fetchProfileStatsViewData } from '@/lib/profile-stats-api';
import { Logger } from '@/lib/logger';
import type { ProfileStatsViewData } from '@/components/profile-stats/types';
import { StatsHeader } from '@/components/profile-stats/StatsHeader';
import { StatsOverview } from '@/components/profile-stats/StatsOverview';
import { RecentMatchesSection } from '@/components/profile-stats/RecentMatchesSection';
import { BadgesSection } from '@/components/profile-stats/BadgesSection';
import { TeamsSection } from '@/components/profile-stats/TeamsSection';
import { CareerTimeline } from '@/components/profile/CareerTimeline';

export default function ProfileStatsScreen() {
  const { profile } = useAuth();
  const { profileId: paramProfileId } = useLocalSearchParams<{ profileId?: string }>();
  const profileId = paramProfileId ?? profile?.id ?? null;

  // Sin `profileId` en los params la pantalla ya cae en el perfil propio, pero
  // se compara contra el id resuelto y no contra la ausencia del param: a las
  // stats propias tambien se llega con el id explicito desde la tab de Perfil.
  const isOwnProfile = !!profile?.id && profileId === profile.id;

  const [loading, setLoading] = useState(true);
  const [viewData, setViewData] = useState<ProfileStatsViewData | null>(null);
  const [showReportModal, setShowReportModal] = useState(false);
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
      Logger.error('No se pudo cargar el detalle de estadísticas del perfil', {
        scope: 'profile-stats.loadData',
        profileId,
        error,
      });
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
      <SecondaryHeader
        title="Stats"
        // Sólo tiene sentido denunciar el perfil de OTRO: no te podés
        // denunciar a vos mismo, así que el botón directamente no existe en
        // isOwnProfile — no es una validación que haga falta llevar al modal.
        rightSlot={
          !isOwnProfile ? (
            <TouchableOpacity
              onPress={() => setShowReportModal(true)}
              activeOpacity={0.7}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              accessibilityRole="button"
              accessibilityLabel="Denunciar perfil"
            >
              <AppIcon family="material-community" name="flag-outline" size={20} color="#869585" />
            </TouchableOpacity>
          ) : null
        }
      />
      <ScrollView className="px-4" contentContainerStyle={{ paddingTop: 16, paddingBottom: 114 }}>
        <StatsHeader
          profile={viewData.profile}
          age={viewData.age}
          isEmbajador={viewData.badges.some((b) => b.slug === 'embajador' && b.isEarned)}
        />
        <StatsOverview stats={viewData.stats} />
        <RecentMatchesSection matches={viewData.recentMatches} isOwnProfile={isOwnProfile} />
        <BadgesSection badges={viewData.badges} />
        <TeamsSection teams={viewData.teams} />
        {/* Misma seccion que en la tab de Perfil: la trayectoria es publica y
            faltaba justo en la pantalla a la que se llega desde el rival. */}
        <CareerTimeline profileId={viewData.profile.id} isOwnProfile={isOwnProfile} />
      </ScrollView>

      {profile?.id && (
        <ReportModal
          visible={showReportModal}
          onClose={() => setShowReportModal(false)}
          entityType="USER"
          entityId={viewData.profile.id}
          reporterId={profile.id}
        />
      )}

      {AlertComponent}
    </View>
  );
}
