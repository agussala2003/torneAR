import { useCallback, useState } from 'react';
import { View, Text, TouchableOpacity, FlatList, Image } from 'react-native';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import { GlobalHeader } from '@/components/GlobalHeader';
import { GlobalLoader } from '@/components/GlobalLoader';
import { AppIcon } from '@/components/ui/AppIcon';
import { useCustomAlert } from '@/hooks/useCustomAlert';
import { getGenericSupabaseErrorMessage } from '@/lib/auth-error-messages';
import { getSupabaseStorageUrl } from '@/lib/supabase-storage';
import {
  fetchApplicationsForPost,
  respondToApplication,
  type MarketApplicationEntry,
  type MarketPostType,
} from '@/lib/market-applications-api';

const STATUS_LABEL: Record<string, string> = {
  PENDIENTE: 'Pendiente',
  VISTA: 'Vista',
  ACEPTADA: 'Aceptada',
  RECHAZADA: 'Rechazada',
};

const STATUS_CLASS: Record<string, string> = {
  PENDIENTE: 'bg-warning-tertiary/20 text-warning-tertiary',
  VISTA: 'bg-info-secondary/20 text-info-secondary',
  ACEPTADA: 'bg-brand-primary/20 text-brand-primary',
  RECHAZADA: 'bg-danger-error/20 text-danger-error',
};

export default function MarketApplicationsScreen() {
  const router = useRouter();
  const { postId, postType } = useLocalSearchParams<{ postId: string; postType: MarketPostType }>();
  const { showAlert, AlertComponent } = useCustomAlert();

  const [loading, setLoading] = useState(true);
  const [applications, setApplications] = useState<MarketApplicationEntry[]>([]);
  const [respondingId, setRespondingId] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    if (!postId || !postType) {
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      const data = await fetchApplicationsForPost(postId, postType);
      setApplications(data);
    } catch (err) {
      showAlert('Error', getGenericSupabaseErrorMessage(err, 'No se pudieron cargar las postulaciones.'));
    } finally {
      setLoading(false);
    }
  }, [postId, postType, showAlert]);

  useFocusEffect(useCallback(() => { void loadData(); }, [loadData]));

  async function handleRespond(entry: MarketApplicationEntry, status: 'ACEPTADA' | 'RECHAZADA') {
    setRespondingId(entry.id);
    try {
      await respondToApplication(entry.id, postType, status, entry.notifyProfileId);
      await loadData();
    } catch (err) {
      showAlert('Error', getGenericSupabaseErrorMessage(err));
    } finally {
      setRespondingId(null);
    }
  }

  const bucket = postType === 'TEAM' ? 'avatars' : 'shields';

  function resolveImageUrl(path: string | null): string | null {
    if (!path) return null;
    if (path.startsWith('http')) return path;
    return getSupabaseStorageUrl(bucket, path);
  }

  if (loading) return <GlobalLoader label="Cargando postulaciones..." />;

  return (
    <View className="flex-1 bg-surface-base">
      <GlobalHeader />
      <View className="px-4 pt-4">
        <TouchableOpacity
          onPress={() => router.back()}
          activeOpacity={0.85}
          className="mb-4 flex-row items-center gap-1 self-start rounded-lg bg-surface-high px-3 py-2"
        >
          <AppIcon family="material-community" name="arrow-left" size={16} color="#BCCBB9" />
          <Text className="font-ui text-xs text-neutral-on-surface-variant">Volver</Text>
        </TouchableOpacity>
        <Text className="font-displayBlack mb-4 text-xl text-neutral-on-surface">
          Postulaciones {postType === 'TEAM' ? 'de jugadores' : 'de equipos'}
        </Text>
      </View>

      <FlatList
        data={applications}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 100 }}
        ListEmptyComponent={
          <View className="items-center py-16">
            <AppIcon family="material-community" name="inbox-outline" size={40} color="#3F4943" />
            <Text className="mt-3 text-center font-ui text-sm text-neutral-on-surface-variant">
              Todavía no recibiste postulaciones.
            </Text>
          </View>
        }
        renderItem={({ item }) => {
          const imageUrl = resolveImageUrl(item.displayAvatarOrShieldUrl);
          const isPending = item.status === 'PENDIENTE' || item.status === 'VISTA';
          const isResponding = respondingId === item.id;

          return (
            <View className="mb-3 rounded-xl bg-surface-container p-4">
              <View className="flex-row items-center gap-3">
                {imageUrl ? (
                  <Image source={{ uri: imageUrl }} style={{ width: 44, height: 44, borderRadius: 22 }} />
                ) : (
                  <View className="h-11 w-11 items-center justify-center rounded-full bg-surface-high">
                    <AppIcon
                      family="material-community"
                      name={postType === 'TEAM' ? 'account' : 'shield-account'}
                      size={20}
                      color="#53E076"
                    />
                  </View>
                )}
                <View className="flex-1">
                  <Text className="font-uiBold text-sm text-neutral-on-surface" numberOfLines={1}>
                    {item.displayName}
                  </Text>
                  {item.displaySubtitle ? (
                    <Text className="font-ui text-xs text-neutral-on-surface-variant" numberOfLines={1}>
                      {item.displaySubtitle}
                    </Text>
                  ) : null}
                </View>
                <View className={`rounded-full px-2.5 py-1 ${STATUS_CLASS[item.status]?.split(' ')[0]}`}>
                  <Text className={`font-uiBold text-[10px] uppercase ${STATUS_CLASS[item.status]?.split(' ')[1]}`}>
                    {STATUS_LABEL[item.status] ?? item.status}
                  </Text>
                </View>
              </View>

              {isPending && (
                <View className="mt-3 flex-row gap-2">
                  <TouchableOpacity
                    onPress={() => void handleRespond(item, 'RECHAZADA')}
                    disabled={isResponding}
                    activeOpacity={0.8}
                    className="flex-1 items-center rounded-lg border border-danger-error/30 bg-danger-error/10 py-2.5"
                  >
                    <Text className="font-uiBold text-xs text-danger-error">Rechazar</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => void handleRespond(item, 'ACEPTADA')}
                    disabled={isResponding}
                    activeOpacity={0.8}
                    className="flex-1 items-center rounded-lg bg-brand-primary py-2.5"
                  >
                    <Text className="font-uiBold text-xs" style={{ color: '#003914' }}>Aceptar</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          );
        }}
      />
      {AlertComponent}
    </View>
  );
}
