import { useCallback, useMemo, useState } from 'react';
import { ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { AppIcon } from '@/components/ui/AppIcon';
import { GlobalLoader } from '@/components/GlobalLoader';
import { useAuth } from '@/context/AuthContext';
import { getGenericSupabaseErrorMessage } from '@/lib/auth-error-messages';
import { fetchTeamRequestsViewData } from '@/lib/team-requests-data';
import { TeamRequestsViewData } from '@/components/team-requests/types';
import { TeamRequestsList } from '@/components/team-requests/TeamRequestsList';
import { useCustomAlert } from '@/hooks/useCustomAlert';

export default function TeamRequestsScreen() {
  const router = useRouter();
  const { profile } = useAuth();
  const { showAlert, AlertComponent } = useCustomAlert();
  
  const [loading, setLoading] = useState(true);
  const [viewData, setViewData] = useState<TeamRequestsViewData | null>(null);
  const [filter, setFilter] = useState<'TODAS' | 'PENDIENTE' | 'ACEPTADA' | 'RECHAZADA'>('TODAS');

  const loadRequests = useCallback(async () => {
    if (!profile) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const data = await fetchTeamRequestsViewData(profile.id);
      setViewData(data);
    } catch (error) {
      showAlert('Error al cargar solicitudes', getGenericSupabaseErrorMessage(error, 'No se pudieron cargar tus solicitudes.'));
    } finally {
      setLoading(false);
    }
  }, [profile, showAlert]);

  useFocusEffect(
    useCallback(() => {
      void loadRequests();
    }, [loadRequests])
  );

  const filteredRequests = useMemo(() => {
    const requests = viewData?.requests ?? [];
    if (filter === 'TODAS') {
      return requests;
    }
    return requests.filter((request) => request.status === filter);
  }, [viewData, filter]);

  if (loading) {
    return <GlobalLoader label="Cargando solicitudes" />;
  }

  return (
    <SafeAreaView className="flex-1 bg-surface-base">
      <View className="px-4 pb-2 pt-1">
        <TouchableOpacity className="w-10" activeOpacity={0.8} onPress={() => router.back()}>
          <AppIcon family="material-icons" name="arrow-back-ios-new" size={22} color="#BCCBB9" />
        </TouchableOpacity>
      </View>

      <ScrollView className="px-4" contentContainerStyle={{ paddingBottom: 36 }}>
        <Text className="font-displayBlack text-3xl uppercase tracking-tight text-neutral-on-surface">Mis solicitudes</Text>
        <Text className="font-ui mt-1 text-sm text-neutral-on-surface-variant">Seguimiento de solicitudes para unirte a equipos.</Text>

        <View className="mt-5 flex-row flex-wrap gap-2">
          {(['TODAS', 'PENDIENTE', 'ACEPTADA', 'RECHAZADA'] as const).map((option) => {
            const active = filter === option;
            const optionLabels = {
              'TODAS': 'Todas',
              'PENDIENTE': 'Pendiente',
              'ACEPTADA': 'Aceptada',
              'RECHAZADA': 'Rechazada'
            };
            
            return (
              <TouchableOpacity
                key={option}
                activeOpacity={0.9}
                onPress={() => setFilter(option)}
                className={`rounded-md border px-3 py-2 ${active ? 'border-brand-primary bg-brand-primary/15' : 'border-neutral-outline-variant/15 bg-surface-low'}`}
              >
                <Text className={`font-display text-[10px] uppercase tracking-wide ${active ? 'text-brand-primary' : 'text-neutral-on-surface-variant'}`}>
                  {optionLabels[option]}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <View className="mt-4 gap-3">
          <TeamRequestsList requests={filteredRequests} />
        </View>
      </ScrollView>

      {AlertComponent}
    </SafeAreaView>
  );
}