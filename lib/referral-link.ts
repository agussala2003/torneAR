/**
 * Enlace de invitación y su mensaje.
 *
 * El "código de referido" ES el username. No hay un código opaco aparte:
 * `profiles.username` ya es `unique` desde el esquema inicial, y la migración
 * del sistema de referidos lo eligió explícitamente por eso
 * (`20260817180000_referral_system.sql`). `set_referral` resuelve el username
 * contra `profiles` sin distinguir mayúsculas.
 *
 * El scheme va escrito acá y NO se arma con `Linking.createURL`: esa función
 * devuelve la URL del cliente en ejecución —`exp://192.168.x.x/--/…` en Expo
 * Go, por ejemplo— y este link se le manda a otra persona, así que tiene que
 * ser siempre el scheme público de la app. `lib/deep-linking.ts` normaliza
 * tanto `tornear://login` como `tornear:///login`, con lo cual esta forma entra
 * sin ambigüedad y `app/login.tsx` la levanta desde `useLocalSearchParams`.
 */
const APP_SCHEME = 'tornear';

/** `tornear://login?ref=<username>` — lo que consume `app/login.tsx`. */
export function buildReferralLink(username: string): string {
  return `${APP_SCHEME}://login?ref=${encodeURIComponent(username)}`;
}

/**
 * Mensaje que se abre en el share nativo. El código va TAMBIÉN en texto plano
 * a propósito: si quien recibe la invitación no tiene la app instalada, el
 * `tornear://` no le abre nada, y el código suelto es lo único que le queda
 * utilizable para tipear a mano al registrarse.
 */
export function buildReferralMessage(username: string): string {
  return `¡Sumate a torneAR! Registrate con mi código: ${username} y empezá a rankear: ${buildReferralLink(username)}`;
}
