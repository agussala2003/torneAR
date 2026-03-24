import React from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator } from 'react-native';
import { NotificationItem } from './types';

interface NotificationsListSectionProps {
  notifications: NotificationItem[];
  openingNotificationId: string | null;
  onOpenNotification: (item: NotificationItem) => void;
}

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

export function NotificationsListSection({
  notifications,
  openingNotificationId,
  onOpenNotification,
}: NotificationsListSectionProps) {
  if (notifications.length === 0) {
    return (
      <View className="rounded-xl bg-surface-low p-4">
        <Text className="font-ui text-sm text-neutral-on-surface-variant">
          No tienes notificaciones por ahora.
        </Text>
      </View>
    );
  }

  return (
    <>
      {notifications.map((item) => {
        const opening = openingNotificationId === item.id;
        return (
          <TouchableOpacity
            key={item.id}
            onPress={() => onOpenNotification(item)}
            activeOpacity={0.9}
            className={`rounded-xl border p-3 ${
              item.is_read
                ? 'border-neutral-outline-variant/20 bg-surface-low'
                : 'border-info-secondary/35 bg-info-secondary/10'
            }`}
          >
            <View className="flex-row items-start gap-3">
              <View
                className={`mt-1 h-2.5 w-2.5 rounded-full ${
                  item.is_read ? 'bg-surface-bright/60' : 'bg-info-secondary'
                }`}
              />
              <View className="flex-1">
                <View className="flex-row items-center justify-between gap-2">
                  <Text
                    className={`font-uiBold text-sm ${
                      item.is_read ? 'text-neutral-on-surface-variant' : 'text-neutral-on-surface'
                    }`}
                  >
                    {item.title}
                  </Text>
                  <Text className="font-ui text-[11px] text-neutral-on-surface-variant">
                    {formatDate(item.created_at)}
                  </Text>
                </View>
                {item.body ? (
                  <Text className="mt-1 font-ui text-xs text-neutral-on-surface-variant">
                    {item.body}
                  </Text>
                ) : null}
                {opening ? (
                  <View className="mt-2 flex-row items-center gap-2">
                    <ActivityIndicator size="small" color="#BCCBB9" />
                    <Text className="font-display text-[10px] uppercase tracking-wide text-neutral-on-surface-variant">
                      Abriendo...
                    </Text>
                  </View>
                ) : null}
              </View>
            </View>
          </TouchableOpacity>
        );
      })}
    </>
  );
}
