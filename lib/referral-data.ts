import { supabase } from '@/lib/supabase';
import { Logger } from '@/lib/logger';

/**
 * Resuelve el username de referido pendiente contra `set_referral`.
 *
 * Falla silenciosa por diseño: `set_referral` ya no-opea ante un username
 * inválido, auto-referido, o un `referred_by` ya seteado (ver la migración
 * `20260817180000_referral_system.sql`), y acá se traga además cualquier
 * error de red/RPC. El onboarding nunca se bloquea por esto — en el peor caso,
 * el usuario no queda vinculado a nadie.
 */
export async function resolveAndSetReferral(referredByUsername: string): Promise<void> {
  const { error } = await supabase.rpc('set_referral', {
    p_referred_by_username: referredByUsername,
  });

  if (error) {
    Logger.warn('No se pudo resolver el referido; el onboarding sigue sin bloquearse', {
      scope: 'referral-data.resolveAndSetReferral',
      error,
    });
  }
}
