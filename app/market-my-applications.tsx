import { useCallback, useMemo, useState } from 'react';
import { ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { AppIcon } from '@/components/ui/AppIcon';
import { EmptyState } from '@/components/ui/EmptyState';
import { GlobalLoader } from '@/components/GlobalLoader';
import { MyApplicationCard } from '@/components/market/MyApplicationCard';
import { useAuth } from '@/context/AuthContext';
import { useCustomAlert } from '@/hooks/useCustomAlert';
import {
  fetchMyMarketApplications,
  getMarketApplicationErrorMessage,
  type ApplicationStatus,
  type MyMarketApplicationEntry,
} from '@/lib/market-applications-api';
import { Logger } from '@/lib/logger';

type FilterOption = 'TODAS' | ApplicationStatus;

const FILTER_OPTIONS: FilterOption[] = ['TODAS', 'PENDIENTE', 'VISTA', 'ACEPTADA', 'RECHAZADA'];

const FILTER_LABEL: Record<FilterOption, string> = {
  TODAS: 'Todas',
  PENDIENTE: 'Pendiente',
  VISTA: 'Vista',
  ACEPTADA: 'Aceptada',
  RECHAZADA: 'Rechazada',
};

/**
 * M4 — "Mis postulaciones": el estado de lo que YO mandé al Mercado.
 *
 * El circuito de postulaciones estaba completo del lado del dueño del aviso
 * (lista, `VISTA`, aceptar/rechazar, cierre en cascada) y mudo del lado del
 * postulante: el estado se escribía correctamente pero no existía ninguna
 * pantalla donde mirarlo. El único rastro era la notificación, que desaparece
 * apenas se marca como leída.
 *
 * Sin alertas ni modales nativos: `useCustomAlert` para los errores y
 * `EmptyState` para los vacíos, igual que el resto de la app.
 */
export default function MarketMyApplicationsScreen() {
  const router = useRouter();
  const { profile } = useAuth();
  const { showAlert, AlertComponent } = useCustomAlert();

  const [loading, setLoading] = useState(true);
  const [applications, setApplications] = useState<MyMarketApplicationEntry[]>([]);
  const [filter, setFilter] = useState<FilterOption>('TODAS');

  const loadData = useCallback(async () => {
    if (!profile) {
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      const data = await fetchMyMarketApplications();
      setApplications(data);
    } catch (error) {
      Logger.error('No se pudieron cargar las postulaciones del usuario', {
        scope: 'market-my-applications.loadData',
        profileId: profile.id,
        error,
      });
      showAlert(
        'Error al cargar tus postulaciones',
        getMarketApplicationErrorMessage(error, 'No se pudieron cargar tus postulaciones.'),
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

  const filtered = useMemo(
    () => (filter === 'TODAS' ? applications : applications.filter((a) => a.status === filter)),
    [applications, filter],
  );

  // La única postulación con un siguiente paso propio es la aceptada en un post
  // de EQUIPO: ahí quedó una solicitud de unión ACEPTADA esperando que el
  // jugador confirme el traspaso (M1). El resto es informativo.
  const handleAction = useCallback(
    (entry: MyMarketApplicationEntry) => {
      if (entry.postType === 'TEAM' && entry.status === 'ACEPTADA') {
        router.push('/team-requests');
      }
    },
    [router],
  );

  if (loading) return <GlobalLoader label="Cargando tus postulaciones" />;

  return (
    <SafeAreaView className="flex-1 bg-surface-base">
      <View className="px-4 pb-2 pt-1">
        <TouchableOpacity className="w-10" activeOpacity={0.8} onPress={() => router.back()}>
          <AppIcon family="material-icons" name="arrow-back-ios-new" size={22} color="#BCCBB9" />
        </TouchableOpacity>
      </View>

      <ScrollView className="px-4" contentContainerStyle={{ paddingBottom: 36 }}>
        <Text className="font-displayBlack text-3xl uppercase tracking-tight text-neutral-on-surface">
          Mis postulaciones
        </Text>
        <Text className="font-ui mt-1 text-sm text-neutral-on-surface-variant">
          Seguimiento de las postulaciones que enviaste en el Mercado.
        </Text>

        <View className="mt-5 flex-row flex-wrap gap-2">
          {FILTER_OPTIONS.map((option) => {
            const active = filter === option;
            return (
              <TouchableOpacity
                key={option}
                activeOpacity={0.9}
                onPress={() => setFilter(option)}
                className={`rounded-md border px-3 py-2 ${active ? 'border-brand-primary bg-brand-primary/15' : 'border-neutral-outline-variant/15 bg-surface-low'}`}
              >
                <Text
                  className={`font-display text-[10px] uppercase tracking-wide ${active ? 'text-brand-primary' : 'text-neutral-on-surface-variant'}`}
                >
                  {FILTER_LABEL[option]}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <View className="mt-4 gap-3">
          {filtered.length === 0 ? (
            applications.length === 0 ? (
              <EmptyState
                icon="send-outline"
                title="Sin postulaciones"
                description="Cuando te postules a una publicación del Mercado vas a poder seguir acá si la vieron, si te aceptaron o si te rechazaron."
                actionLabel="Ir al Mercado"
                onAction={() => router.push('/(tabs)/market')}
              />
            ) : (
              <EmptyState
                compact
                icon="filter-variant"
                title="Nada con ese estado"
                description="Probá con otro filtro para ver el resto de tus postulaciones."
              />
            )
          ) : (
            filtered.map((entry) => (
              <MyApplicationCard
                key={`${entry.postType}-${entry.id}`}
                entry={entry}
                onAction={
                  entry.postType === 'TEAM' && entry.status === 'ACEPTADA'
                    ? handleAction
                    : undefined
                }
                actionLabel={
                  entry.postType === 'TEAM' && entry.status === 'ACEPTADA'
                    ? 'Confirmar traspaso'
                    : undefined
                }
              />
            ))
          )}
        </View>
      </ScrollView>

      {AlertComponent}
    </SafeAreaView>
  );
}
