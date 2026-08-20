import { Logger } from '@/lib/logger';

/**
 * Instrumentación de compartir (Fase 6.2).
 *
 * ── Por qué existe ───────────────────────────────────────────────────────────
 * No podemos medir vistas de una Story de Instagram: una vez que la imagen sale
 * de la app, Meta no nos devuelve absolutamente nada — ni impresiones, ni
 * clicks, ni si la Story se llegó a publicar. Ni `expo-sharing` ni el
 * `shareToInstagramStories` nativo resuelven con un "el usuario posteó": en
 * Android el intent se considera entregado apenas se abre la app destino.
 *
 * Lo único observable de nuestro lado es la INTENCIÓN: el usuario tocó el botón
 * y arrancó el flujo. Es una métrica de embudo (cuántas tarjetas generadas
 * terminan en un intento de compartir, y hacia dónde), no de alcance. Nombrarla
 * bien importa: si mañana alguien lee "share.instagram" como "shares
 * publicados", el número miente por arriba.
 *
 * ── Por qué pasa por Logger y no por un INSERT propio ────────────────────────
 * `lib/logger.ts` ya resuelve las cuatro cosas que este evento necesita y que
 * un `supabase.from('app_logs').insert(...)` suelto tendría que repetir:
 *   · el `user_id` de AUTH (el FK de app_logs apunta a `auth.users`, no a
 *     `profiles` — ver el comentario de "Sesion cacheada" en logger.ts), ya
 *     cacheado en memoria y sin un `await getSession()` en el camino caliente;
 *   · fire-and-forget real: devuelve `void`, así que es imposible bloquear el
 *     tap del usuario esperando el INSERT;
 *   · el catch que impide que un fallo de telemetría se propague a la UI;
 *   · el rate limit y el truncado de payload.
 *
 * ⚠️ Ese rate limit (30 logs/minuto) es COMPARTIDO con la telemetría de
 * errores. Es aceptable acá porque estos eventos los dispara un tap humano
 * sobre un modal —techo real de un puñado por minuto—, pero es el motivo por
 * el que este módulo no debe crecer hacia analytics de alta frecuencia
 * (scrolls, impresiones, navegación). Eso necesitaría su propio canal, no
 * comerse el presupuesto de los errores.
 */

/** Destinos instrumentados. Espeja `ShareTarget` de `ShareMatchButton` a
 *  propósito: si mañana se suma un tercer botón, el tipo de acá tiene que
 *  fallar la compilación hasta que se decida cómo se llama su evento. */
export type ShareAnalyticsTarget = 'instagram' | 'generic';

/**
 * `message` de `app_logs` para cada destino.
 *
 * Constantes con prefijo `share.` y no un template string armado al vuelo:
 * el panel de /dashboard/health agrupa por `message` exacto, así que estos
 * literales SON el identificador del evento. Un typo en un template no rompe
 * nada visible, sólo parte la serie en dos.
 */
const SHARE_EVENT_MESSAGE: Record<ShareAnalyticsTarget, string> = {
  instagram: 'share.instagram',
  generic: 'share.generic',
};

interface ShareIntentPayload {
  target: ShareAnalyticsTarget;
  /** `profiles.id` del usuario que comparte. Va en `details` y NO en la
   *  columna `user_id`: esa columna es un FK a `auth.users` y la llena el
   *  Logger sola. Guardar acá el id de perfil es lo que permite cruzar el
   *  evento contra `profiles` sin pasar por `auth`. */
  profileId: string | null;
  matchId: string;
  /** Equipo desde cuya perspectiva se armó la tarjeta. Sin esto no se puede
   *  saber si los que comparten son mayoritariamente los que ganaron. */
  teamId: string;
}

/**
 * Registra que el usuario ARRANCÓ el flujo de compartir.
 *
 * Se llama antes de la captura de imagen, no después de que el share nativo
 * resuelva: el evento que interesa es la intención, y una captura que falla
 * (binario viejo sin `react-native-view-shot`, ver `lib/share-image.ts`)
 * también es una intención — de hecho, es justo la que más urge conocer.
 *
 * Devuelve `void`, igual que todo `Logger`: es imposible `await`-earlo por
 * accidente y frenar el tap.
 */
export function trackShareIntent({
  target,
  profileId,
  matchId,
  teamId,
}: ShareIntentPayload): void {
  Logger.info(SHARE_EVENT_MESSAGE[target], {
    scope: 'share-analytics.trackShareIntent',
    // Redundante con `message`, y a propósito: deja el evento filtrable desde
    // `details->>'event'` sin depender de un LIKE sobre el texto del mensaje.
    event: SHARE_EVENT_MESSAGE[target],
    target,
    profileId,
    matchId,
    teamId,
  });
}
