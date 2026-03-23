import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import CustomAlert from '@/components/ui/CustomAlert';
import { AppIcon } from '@/components/ui/AppIcon';
import { GlobalLoader } from '@/components/GlobalLoader';
import { useAuth } from '@/context/AuthContext';
import { getGenericSupabaseErrorMessage } from '@/lib/auth-error-messages';
import { supabase } from '@/lib/supabase';

type NotificationRow = {
  id: string;
  type: string;
  title: string;
  body: string | null;
  is_read: boolean;
  created_at: string;
  data: unknown;
};

function formatDate(dateText: string): string {
  const date = new Date(dateText);
  return date.toLocaleString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function NotificationsScreen() {
  const router = useRouter();
  const { profile } = useAuth();

  const [loading, setLoading] = useState(true);
  const [markingAllRead, setMarkingAllRead] = useState(false);
  const [openingNotificationId, setOpeningNotificationId] = useState<string | null>(null);
  const [notifications, setNotifications] = useState<NotificationRow[]>([]);

  const [alertVisible, setAlertVisible] = useState(false);
  const [alertTitle, setAlertTitle] = useState('');
  const [alertMessage, setAlertMessage] = useState('');

  const showAlert = (title: string, message: string) => {
    setAlertTitle(title);
    setAlertMessage(message);
    setAlertVisible(true);
  };

  const unreadCount = useMemo(() => notifications.filter((item) => !item.is_read).length, [notifications]);

  const loadNotifications = useCallback(async () => {
    if (!profile?.id) {
      setNotifications([]);
      return;
    }

    const { data, error } = await supabase
      .from('notifications')
      .select('id, type, title, body, is_read, created_at, data')
      .eq('profile_id', profile.id)
      .order('created_at', { ascending: false })
      .limit(60);

    if (error) {
      throw error;
    }

    setNotifications((data as NotificationRow[] | null) ?? []);
  }, [profile?.id]);

  useEffect(() => {
    let mounted = true;

    async function init() {
      try {
        setLoading(true);
        await loadNotifications();
      } catch (error) {
        if (mounted) {
          showAlert('Error al cargar notificaciones', getGenericSupabaseErrorMessage(error, 'No se pudieron cargar las notificaciones.'));
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    }

    void init();

    return () => {
      mounted = false;
    };
  }, [loadNotifications]);

  useEffect(() => {
    if (!profile?.id) {
      return;
    }

    const channel = supabase
      .channel(`notifications-screen-${profile.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'notifications',
          filter: `profile_id=eq.${profile.id}`,
        },
        () => {
          void loadNotifications();
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [loadNotifications, profile?.id]);

  const markAllAsRead = async () => {
    if (!profile?.id || unreadCount === 0) {
      return;
    }

    try {
      setMarkingAllRead(true);

      const { error } = await supabase
        .from('notifications')
        .update({ is_read: true })
        .eq('profile_id', profile.id)
        .eq('is_read', false);

      if (error) {
        throw error;
      }

      setNotifications((current) => current.map((item) => ({ ...item, is_read: true })));
    } catch (error) {
      showAlert('No se pudo marcar', getGenericSupabaseErrorMessage(error, 'No se pudieron marcar como leidas.'));
    } finally {
      setMarkingAllRead(false);
    }
  };

  const openNotification = async (item: NotificationRow) => {
    try {
      setOpeningNotificationId(item.id);

      if (!item.is_read) {
        const { error } = await supabase
          .from('notifications')
          .update({ is_read: true })
          .eq('id', item.id);

        if (error) {
          throw error;
        }

        setNotifications((current) => current.map((row) => (row.id === item.id ? { ...row, is_read: true } : row)));
      }

      if (item.type === 'SOLICITUD_UNION_EQUIPO' && item.data && typeof item.data === 'object') {
        const maybeData = item.data as { team_id?: unknown };
        if (typeof maybeData.team_id === 'string' && maybeData.team_id.length > 0) {
          router.push({ pathname: '/team-manage', params: { teamId: maybeData.team_id } });
        }
      }
    } catch (error) {
      showAlert('No se pudo abrir', getGenericSupabaseErrorMessage(error, 'No se pudo abrir la notificacion.'));
    } finally {
      setOpeningNotificationId(null);
    }
  };

  if (loading) {
    return <GlobalLoader label="Cargando notificaciones" />;
  }

  return (
    <SafeAreaView className="flex-1 bg-surface-base">
      <View className="px-4 pb-2 pt-1">
        <View className="flex-row items-center justify-between">
          <TouchableOpacity className="w-10" activeOpacity={0.8} onPress={() => router.back()}>
            <AppIcon family="material-icons" name="arrow-back-ios-new" size={22} color="#BCCBB9" />
          </TouchableOpacity>

          <TouchableOpacity
            onPress={markAllAsRead}
            disabled={markingAllRead || unreadCount === 0}
            activeOpacity={0.9}
            className={`rounded-md px-3 py-1.5 ${unreadCount > 0 ? 'bg-surface-low' : 'bg-surface-low/40'}`}
          >
            {markingAllRead ? (
              <ActivityIndicator size="small" color="#BCCBB9" />
            ) : (
              <Text className={`font-display text-[10px] uppercase tracking-wide ${unreadCount > 0 ? 'text-neutral-on-surface-variant' : 'text-neutral-on-surface-variant/50'}`}>
                Marcar leidas
              </Text>
            )}
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView className="px-4" contentContainerStyle={{ paddingBottom: 32 }}>
        <Text className="font-displayBlack text-3xl uppercase tracking-tight text-neutral-on-surface">Notificaciones</Text>
        <Text className="font-ui mt-1 text-sm text-neutral-on-surface-variant">{unreadCount} sin leer</Text>

        <View className="mt-5 gap-2">
          {notifications.length === 0 ? (
            <View className="rounded-xl bg-surface-low p-4">
              <Text className="font-ui text-sm text-neutral-on-surface-variant">No tienes notificaciones por ahora.</Text>
            </View>
          ) : (
            notifications.map((item) => {
              const opening = openingNotificationId === item.id;
              return (
                <TouchableOpacity
                  key={item.id}
                  onPress={() => openNotification(item)}
                  activeOpacity={0.9}
                  className={`rounded-xl border p-3 ${item.is_read ? 'border-neutral-outline-variant/20 bg-surface-low' : 'border-info-secondary/35 bg-info-secondary/10'}`}
                >
                  <View className="flex-row items-start gap-3">
                    <View className={`mt-1 h-2.5 w-2.5 rounded-full ${item.is_read ? 'bg-surface-bright/60' : 'bg-info-secondary'}`} />
                    <View className="flex-1">
                      <View className="flex-row items-center justify-between gap-2">
                        <Text className={`font-uiBold text-sm ${item.is_read ? 'text-neutral-on-surface-variant' : 'text-neutral-on-surface'}`}>{item.title}</Text>
                        <Text className="font-ui text-[11px] text-neutral-on-surface-variant">{formatDate(item.created_at)}</Text>
                      </View>
                      {item.body ? <Text className="font-ui mt-1 text-xs text-neutral-on-surface-variant">{item.body}</Text> : null}
                      {opening ? (
                        <View className="mt-2 flex-row items-center gap-2">
                          <ActivityIndicator size="small" color="#BCCBB9" />
                          <Text className="font-display text-[10px] uppercase tracking-wide text-neutral-on-surface-variant">Abriendo...</Text>
                        </View>
                      ) : null}
                    </View>
                  </View>
                </TouchableOpacity>
              );
            })
          )}
        </View>
      </ScrollView>

      <CustomAlert visible={alertVisible} title={alertTitle} message={alertMessage} onClose={() => setAlertVisible(false)} />
    </SafeAreaView>
  );
}
