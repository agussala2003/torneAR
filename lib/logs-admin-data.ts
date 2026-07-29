import { supabase } from '@/lib/supabase';
import type { Json } from '@/types/supabase';
import type { LogLevel } from '@/lib/logger';

/**
 * Lectura de `app_logs` para el panel de admin (app/admin/logs.tsx).
 *
 * El SELECT lo gatea RLS (`app_logs_select_admin`): un no-admin no recibe un
 * error, recibe cero filas. La pantalla igual chequea `profile.is_admin` para
 * no mostrar un "no hay logs" enganoso.
 */

export type AppLogEntry = {
  id: string;
  level: LogLevel;
  message: string;
  details: Json | null;
  createdAt: string;
  userId: string | null;
  /** Nombre del perfil dueno de `userId`, resuelto aparte (ver abajo). */
  userName: string | null;
};

/** Tope por carga. El panel es de triage, no un explorador de logs completo. */
export const LOGS_PAGE_SIZE = 100;

function isLogLevel(value: string): value is LogLevel {
  return value === 'info' || value === 'warn' || value === 'error';
}

/**
 * `app_logs.user_id` apunta a `auth.users`, no a `profiles`, asi que PostgREST
 * no puede embeber el nombre: no hay FK entre las dos tablas que pueda seguir.
 * Se resuelve con una segunda query sobre los ids unicos de la pagina.
 */
async function fetchUserNames(authUserIds: string[]): Promise<Map<string, string>> {
  if (authUserIds.length === 0) return new Map();

  const { data, error } = await supabase
    .from('profiles')
    .select('auth_user_id, full_name')
    .in('auth_user_id', authUserIds);

  if (error) throw error;

  return new Map((data ?? []).map((row) => [row.auth_user_id, row.full_name]));
}

export async function fetchAppLogs(
  level: LogLevel | null,
  limit: number = LOGS_PAGE_SIZE,
): Promise<AppLogEntry[]> {
  let query = supabase
    .from('app_logs')
    .select('id, level, message, details, created_at, user_id')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (level) {
    query = query.eq('level', level);
  }

  const { data, error } = await query;
  if (error) throw error;

  const rows = data ?? [];
  const userIds = [...new Set(rows.map((row) => row.user_id).filter((id): id is string => !!id))];
  const names = await fetchUserNames(userIds);

  return rows.map((row) => ({
    id: row.id,
    // `level` es `text` con CHECK en la BD, no un enum de Postgres: el tipo
    // generado es `string`, asi que se estrecha aca en el borde del DAL.
    level: isLogLevel(row.level) ? row.level : 'info',
    message: row.message,
    details: row.details,
    createdAt: row.created_at,
    userId: row.user_id,
    userName: row.user_id ? (names.get(row.user_id) ?? null) : null,
  }));
}
