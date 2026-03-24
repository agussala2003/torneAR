import { supabase } from '@/lib/supabase';
import { UserProfileFormData } from '@/lib/schemas/userSchema';
import { registerForPushNotificationsAsync } from '@/lib/push-notifications';

export async function saveOnboardingProfile(userId: string, data: UserProfileFormData): Promise<void> {
  const pushToken = await registerForPushNotificationsAsync();

  const { error } = await supabase
    .from('profiles')
    .upsert({
      auth_user_id: userId,
      full_name: data.fullName,
      username: data.username,
      zone: data.zone,
      preferred_position: data.position,
      expo_push_token: pushToken,
      updated_at: new Date().toISOString()
    });

  if (error) {
    throw error;
  }
}
