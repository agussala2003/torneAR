import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { Database } from '@/types/supabase';
import { Platform } from 'react-native';

function requireEnv(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

const supabaseUrl = requireEnv('EXPO_PUBLIC_SUPABASE_URL', process.env.EXPO_PUBLIC_SUPABASE_URL);
const supabaseAnonKey = requireEnv('EXPO_PUBLIC_SUPABASE_KEY', process.env.EXPO_PUBLIC_SUPABASE_KEY);

// Creamos un adaptador de storage condicional
const getStorage = () => {
  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined') {
      // Estamos en el navegador web
      return window.localStorage;
    } else {
      // Estamos en el servidor Node.js (SSR/SSG de Expo Web)
      // Retornamos un objeto dummy para que no explote
      return {
        getItem: () => Promise.resolve(null),
        setItem: () => Promise.resolve(),
        removeItem: () => Promise.resolve(),
      };
    }
  }
  // Estamos en la app nativa (iOS/Android)
  return AsyncStorage;
};

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: getStorage(),
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

// ─── Typed RPC helper ─────────────────────────────────────────────────────────
// Supabase generates types only for RPCs present in types/supabase.ts at build
// time. New RPCs added after the last `supabase gen types` run are not yet
// reflected in the generated types and would cause TS errors if called via the
// typed `supabase.rpc()` overload.
//
// This helper casts to a minimally-typed client so callers can invoke any RPC
// by name without using `any`. Regenerate `types/supabase.ts` (Item 11 follow-up)
// to eventually remove the need for this cast entirely.
type UntypedRpcClient = {
  rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;
};

export function supabaseRpc(fn: string, args: Record<string, unknown>) {
  return (supabase as unknown as UntypedRpcClient).rpc(fn, args);
}