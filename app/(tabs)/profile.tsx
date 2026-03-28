import { useCallback, useState } from 'react';
import { ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useAuth } from '../../context/AuthContext';
import { GlobalLoader } from '@/components/GlobalLoader';
import { GlobalHeader } from '@/components/GlobalHeader';
import { AppIcon } from '@/components/ui/AppIcon';
import { getAuthErrorMessage, getGenericSupabaseErrorMessage } from '@/lib/auth-error-messages';
import { fetchProfileViewData } from '@/lib/profile-data';
import { ProfileViewData } from '@/components/profile/types';
import { ProfileHeader } from '@/components/profile/ProfileHeader';
import { ProfileStatsGrid } from '@/components/profile/ProfileStatsGrid';
import { ProfileBadgesSection } from '@/components/profile/ProfileBadgesSection';
import { ProfileTeamsSection } from '@/components/profile/ProfileTeamsSection';
import { ProfileSettingsSection } from '@/components/profile/ProfileSettingsSection';
import { useCustomAlert } from '@/hooks/useCustomAlert';

export default function ProfileScreen() {
  const { signOut, profile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [viewData, setViewData] = useState<ProfileViewData | null>(null);
  const [isSigningOut, setIsSigningOut] = useState(false);
  
  const { showAlert, AlertComponent } = useCustomAlert();

  const loadProfileData = useCallback(async () => {
    if (!profile) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const data = await fetchProfileViewData(profile);
      setViewData(data);
    } catch (error) {
      showAlert('Error al cargar perfil', getGenericSupabaseErrorMessage(error, 'No se pudo cargar la informacion de perfil.'));
    } finally {
      setLoading(false);
    }
  }, [profile, showAlert]);

  useFocusEffect(
    useCallback(() => {
      void loadProfileData();
    }, [loadProfileData])
  );

  const handleSignOut = async () => {
    try {
      setIsSigningOut(true);
      await signOut();
    } catch (error) {
      showAlert('Error al cerrar sesion', getAuthErrorMessage(error, 'login'));
    } finally {
      setIsSigningOut(false);
    }
  };

  if (loading) {
    return <GlobalLoader label="Cargando perfil" />;
  }

  if (!profile || !viewData) {
    return (
      <View className="flex-1 items-center justify-center bg-surface-base px-6">
        <Text className="font-display text-xl text-neutral-on-surface">Perfil no disponible</Text>
        <Text className="font-ui mt-2 text-center text-neutral-on-surface-variant">No se pudo obtener la informacion de perfil en este momento.</Text>

        {AlertComponent}
      </View>
    );
  }

  return (
    <View className="flex-1 bg-surface-base">
      <GlobalHeader />
      <ScrollView className="px-4" contentContainerStyle={{ paddingTop: 18, paddingBottom: 114 }}>
        <ProfileHeader profile={viewData.profile} />
        <ProfileStatsGrid stats={viewData.stats} />
        <TouchableOpacity
          activeOpacity={0.9}
          onPress={() => router.push({ pathname: '/profile-stats', params: { profileId: viewData.profile.id } })}
          className="mt-3 flex-row items-center justify-center gap-2 rounded-xl bg-surface-low py-3"
        >
          <AppIcon family="material-community" name="chart-timeline-variant" size={16} color="#8CCDFF" />
          <Text className="font-display text-xs uppercase tracking-wider text-info-secondary">Ver stats detalladas</Text>
        </TouchableOpacity>
        <ProfileBadgesSection badges={viewData.badges} />
        <ProfileTeamsSection
          teams={viewData.teams}
          onCreateTeam={() => router.push('/team-create')}
          onJoinTeam={() => router.push('/team-join')}
          onOpenRequests={() => router.push('/team-requests')}
          onTeamPress={(teamId) => router.push({ pathname: '/team-manage', params: { teamId } })}
        />
        <ProfileSettingsSection isSigningOut={isSigningOut} onSignOut={handleSignOut} />
      </ScrollView>

      {AlertComponent}

      {isSigningOut && <GlobalLoader label="Cerrando sesion" />}
    </View>
  );
}
