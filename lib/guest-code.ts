import { getGenericSupabaseErrorMessage } from '@/lib/auth-error-messages';

/**
 * E7 — Caducidad del código de invitado, del lado del cliente.
 *
 * ⚠️ **El servidor es la autoridad.** La regla vive en
 * `public.match_guest_code_expires_at` y la aplica `join_match_as_guest`
 * (migración `20260729120000`); el valor real sale de
 * `app_settings.guest_code_ttl_hours`, que producto puede ajustar sin
 * desplegar. Lo de acá es sólo presentación y pre-chequeo: sirve para decir
 * "este código venció" antes de gastar un round-trip y para mostrar hasta
 * cuándo vale, nunca para autorizar. Mismo criterio que el radio del geofence.
 */
export const GUEST_CODE_TTL_HOURS = 48;

/**
 * Cuándo deja de valer el código de un partido.
 *
 * `scheduled_at` primero y `created_at` como respaldo, igual que el servidor:
 * el uso real del código es el día del partido, así que contar el TTL desde la
 * creación lo mataría antes de que se juegue. El partido que nunca se coordinó
 * cae en `created_at`, que es justo el caso del código eterno que E7 describe.
 */
export function getGuestCodeExpiry(
  scheduledAt: string | null | undefined,
  createdAt?: string | null,
): Date | null {
  const anchor = scheduledAt ?? createdAt ?? null;
  if (!anchor) return null;

  const parsed = new Date(anchor);
  if (Number.isNaN(parsed.getTime())) return null;

  return new Date(parsed.getTime() + GUEST_CODE_TTL_HOURS * 60 * 60 * 1000);
}

/**
 * `false` cuando no hay con qué calcular: sin ancla, la decisión es del
 * servidor. Adivinar "vencido" acá le bloquearía la pantalla al usuario por un
 * dato que no tenemos.
 */
export function isGuestCodeExpired(
  scheduledAt: string | null | undefined,
  createdAt?: string | null,
  now: Date = new Date(),
): boolean {
  const expiry = getGuestCodeExpiry(scheduledAt, createdAt);
  if (!expiry) return false;
  return now.getTime() > expiry.getTime();
}

/** Formato corto y local para mostrar el vencimiento junto al código. */
export function formatGuestCodeExpiry(expiry: Date): string {
  return expiry.toLocaleDateString('es-AR', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Traduce el error de `join_match_as_guest`.
 *
 * `GUEST_CODE_EXPIRED` llega con prefijo estable desde la RPC: sin este
 * traductor, `getGenericSupabaseErrorMessage` descarta el `message` y el
 * usuario lee "No se pudo completar la operación" en vez de enterarse de que
 * el código venció — que es la única información que le permite pedir otro.
 */
export function getGuestJoinErrorMessage(error: unknown, fallback?: string): string {
  const message = (error as { message?: string })?.message ?? '';

  if (message.includes('GUEST_CODE_EXPIRED')) {
    return 'El código de este partido venció. Pedile al capitán el código de un partido vigente.';
  }

  return getGenericSupabaseErrorMessage(error, fallback);
}
