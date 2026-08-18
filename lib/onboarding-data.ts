// tornear/lib/onboarding-data.ts
import { supabase } from '@/lib/supabase';
import { UserProfileFormData } from '@/lib/schemas/userSchema';
import { registerForPushNotificationsAsync } from '@/lib/push-notifications';
import { resolveAndSetReferral } from '@/lib/referral-data';

function toISODate(ddmmyyyy: string): string {
  const [dd, mm, yyyy] = ddmmyyyy.split('/');
  return `${yyyy}-${mm}-${dd}`;
}

export async function saveOnboardingProfile(
  userId: string,
  data: UserProfileFormData,
  referredByUsername?: string | null,
): Promise<void> {
  const pushToken = await registerForPushNotificationsAsync();

  const { error } = await supabase.from('profiles').upsert({
    auth_user_id: userId,
    full_name: data.fullName,
    username: data.username,
    zone: data.zone,
    preferred_position: data.position,
    date_of_birth: toISODate(data.dateOfBirth),
    gender: data.gender,
    strong_foot: data.strongFoot,
    favorite_team: data.favoriteTeam?.trim() || null,
    expo_push_token: pushToken,
    updated_at: new Date().toISOString(),
  });

  if (error) {
    throw error;
  }

  // El perfil ya existe recién acá (upsert de arriba): `set_referral` resuelve
  // por `auth.uid()` -> profiles.id, así que no puede llamarse antes. Sin
  // código de referido pendiente, no pega la RPC.
  if (referredByUsername) {
    await resolveAndSetReferral(referredByUsername);
  }
}
