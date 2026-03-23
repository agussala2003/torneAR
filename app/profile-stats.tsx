import { useEffect, useMemo, useState } from 'react';
import { ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { GlobalHeader } from '@/components/GlobalHeader';
import { GlobalLoader } from '@/components/GlobalLoader';
import CustomAlert from '@/components/ui/CustomAlert';
import { AppIcon } from '@/components/ui/AppIcon';
import { useAuth } from '@/context/AuthContext';
import { fetchDetailedProfileStats, DetailedProfileStats } from '@/lib/profile-detailed-stats';
import { getGenericSupabaseErrorMessage } from '@/lib/auth-error-messages';

function formatDate(dateIso: string | null): string {
  if (!dateIso) return 'Fecha pendiente';

  const date = new Date(dateIso);
  if (Number.isNaN(date.getTime())) return 'Fecha pendiente';

  return date.toLocaleDateString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

function statusLabel(status: string): string {
  switch (status) {
    case 'FINALIZADO':
      return 'Finalizado';
    case 'EN_JUEGO':
      return 'En juego';
    case 'CANCELADO':
      return 'Cancelado';
    default:
      return 'Programado';
  }
}

export default function ProfileStatsScreen() {
  const router = useRouter();
  const { profile } = useAuth();
  const params = useLocalSearchParams<{ profileId?: string }>();

  const profileId = useMemo(() => params.profileId ?? profile?.id ?? null, [params.profileId, profile?.id]);

  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<DetailedProfileStats | null>(null);
  const [alertVisible, setAlertVisible] = useState(false);
  const [alertTitle, setAlertTitle] = useState('');
  const [alertMessage, setAlertMessage] = useState('');

  useEffect(() => {
    let mounted = true;

    async function loadData() {
      if (!profileId) {
        if (mounted) {
          setLoading(false);
          setAlertTitle('Perfil no disponible');
          setAlertMessage('No se pudo identificar el perfil para cargar estadisticas detalladas.');
          setAlertVisible(true);
        }
        return;
      }

      try {
        setLoading(true);
        const detailed = await fetchDetailedProfileStats(profileId);
        if (mounted) {
          setData(detailed);
        }
      } catch (error) {
        if (mounted) {
          setAlertTitle('Error al cargar stats');
          setAlertMessage(getGenericSupabaseErrorMessage(error, 'No se pudo cargar el detalle de estadisticas.'));
          setAlertVisible(true);
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    }

    void loadData();

    return () => {
      mounted = false;
    };
  }, [profileId]);

  if (loading) {
    return <GlobalLoader label="Cargando stats detalladas" />;
  }

  return (
    <View className="flex-1 bg-surface-base">
      <GlobalHeader />

      <ScrollView className="px-4" contentContainerStyle={{ paddingTop: 16, paddingBottom: 110 }}>
        <View className="mb-4 flex-row items-center justify-between">
          <TouchableOpacity
            onPress={() => router.back()}
            activeOpacity={0.85}
            className="flex-row items-center gap-1 rounded-lg bg-surface-high px-3 py-2"
          >
            <AppIcon family="material-icons" name="arrow-back" size={16} color="#BCCBB9" />
            <Text className="font-ui text-xs text-neutral-on-surface-variant">Volver</Text>
          </TouchableOpacity>

          <Text className="font-display text-sm uppercase tracking-widest text-brand-primary">Stats Detalladas</Text>
        </View>

        <View className="mb-6 rounded-2xl bg-surface-low p-4">
          <Text className="font-display mb-3 text-sm uppercase tracking-wider text-neutral-on-surface-variant">Rendimiento</Text>
          <View className="gap-3">
            {data?.summary.map((item) => (
              <View key={item.label} className="rounded-xl bg-surface-high p-3">
                <Text className="font-ui text-xs text-neutral-on-surface-variant">{item.label}</Text>
                <Text className="font-displayBlack mt-1 text-2xl text-neutral-on-surface" style={{ fontVariant: ['tabular-nums'] }}>
                  {item.value}
                </Text>
                {!!item.helper && <Text className="font-ui mt-1 text-xs text-neutral-on-surface-variant">{item.helper}</Text>}
              </View>
            ))}
          </View>
        </View>

        <View className="mb-6 rounded-2xl bg-surface-low p-4">
          <Text className="font-display mb-3 text-sm uppercase tracking-wider text-neutral-on-surface-variant">Actividad</Text>
          <View className="gap-3">
            {data?.activity.map((item) => (
              <View key={item.label} className="rounded-xl bg-surface-high p-3">
                <Text className="font-ui text-xs text-neutral-on-surface-variant">{item.label}</Text>
                <Text className="font-displayBlack mt-1 text-2xl text-neutral-on-surface" style={{ fontVariant: ['tabular-nums'] }}>
                  {item.value}
                </Text>
                {!!item.helper && <Text className="font-ui mt-1 text-xs text-neutral-on-surface-variant">{item.helper}</Text>}
              </View>
            ))}
          </View>
        </View>

        <View className="rounded-2xl bg-surface-low p-4">
          <Text className="font-display mb-3 text-sm uppercase tracking-wider text-neutral-on-surface-variant">Ultimos partidos</Text>

          {data?.recentMatches.length ? (
            <View className="gap-2">
              {data.recentMatches.map((match) => (
                <View key={`${match.id}-${match.participantTeamId}`} className="rounded-xl bg-surface-high p-3">
                  <View className="mb-1 flex-row items-center justify-between">
                    <Text className="font-uiBold text-xs uppercase text-neutral-on-surface">{match.participantTeamName}</Text>
                    <Text className="font-ui text-[10px] uppercase text-neutral-on-surface-variant">{statusLabel(match.status)}</Text>
                  </View>
                  <Text className="font-ui text-xs text-neutral-on-surface-variant">{formatDate(match.scheduledAt)}</Text>
                  <Text className="font-ui mt-1 text-xs text-neutral-on-surface-variant">{match.location ?? 'Ubicacion sin definir'} · {match.matchType}</Text>

                  <View className="mt-2 flex-row items-center gap-1">
                    <AppIcon
                      family="material-community"
                      name={match.didCheckin ? 'check-circle-outline' : 'clock-outline'}
                      size={14}
                      color={match.didCheckin ? '#53E076' : '#FABD32'}
                    />
                    <Text className="font-ui text-[10px] uppercase text-neutral-on-surface-variant">
                      {match.didCheckin ? 'Check-in realizado' : 'Sin check-in'}
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          ) : (
            <View className="rounded-xl bg-surface-high p-4">
              <Text className="font-ui text-sm text-neutral-on-surface-variant">Todavia no hay partidos para mostrar detalle.</Text>
            </View>
          )}
        </View>
      </ScrollView>

      <CustomAlert
        visible={alertVisible}
        title={alertTitle}
        message={alertMessage}
        onClose={() => setAlertVisible(false)}
      />
    </View>
  );
}
