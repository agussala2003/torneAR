import { Database } from '@/types/supabase';

type Profile = Database['public']['Tables']['profiles']['Row'];

export function isProfileComplete(profile: Profile | null): boolean {
  if (!profile) return false;

  return Boolean(
    profile.username?.trim() &&
    profile.full_name?.trim() &&
    profile.preferred_position?.trim()
  );
}
