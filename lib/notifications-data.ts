import { supabase } from '@/lib/supabase';
import { NotificationsViewData, NotificationItem } from '@/components/notifications/types';

export async function fetchNotificationsViewData(profileId: string): Promise<NotificationsViewData> {
  const { data, error } = await supabase
    .from('notifications')
    .select('id, type, title, body, is_read, created_at, data')
    .eq('profile_id', profileId)
    .order('created_at', { ascending: false })
    .limit(60);

  if (error) {
    throw error;
  }

  return {
    notifications: (data as NotificationItem[] | null) ?? [],
  };
}

export async function markAllNotificationsAsRead(profileId: string): Promise<void> {
  const { error } = await supabase
    .from('notifications')
    .update({ is_read: true })
    .eq('profile_id', profileId)
    .eq('is_read', false);

  if (error) {
    throw error;
  }
}

export async function markNotificationAsRead(notificationId: string): Promise<void> {
  const { error } = await supabase
    .from('notifications')
    .update({ is_read: true })
    .eq('id', notificationId);

  if (error) {
    throw error;
  }
}
