// tornear/lib/onboarding-data.ts
import { supabase } from '@/lib/supabase';
import { UserProfileFormData } from '@/lib/schemas/userSchema';
import { registerForPushNotificationsAsync } from '@/lib/push-notifications';
import { applyPendingAttribution, resolveAndSetReferral } from '@/lib/referral-data';
import type { PendingUtm } from '@/stores/referralStore';

function toISODate(ddmmyyyy: string): string {
  const [dd, mm, yyyy] = ddmmyyyy.split('/');
  return `${yyyy}-${mm}-${dd}`;
}

export async function saveOnboardingProfile(
  userId: string,
  data: UserProfileFormData,
  referredByUsername?: string | null,
  utm?: PendingUtm | null,
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
  // por `auth.uid()` -> profiles.id, así que no puede llamarse antes.
  const hasUtm = !!(utm && (utm.source || utm.medium || utm.campaign));

  if (referredByUsername) {
    // Caso común: un link del Content Factory trae username y utm juntos —
    // una sola llamada a la RPC para los dos.
    await resolveAndSetReferral(referredByUsername, userId, utm);
  } else if (hasUtm) {
    // Sin código de referido (el campo quedó vacío) pero con utm pendiente:
    // igual se registra de dónde vino, ver el comentario de
    // `applyPendingAttribution`.
    await applyPendingAttribution(utm as PendingUtm);
  }
}
