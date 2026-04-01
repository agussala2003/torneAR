// tornear/lib/profile-edit-data.ts
import { supabase } from '@/lib/supabase';
import { UserProfileFormData } from '@/lib/schemas/userSchema';

function toISODate(ddmmyyyy: string): string {
  const [dd, mm, yyyy] = ddmmyyyy.split('/');
  return `${yyyy}-${mm}-${dd}`;
}

export async function updateProfile(
  profileId: string,
  data: UserProfileFormData,
): Promise<void> {
  const { error } = await supabase
    .from('profiles')
    .update({
      full_name: data.fullName,
      username: data.username,
      zone: data.zone,
      preferred_position: data.position,
      date_of_birth: toISODate(data.dateOfBirth),
      gender: data.gender,
      strong_foot: data.strongFoot,
      favorite_team: data.favoriteTeam?.trim() || null,
    })
    .eq('id', profileId);

  if (error) {
    throw error;
  }
}
