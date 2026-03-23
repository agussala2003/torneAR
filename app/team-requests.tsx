import { useEffect, useMemo, useState } from 'react';
import { ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { AppIcon } from '@/components/ui/AppIcon';
import CustomAlert from '@/components/ui/CustomAlert';
import { GlobalLoader } from '@/components/GlobalLoader';
import { useAuth } from '@/context/AuthContext';
import { getGenericSupabaseErrorMessage } from '@/lib/auth-error-messages';
import { supabase } from '@/lib/supabase';
import { getTeamCategoryLabel, getTeamFormatLabel, TeamCategory, TeamFormat } from '@/lib/team-options';

type RequestRow = {
  id: string;
  status: 'PENDIENTE' | 'ACEPTADA' | 'RECHAZADA';
  created_at: string;
  updated_at: string;
  team_id: string;
  teams: {
    id: string;
    name: string;
    zone: string;
    category: TeamCategory;
    preferred_format: TeamFormat;
  } | null;
};

function statusStyle(status: RequestRow['status']): { label: string; className: string } {
  if (status === 'ACEPTADA') {
    return { label: 'Aceptada', className: 'bg-brand-primary/15 text-brand-primary' };
  }

  if (status === 'RECHAZADA') {
    return { label: 'Rechazada', className: 'bg-danger-error/15 text-danger-error' };
  }

  return { label: 'Pendiente', className: 'bg-info-secondary/15 text-info-secondary' };
}

export default function TeamRequestsScreen() {
  const router = useRouter();
  const { profile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [requests, setRequests] = useState<RequestRow[]>([]);
  const [filter, setFilter] = useState<'TODAS' | 'PENDIENTE' | 'ACEPTADA' | 'RECHAZADA'>('TODAS');

  const [alertVisible, setAlertVisible] = useState(false);
  const [alertTitle, setAlertTitle] = useState('');
  const [alertMessage, setAlertMessage] = useState('');

  useEffect(() => {
    let mounted = true;

    async function loadRequests() {
      if (!profile) {
        if (mounted) {
          setLoading(false);
        }
        return;
      }

      try {
        setLoading(true);

        const { data, error } = await supabase
          .from('team_join_requests')
          .select('id, status, created_at, updated_at, team_id, teams(id, name, zone, category, preferred_format)')
          .eq('profile_id', profile.id)
          .order('created_at', { ascending: false });

        if (error) {
          throw error;
        }

        if (mounted) {
          setRequests((data as RequestRow[] | null) ?? []);
        }
      } catch (error) {
        if (mounted) {
          setAlertTitle('Error al cargar solicitudes');
          setAlertMessage(getGenericSupabaseErrorMessage(error, 'No se pudieron cargar tus solicitudes.'));
          setAlertVisible(true);
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    }

    void loadRequests();

    return () => {
      mounted = false;
    };
  }, [profile]);

  const filteredRequests = useMemo(() => {
    if (filter === 'TODAS') {
      return requests;
    }

    return requests.filter((request) => request.status === filter);
  }, [requests, filter]);

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
            return (
              <TouchableOpacity
                key={option}
                activeOpacity={0.9}
                onPress={() => setFilter(option)}
                className={`rounded-md border px-3 py-2 ${active ? 'border-brand-primary bg-brand-primary/15' : 'border-neutral-outline-variant/15 bg-surface-low'}`}
              >
                <Text className={`font-display text-[10px] uppercase tracking-wide ${active ? 'text-brand-primary' : 'text-neutral-on-surface-variant'}`}>
                  {option === 'TODAS' ? 'Todas' : option.charAt(0) + option.slice(1).toLowerCase()}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <View className="mt-4 gap-3">
          {filteredRequests.length === 0 ? (
            <View className="rounded-xl bg-surface-low p-4">
              <Text className="font-ui text-sm text-neutral-on-surface-variant">No hay solicitudes para mostrar.</Text>
              <TouchableOpacity
                onPress={() => router.push('/team-join')}
                activeOpacity={0.9}
                className="mt-3 flex-row items-center justify-center rounded-lg bg-brand-primary py-2.5"
              >
                <AppIcon family="material-community" name="account-plus" size={16} color="#003914" />
                <Text className="font-display ml-1.5 text-[11px] uppercase tracking-wide text-[#003914]">Nueva solicitud</Text>
              </TouchableOpacity>
            </View>
          ) : (
            filteredRequests.map((request) => {
              const status = statusStyle(request.status);

              return (
                <View key={request.id} className="rounded-xl bg-surface-low p-4">
                  <View className="flex-row items-start justify-between gap-3">
                    <View className="flex-1">
                      <Text className="font-display text-xl text-neutral-on-surface">{request.teams?.name ?? 'Equipo'}</Text>
                      <Text className="font-ui mt-1 text-xs text-neutral-on-surface-variant">{request.teams?.zone ?? 'Zona no definida'}</Text>
                    </View>

                    <Text className={`font-uiBold rounded px-2 py-1 text-[10px] uppercase tracking-wide ${status.className}`}>{status.label}</Text>
                  </View>

                  <View className="mt-3 flex-row flex-wrap items-center gap-2">
                    {request.teams ? (
                      <>
                        <Text className="font-uiBold rounded bg-brand-primary/15 px-2 py-1 text-[10px] uppercase tracking-wide text-brand-primary">{getTeamCategoryLabel(request.teams.category)}</Text>
                        <Text className="font-uiBold rounded bg-info-secondary/15 px-2 py-1 text-[10px] uppercase tracking-wide text-info-secondary">{getTeamFormatLabel(request.teams.preferred_format)}</Text>
                      </>
                    ) : null}
                  </View>

                  <View className="mt-3 flex-row items-center justify-between">
                    <Text className="font-ui text-[11px] text-neutral-on-surface-variant">Enviada: {new Date(request.created_at).toLocaleDateString('es-AR')}</Text>
                  </View>
                </View>
              );
            })
          )}
        </View>
      </ScrollView>

      <CustomAlert visible={alertVisible} title={alertTitle} message={alertMessage} onClose={() => setAlertVisible(false)} />
    </SafeAreaView>
  );
}