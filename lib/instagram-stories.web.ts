import { shareGeneric } from '@/lib/share-image';

/**
 * Variante web (Metro resuelve este archivo automáticamente por el sufijo
 * `.web.ts` — ver `instagram-stories.native.ts` para iOS/Android).
 *
 * `react-native-share` no tiene build de web: importarlo desde un módulo que
 * el bundle de web también incluye rompía la pantalla entera con
 * "Cannot read properties of undefined (reading 'getEnforcing')" apenas se
 * cargaba `ShareMatchButton` (el error salta al importar, antes de que
 * cualquier chequeo de plataforma en runtime pueda evitarlo). Por eso el
 * split de archivos y no un `if (Platform.OS !== 'web')` adentro de uno solo.
 *
 * No hay Instagram Stories nativo en un navegador, así que acá se cae directo
 * al share genérico (mismo fallback que usa la versión nativa cuando
 * Instagram no está disponible).
 */
export async function shareToInstagramStories(uri: string): Promise<void> {
  return shareGeneric(uri);
}
