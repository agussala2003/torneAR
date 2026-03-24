import { supabase } from '@/lib/supabase';
import { UserProfileFormData } from '@/lib/schemas/userSchema';

export async function updateProfile(profileId: string, data: UserProfileFormData): Promise<void> {
  const { error } = await supabase
    .from('profiles')
    .update({
      full_name: data.fullName,
      username: data.username,
      zone: data.zone,
      preferred_position: data.position,
    })
    .eq('id', profileId);

  if (error) {
    throw error;
  }
}
