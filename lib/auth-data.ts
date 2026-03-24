import { supabase } from '@/lib/supabase';
import { AuthError } from '@supabase/supabase-js';

export async function signIn(email: string, password: string): Promise<{ error: AuthError | null }> {
  return supabase.auth.signInWithPassword({ email, password });
}

export async function signUp(email: string, password: string): Promise<{ error: AuthError | null }> {
  return supabase.auth.signUp({ email, password });
}

export async function sendPasswordReset(email: string): Promise<{ error: AuthError | null }> {
  return supabase.auth.resetPasswordForEmail(email);
}
