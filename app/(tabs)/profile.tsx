import { useEffect, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { useAuth } from '../../context/AuthContext';
import CustomAlert from '../../components/ui/CustomAlert';
import { GlobalLoader } from '@/components/GlobalLoader';
import { GlobalHeader } from '@/components/GlobalHeader';
import { getAuthErrorMessage, getGenericSupabaseErrorMessage } from '@/lib/auth-error-messages';
import { fetchProfileViewData } from '@/lib/profile-data';
import { ProfileViewData } from '@/components/profile/types';
import { ProfileHeader } from '@/components/profile/ProfileHeader';
import { AvatarPicker } from '@/components/profile/AvatarPicker';
import { ProfileStatsGrid } from '@/components/profile/ProfileStatsGrid';
import { ProfileBadgesSection } from '@/components/profile/ProfileBadgesSection';
import { ProfileTeamsSection } from '@/components/profile/ProfileTeamsSection';
import { ProfileSettingsSection } from '@/components/profile/ProfileSettingsSection';

export default function ProfileScreen() {
  const { signOut, user, profile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [viewData, setViewData] = useState<ProfileViewData | null>(null);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [alertVisible, setAlertVisible] = useState(false);
  const [alertTitle, setAlertTitle] = useState('');
  const [alertMessage, setAlertMessage] = useState('');

  const showAlert = (title: string, message: string) => {
    setAlertTitle(title);
    setAlertMessage(message);
    setAlertVisible(true);
  };

  useEffect(() => {
    let mounted = true;

    async function loadProfileData() {
      if (!profile) {
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        const data = await fetchProfileViewData(profile);
        if (mounted) {
          setViewData(data);
        }
      } catch (error) {
        if (mounted) {
          showAlert('Error al cargar perfil', getGenericSupabaseErrorMessage(error, 'No se pudo cargar la informacion de perfil.'));
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    }

    void loadProfileData();

    return () => {
      mounted = false;
    };
  }, [profile, refreshKey]);

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

  const handleAvatarUploadSuccess = () => {
    // Recargar datos del perfil
    setRefreshKey((prev) => prev + 1);
  };

  if (loading) {
    return <GlobalLoader label="Cargando perfil" />;
  }

  if (!profile || !viewData) {
    return (
      <View className="flex-1 items-center justify-center bg-surface-base px-6">
        <Text className="text-xl font-bold text-neutral-on-surface">Perfil no disponible</Text>
        <Text className="mt-2 text-center text-neutral-on-surface-variant">No se pudo obtener la informacion de perfil en este momento.</Text>

        <CustomAlert
          visible={alertVisible}
          title={alertTitle}
          message={alertMessage}
          onClose={() => setAlertVisible(false)}
        />
      </View>
    );
  }

  return (
    <View className="flex-1 bg-surface-base">
      <GlobalHeader />
      <ScrollView className="px-4" contentContainerStyle={{ paddingTop: 18, paddingBottom: 110 }}>
        <ProfileHeader profile={viewData.profile} />
        <AvatarPicker 
          profileId={viewData.profile.id} 
          onUploadSuccess={handleAvatarUploadSuccess}
        />
        <ProfileStatsGrid stats={viewData.stats} />
        <ProfileBadgesSection badges={viewData.badges} />
        <ProfileTeamsSection teams={viewData.teams} />
        <ProfileSettingsSection isSigningOut={isSigningOut} onSignOut={handleSignOut} />
      </ScrollView>

      <CustomAlert
        visible={alertVisible}
        title={alertTitle}
        message={alertMessage}
        onClose={() => setAlertVisible(false)}
      />

      {isSigningOut && <GlobalLoader label="Cerrando sesion" />}
    </View>
  );
}
