import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { AppIcon } from '@/components/ui/AppIcon';
import { NotificationsSkeleton } from '@/components/notifications/NotificationsSkeleton';
import { useAuth } from '@/context/AuthContext';
import { getGenericSupabaseErrorMessage } from '@/lib/auth-error-messages';
import { supabase } from '@/lib/supabase';
import { fetchNotificationsViewData, markAllNotificationsAsRead, markNotificationAsRead } from '@/lib/notifications-data';
import { NotificationsViewData, NotificationItem } from '@/components/notifications/types';
import { NotificationsListSection } from '@/components/notifications/NotificationsListSection';
import { useCustomAlert } from '@/hooks/useCustomAlert';

export default function NotificationsScreen() {
  const router = useRouter();
  const { profile } = useAuth();
  const { showAlert, AlertComponent } = useCustomAlert();

  const [loading, setLoading] = useState(true);
  const [viewData, setViewData] = useState<NotificationsViewData | null>(null);
  const [markingAllRead, setMarkingAllRead] = useState(false);
  const [openingNotificationId, setOpeningNotificationId] = useState<string | null>(null);

  const notifications = useMemo(() => viewData?.notifications ?? [], [viewData?.notifications]);
  const unreadCount = useMemo(() => notifications.filter((item) => !item.is_read).length, [notifications]);

  const loadNotificationsData = useCallback(async (showBaseLoader = true) => {
    if (!profile?.id) {
      setLoading(false);
      return;
    }

    try {
      if (showBaseLoader) setLoading(true);
      const data = await fetchNotificationsViewData(profile.id);
      setViewData(data);
    } catch (error) {
      showAlert(
        'Error al cargar',
        getGenericSupabaseErrorMessage(error, 'No se pudieron cargar las notificaciones.')
      );
    } finally {
      setLoading(false);
    }
  }, [profile?.id, showAlert]);

  useFocusEffect(
    useCallback(() => {
      void loadNotificationsData(true);
    }, [loadNotificationsData])
  );

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
          void loadNotificationsData(false);
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [loadNotificationsData, profile?.id]);

  const markAllAsRead = async () => {
    if (!profile?.id || unreadCount === 0 || !viewData) {
      return;
    }

    try {
      setMarkingAllRead(true);
      await markAllNotificationsAsRead(profile.id);

      setViewData({
        ...viewData,
        notifications: viewData.notifications.map((item) => ({ ...item, is_read: true })),
      });
    } catch (error) {
      showAlert('No se pudo marcar', getGenericSupabaseErrorMessage(error, 'No se pudieron marcar como leidas.'));
    } finally {
      setMarkingAllRead(false);
    }
  };

  const openNotification = async (item: NotificationItem) => {
    try {
      setOpeningNotificationId(item.id);

      if (!item.is_read && viewData) {
        await markNotificationAsRead(item.id);

        setViewData({
          ...viewData,
          notifications: viewData.notifications.map((row) =>
            row.id === item.id ? { ...row, is_read: true } : row
          ),
        });
      }

      // Ruteo por tipo. Antes solo SOLICITUD_UNION_EQUIPO navegaba: el resto —
      // incluida SOLICITUD_UNION_ACEPTADA, que justamente le pide al jugador
      // confirmar el traspaso — se marcaba como leída y no hacía nada, dejando
      // al usuario sin forma de llegar a la acción que la notificación pedía.
      const maybeData = (item.data ?? {}) as { team_id?: unknown };
      const teamId = typeof maybeData.team_id === 'string' ? maybeData.team_id : null;

      switch (item.type) {
        case 'SOLICITUD_UNION_EQUIPO':
          // Capitán: la solicitud se modera desde la gestión del equipo.
          if (teamId) router.push({ pathname: '/team-manage', params: { teamId } });
          break;

        case 'SOLICITUD_UNION_ACEPTADA':
        case 'SOLICITUD_UNION_RECHAZADA':
          // Jugador: acá confirma el traspaso que habilita su alta al plantel.
          router.push('/team-requests');
          break;

        case 'DESAFIO_RECIBIDO':
        case 'DESAFIO_ACEPTADO':
        case 'DESAFIO_RECHAZADO':
          router.push('/challenge-inbox');
          break;

        case 'ROL_ACTUALIZADO':
        case 'EXPULSADO_EQUIPO':
          if (teamId) router.push({ pathname: '/team-manage', params: { teamId } });
          break;

        case 'POSTULACION_RECIBIDA':
        case 'POSTULACION_RESPONDIDA':
          router.push('/market-chats');
          break;

        default:
          // Partidos, disputas, WO y temporada: sin destino específico todavía.
          break;
      }
    } catch (error) {
      showAlert('No se pudo abrir', getGenericSupabaseErrorMessage(error, 'No se pudo abrir la notificacion.'));
    } finally {
      setOpeningNotificationId(null);
    }
  };

  if (!profile && !loading) {
    return (
      <View className="flex-1 items-center justify-center bg-surface-base px-6">
        <Text className="font-display text-xl text-neutral-on-surface">No disponible</Text>
        {AlertComponent}
      </View>
    );
  }

  // La suscripcion realtime recarga esta pantalla ante cualquier INSERT/UPDATE.
  // Acotar el esqueleto a la carga inicial evita que la lista desaparezca cada
  // vez que llega una notificacion nueva.
  if (loading && !viewData) {
    return <NotificationsSkeleton />;
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
          <NotificationsListSection
            notifications={notifications}
            openingNotificationId={openingNotificationId}
            onOpenNotification={openNotification}
          />
        </View>
      </ScrollView>

      {AlertComponent}
    </SafeAreaView>
  );
}
