import { supabase } from '@/lib/supabase';
import { Logger } from '@/lib/logger';

/**
 * Qué pasó con un código de referido. Es el campo `status` de los eventos
 * `referral.resolve` en `app_logs`, y la dimensión sobre la que se agrupa el
 * embudo de crecimiento.
 *
 *  · `applied`          — quedó vinculado.
 *  · `noop_invalid`     — el username no existe (link viejo, typo al tipearlo).
 *  · `noop_self`        — se refirió a sí mismo.
 *  · `noop_already_set` — ya tenía referente; la primera asignación gana.
 *  · `rpc_error`        — falló la RPC (red o base).
 *  · `unknown`          — la RPC corrió bien pero no pudimos clasificar el
 *                         resultado; ver la nota sobre `set_referral` abajo.
 */
export type ReferralOutcome =
  | 'applied'
  | 'noop_invalid'
  | 'noop_self'
  | 'noop_already_set'
  | 'rpc_error'
  | 'unknown';

/** Nombre del evento en `app_logs`. Mismo criterio que `checkin.geofence`. */
const LOG_EVENT = 'referral.resolve';

/**
 * Resuelve el username de referido pendiente contra `set_referral`.
 *
 * Falla silenciosa por diseño: `set_referral` no-opea ante un username
 * inválido, auto-referido, o un `referred_by` ya seteado (ver la migración
 * `20260817180000_referral_system.sql`), y acá se traga además cualquier error
 * de red/RPC. El onboarding nunca se bloquea por esto — en el peor caso, el
 * usuario no queda vinculado a nadie.
 *
 * ─── Por qué la clasificación se hace desde el cliente ──────────────────────
 * `set_referral` es `RETURNS void` y no-opea en silencio, así que su respuesta
 * no distingue «lo vinculé» de «el username no existía» ni de «ya tenía
 * referente». Para el embudo de crecimiento eso es exactamente lo que hace
 * falta saber: sin esto, un link roto y un referido exitoso se ven igual y las
 * métricas no sirven.
 *
 * Mientras la RPC no devuelva un estado, se reconstruye acá leyendo el estado
 * PREVIO —una vez aplicada ya no se puede distinguir «lo pusimos nosotros» de
 * «ya estaba»— y replicando el orden de precedencia de la función.
 *
 * Dos límites que conviene tener presentes:
 *
 *  1. La clasificación NO decide nada. La RPC se llama siempre y con el mismo
 *     argumento que antes; si el espejo de las reglas quedara desactualizado,
 *     lo que miente es el log, nunca el resultado.
 *  2. `set_referral` compara con `lower(username)` y desde el cliente no hay
 *     `lower()`: se compara contra el username en minúsculas. El schema
 *     (`userSchema.ts`) sólo admite minúsculas, así que aplica a todos los
 *     perfiles reales; un perfil legacy con mayúsculas se registraría como
 *     `noop_invalid` aunque la RPC sí lo hubiera vinculado.
 *
 * El arreglo de fondo es que `set_referral` devuelva su estado. Cuando eso
 * ocurra, las dos lecturas de acá se borran y el `status` sale de la RPC.
 *
 * @param referredByUsername Username del referente, tal como vino del link.
 * @param authUserId `auth.users.id` del usuario que está completando el
 *   onboarding. Hace falta para leer su propio `referred_by` previo.
 */
export async function resolveAndSetReferral(
  referredByUsername: string,
  authUserId: string,
): Promise<ReferralOutcome> {
  const username = referredByUsername.trim().toLowerCase();
  const startedAt = Date.now();

  // Estado previo, ANTES de tocar nada. Las dos lecturas son independientes,
  // así que van en paralelo: esto corre dentro del envío del onboarding y no
  // hay motivo para encadenar dos viajes.
  const [selfResult, referrerResult] = await Promise.all([
    supabase.from('profiles').select('id, referred_by').eq('auth_user_id', authUserId).maybeSingle(),
    // `eq` y no `ilike`: los usernames admiten `_`, que en LIKE es un comodín
    // de un carácter — `ilike` haría que `juan_perez` matchee `juanXperez`.
    supabase.from('profiles').select('id').eq('username', username).maybeSingle(),
  ]);

  const self = selfResult.error ? null : selfResult.data;
  const referrer = referrerResult.error ? null : referrerResult.data;
  // Si una lectura falló no podemos afirmar nada: `noop_invalid` sería una
  // conclusión inventada a partir de un error de red.
  const classifiable = !selfResult.error && !referrerResult.error && self !== null;

  const { error } = await supabase.rpc('set_referral', {
    p_referred_by_username: referredByUsername,
  });

  if (error) {
    Logger.warn('No se pudo resolver el referido; el onboarding sigue sin bloquearse', {
      scope: 'referral-data.resolveAndSetReferral',
      event: LOG_EVENT,
      status: 'rpc_error' satisfies ReferralOutcome,
      referredByUsername: username,
      durationMs: Date.now() - startedAt,
      error,
    });
    return 'rpc_error';
  }

  // Mismo orden de precedencia que `set_referral`: primero descarta el
  // referente (inexistente o uno mismo) y recién después mira si ya había uno.
  // Invertirlo reportaría `noop_already_set` en casos que la RPC cortó antes.
  const status: ReferralOutcome = !classifiable
    ? 'unknown'
    : referrer === null
      ? 'noop_invalid'
      : referrer.id === self!.id
        ? 'noop_self'
        : self!.referred_by !== null
          ? 'noop_already_set'
          : 'applied';

  Logger.info('Referido resuelto', {
    scope: 'referral-data.resolveAndSetReferral',
    event: LOG_EVENT,
    status,
    referredByUsername: username,
    referrerProfileId: referrer?.id ?? null,
    durationMs: Date.now() - startedAt,
  });

  return status;
}
