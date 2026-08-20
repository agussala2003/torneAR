import { supabase } from '@/lib/supabase';

/**
 * Envía una sugerencia o reporte de bug a `app_feedback`.
 *
 * Reemplaza al Google Form que armaba `lib/feedback.ts` (borrado: sin
 * `ProfileFeedbackCard` como único consumidor, quedaba código muerto).
 * INSERT directo: la RLS de `app_feedback` ya exige
 * `profile_id = mi profile.id`, no hace falta una RPC sólo para repetir esa
 * validación.
 */
export async function submitAppFeedback(profileId: string, message: string): Promise<void> {
  const { error } = await supabase.from('app_feedback').insert({
    profile_id: profileId,
    message,
  });

  if (error) {
    throw error;
  }
}
