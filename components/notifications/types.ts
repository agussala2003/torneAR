import { Database } from '@/types/supabase';

export type NotificationItem = Database['public']['Tables']['notifications']['Row'];

export type NotificationsViewData = {
  notifications: NotificationItem[];
};
