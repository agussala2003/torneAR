import { useCallback, useEffect, useState } from 'react';
import { FlatList, RefreshControl, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useAuth } from '@/context/AuthContext';
import { AppIcon } from '@/components/ui/AppIcon';
import { GlobalLoader } from '@/components/GlobalLoader';
import { CensusRow } from '@/components/census/CensusRow';
import { useCustomAlert } from '@/hooks/useCustomAlert';
import { getGenericSupabaseErrorMessage } from '@/lib/auth-error-messages';
import { fetchFavoriteTeamCensus, type CensusViewData } from '@/lib/census-data';
import { Logger } from '@/lib/logger';

/**
 * Censo del fútbol argentino — cuántos usuarios hinchan de cada club.
 *
 * El GROUP BY vive en `get_favorite_team_census()`, no acá: contar en el
 * cliente obligaría a bajar una fila por usuario para mostrar 28 números.
 *
 * La pantalla no usa `GlobalHeader` a propósito. Es una pantalla de stack a la
 * que se entra desde el Inicio, así que lo que hace falta es volver, no las
 * notificaciones ni el selector de equipo — mismo criterio que `faq.tsx`.
 */
export default function CensoScreen() {
  const router = useRouter();
  const { profile } = useAuth();
  const { showAlert, AlertComponent } = useCustomAlert();

  const [data, setData] = useState<CensusViewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadCensus = useCallback(
    async (mode: 'initial' | 'refresh') => {
      try {
        if (mode === 'refresh') setRefreshing(true);
        const viewData = await fetchFavoriteTeamCensus();
        setData(viewData);
      } catch (error) {
        Logger.error('No se pudo cargar el censo de cuadros favoritos', {
          scope: 'censo.loadCensus',
          profileId: profile?.id,
          error,
        });
        showAlert(
          'Error al cargar el censo',
          getGenericSupabaseErrorMessage(error, 'No se pudo cargar el censo.'),
        );
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [profile?.id, showAlert],
  );

  useEffect(() => {
    void loadCensus('initial');
  }, [loadCensus]);

  if (loading) return <GlobalLoader label="Contando hinchas..." />;

  const entries = data?.entries ?? [];
  // Escala de las barras. Las filas vienen ordenadas de la RPC, así que el
  // primero es el máximo.
  const leaderPercentage = entries[0]?.percentage ?? 0;

  return (
    <SafeAreaView className="flex-1 bg-surface-base">
      <View className="px-4 pb-2 pt-1">
        <TouchableOpacity
          className="w-10"
          activeOpacity={0.8}
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="Volver"
        >
          <AppIcon family="material-icons" name="arrow-back-ios-new" size={22} color="#BCCBB9" />
        </TouchableOpacity>
      </View>

      <FlatList
        className="px-4"
        data={entries}
        keyExtractor={(entry) => entry.teamName}
        contentContainerStyle={{ paddingBottom: 48 }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void loadCensus('refresh')}
            tintColor="#53E076"
            colors={['#53E076']}
          />
        }
        ListHeaderComponent={
          <View className="mb-4">
            <Text className="font-displayBlack text-3xl uppercase tracking-tight text-neutral-on-surface">
              Censo del fútbol argentino
            </Text>
            <Text className="font-ui mt-1 text-sm leading-5 text-neutral-on-surface-variant">
              De qué cuadro es la comunidad de torneAR.
            </Text>

            {data && data.totalFans > 0 && (
              <View className="mt-4 flex-row items-center gap-2 rounded-2xl bg-surface-container px-4 py-3">
                <AppIcon family="material-community" name="account-group" size={18} color="#53E076" />
                <Text className="font-ui text-[13px] text-neutral-on-surface-variant">
                  <Text className="font-uiBold text-neutral-on-surface">{data.totalFans}</Text>
                  {data.totalFans === 1 ? ' hincha censado' : ' hinchas censados'} en{' '}
                  <Text className="font-uiBold text-neutral-on-surface">{entries.length}</Text>
                  {entries.length === 1 ? ' club' : ' clubes'}
                </Text>
              </View>
            )}
          </View>
        }
        renderItem={({ item }) => (
          <CensusRow
            entry={item}
            leaderPercentage={leaderPercentage}
            isMine={profile?.favorite_team === item.teamName}
          />
        )}
        ListEmptyComponent={
          <View className="items-center px-6 py-16">
            <AppIcon family="material-community" name="account-question" size={40} color="#869585" />
            <Text className="font-ui mt-3 text-center text-sm leading-5 text-neutral-on-surface-variant">
              Todavía nadie cargó su cuadro favorito. Completá el tuyo desde tu perfil y sé el
              primero del censo.
            </Text>
          </View>
        }
      />

      {AlertComponent}
    </SafeAreaView>
  );
}
