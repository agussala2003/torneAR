/**
 * Comparación de versiones para el force update.
 *
 * Módulo aparte de `lib/app-version.ts` y sin una sola importación de
 * `react-native` ni de `expo-constants`: es la lógica que decide si un usuario
 * entra o no entra a la app, así que tiene que poder probarse en el proyecto
 * `lib` de Vitest (Node puro, sin RN). Lo que quedó del otro lado —la
 * plataforma, la versión del build, la consulta a Supabase— es plomería.
 */

/**
 * Compara dos versiones tipo "1.4.2".
 *
 * Devuelve <0 si `a` es anterior, 0 si son equivalentes, >0 si es posterior, y
 * `NaN` si alguna no se puede interpretar.
 *
 * Comparación numérica por segmento, no lexicográfica: como texto, "1.10.0" es
 * MENOR que "1.9.0" y el bloqueo se dispararía sobre usuarios que ya están
 * actualizados. Los segmentos faltantes valen 0, así que "1.2" y "1.2.0" son la
 * misma versión.
 */
export function compareVersions(a: string, b: string): number {
  const segmentsA = parseVersion(a);
  const segmentsB = parseVersion(b);

  // Las dos versiones se validan ENTERAS antes de comparar nada. Validar
  // segmento a segmento dentro del loop parecía equivalente y no lo era:
  // "1.0.0-rc1" contra "1.1.0" difieren ya en el segundo segmento, así que la
  // comparación terminaba —devolviendo "es anterior", o sea bloqueando— sin
  // haber mirado nunca el "0-rc1" del tercero. Una versión ilegible tiene que
  // ser indecidible aunque el desacuerdo aparezca antes.
  if (!segmentsA || !segmentsB) return Number.NaN;

  const length = Math.max(segmentsA.length, segmentsB.length);
  for (let i = 0; i < length; i += 1) {
    // Segmentos faltantes valen 0: "1.2" y "1.2.0" son la misma versión.
    const numA = segmentsA[i] ?? 0;
    const numB = segmentsB[i] ?? 0;
    if (numA !== numB) return numA - numB;
  }

  return 0;
}

/**
 * `null` si algún segmento no es dígitos y nada más.
 *
 * No alcanza con `Number()`: `Number('')` es 0, así que "1..0" pasaría como
 * "1.0.0", y `Number(' 2 ')` es 2, con lo que "1. 2 .3" se colaría.
 */
function parseVersion(version: string): number[] | null {
  const segments = version.trim().split('.');
  const parsed: number[] = [];

  for (const segment of segments) {
    if (!/^\d+$/.test(segment)) return null;
    parsed.push(Number(segment));
  }

  return parsed;
}

/**
 * ¿Hay que forzar la actualización?
 *
 * Ante cualquier duda —versión ausente o ilegible de cualquiera de los dos
 * lados— la respuesta es `false`. Un falso positivo acá no degrada la
 * experiencia: la cancela por completo, porque el modal no se puede cerrar y no
 * hay pantalla detrás a la que volver. Dejar entrar a alguien que debería haber
 * actualizado es incomparablemente más barato que dejar afuera a toda la base
 * por un string mal formado.
 */
export function isUpdateRequired(
  currentVersion: string | null | undefined,
  minRequiredVersion: string | null | undefined,
): boolean {
  if (!currentVersion || !minRequiredVersion) return false;

  const comparison = compareVersions(currentVersion, minRequiredVersion);
  if (Number.isNaN(comparison)) return false;

  return comparison < 0;
}
