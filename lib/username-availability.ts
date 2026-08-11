import { supabase } from '@/lib/supabase';

/**
 * ¿Hay otro perfil usando este `username`?
 *
 * Sólo consulta: la garantía real sigue siendo el índice único de la base, que
 * responde `23505` y ya está contemplado en el `onSubmit` de onboarding y de
 * edición de perfil. Esto es UX — enterarse en el paso 1 y no después de
 * completar los tres — y no una autorización.
 *
 * @param excludeProfileId Perfil a ignorar. En edición, el usuario ya "ocupa"
 *        su propio username y no debe leerse como tomado.
 */
export async function isUsernameTaken(
  username: string,
  excludeProfileId?: string,
): Promise<boolean> {
  let query = supabase
    .from('profiles')
    .select('id')
    .eq('username', username.trim().toLowerCase())
    .limit(1);

  if (excludeProfileId) {
    query = query.neq('id', excludeProfileId);
  }

  const { data, error } = await query;

  // El fallo se propaga: el hook lo traduce a "no sé" y deja pasar al usuario en
  // vez de bloquearlo por un problema de red. El índice único ataja el resto.
  if (error) throw error;

  return (data?.length ?? 0) > 0;
}
