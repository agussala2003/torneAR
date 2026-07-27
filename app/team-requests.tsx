import { useCallback, useMemo, useState } from 'react';
import { ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { AppIcon } from '@/components/ui/AppIcon';
import { GlobalLoader } from '@/components/GlobalLoader';
import { useAuth } from '@/context/AuthContext';
import { useTeamStore } from '@/stores/teamStore';
import { getGenericSupabaseErrorMessage } from '@/lib/auth-error-messages';
import { fetchTeamRequestsViewData } from '@/lib/team-requests-data';
import { transferToTeam, getTeamActionErrorMessage } from '@/lib/team-manage-data';
import { TeamRequestsViewData, TeamRequestRow } from '@/components/team-requests/types';
import { TeamRequestsList } from '@/components/team-requests/TeamRequestsList';
import { useCustomAlert } from '@/hooks/useCustomAlert';

export default function TeamRequestsScreen() {
  const router = useRouter();
  const { profile, refreshProfile } = useAuth();
  const { myTeams, fetchMyTeams } = useTeamStore();
  const { showAlert, AlertComponent } = useCustomAlert();

  const [loading, setLoading] = useState(true);
  const [viewData, setViewData] = useState<TeamRequestsViewData | null>(null);
  const [filter, setFilter] = useState<'TODAS' | 'PENDIENTE' | 'ACEPTADA' | 'RECHAZADA'>('TODAS');
  const [confirmingId, setConfirmingId] = useState<string | null>(null);

  const loadRequests = useCallback(async () => {
    if (!profile) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      // El store de equipos alimenta el chequeo "¿ya sos miembro?" y el origen
      // del traspaso, así que lo refrescamos junto con las solicitudes.
      const [data] = await Promise.all([
        fetchTeamRequestsViewData(profile.id),
        fetchMyTeams(profile.id),
      ]);
      setViewData(data);
    } catch (error) {
      showAlert('Error al cargar solicitudes', getGenericSupabaseErrorMessage(error, 'No se pudieron cargar tus solicitudes.'));
    } finally {
      setLoading(false);
    }
  }, [profile, fetchMyTeams, showAlert]);

  const memberTeamIds = useMemo(() => new Set(myTeams.map((t) => t.id)), [myTeams]);

  const handleConfirmTransfer = useCallback(
    async (request: TeamRequestRow) => {
      if (!profile || confirmingId) return;
      setConfirmingId(request.id);
      try {
        // Origen del traspaso: si el jugador pertenece a exactamente un equipo,
        // ese ciclo se cierra como TRANSFERENCIA. Con 0 equipos entra como
        // agente libre (null). Con más de uno NO adivinamos cuál dejar (cerraría
        // el ciclo equivocado): entra sin cerrar ninguno y, si quiere salir de
        // alguno, lo hace explícito con "Abandonar equipo".
        const fromTeamId = myTeams.length === 1 ? myTeams[0].id : null;

        await transferToTeam(request.team_id, fromTeamId);
        await refreshProfile();
        await fetchMyTeams(profile.id);
        await loadRequests();

        showAlert(
          '¡Traspaso confirmado!',
          `Ya sos parte de ${request.teams?.name ?? 'tu nuevo equipo'}.`,
        );
      } catch (error) {
        showAlert('No pudimos confirmar el traspaso', getTeamActionErrorMessage(error));
      } finally {
        setConfirmingId(null);
      }
    },
    [profile, confirmingId, myTeams, refreshProfile, fetchMyTeams, loadRequests, showAlert],
  );

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
          <TeamRequestsList
            requests={filteredRequests}
            memberTeamIds={memberTeamIds}
            hasCurrentTeam={myTeams.length > 0}
            confirmingId={confirmingId}
            onConfirmTransfer={handleConfirmTransfer}
          />
        </View>
      </ScrollView>

      {AlertComponent}
    </SafeAreaView>
  );
}