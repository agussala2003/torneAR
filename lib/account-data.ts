import { supabase } from '@/lib/supabase';
import type { PostgrestError } from '@supabase/supabase-js';

/**
 * Autoservicio de baja de cuenta (Apple 5.1.1).
 *
 * Llama a `delete_own_account()` — anonimiza `profiles` y banea la fila de
 * `auth.users` del lado del servidor (ver la migración
 * `20260818140000_store_debt_account_reports_feedback.sql` para el porqué no
 * es un DELETE físico). Esta función NO cierra la sesión: eso lo hace el
 * caller llamando a `signOut()` inmediatamente después de un éxito — separar
 * las dos cosas deja al caller decidir el orden exacto de feedback al
 * usuario (mostrar el mensaje de éxito antes o después de desloguear).
 */
export async function deleteOwnAccount(): Promise<{ error: PostgrestError | null }> {
  const { error } = await supabase.rpc('delete_own_account');
  return { error };
}
