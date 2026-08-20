/**
 * Medidas intrínsecas de los assets de marca.
 *
 * El wordmark (`assets/new-images/logo_nombre_derecha.png`) venía con padding
 * transparente: el lienzo era 2169 × 725 pero el logo real ocupaba 1981 × 605,
 * o sea 8,7% de aire horizontal y 16,6% vertical. Con `contentFit="contain"` ese
 * aire entra en el layout como si fuera parte del logo, así que la caja quedaba
 * más grande que lo que se ve y el logo no alineaba con nada — el bug del
 * header. El PNG ya está recortado a su bounding box, sin pérdida de píxeles.
 *
 * El ratio vive acá y no en cada pantalla porque el wordmark se usa en dos
 * lugares con alturas distintas —el header y la marca de agua de la tarjeta
 * para compartir— y cada uno tenía su propia copia del `2169 / 725`. Recortar
 * el asset y actualizar sólo uno habría dejado al otro con el ratio viejo,
 * letterboxeando la marca de agua justo en la pieza que se comparte afuera.
 *
 * Si el asset se vuelve a exportar, se actualiza `WORDMARK_INTRINSIC` y las dos
 * pantallas siguen solas.
 */
export const WORDMARK_INTRINSIC = { width: 1981, height: 605 } as const;

/**
 * Ancho que le corresponde al wordmark para una altura dada.
 *
 * Se calcula el ancho en vez de usar `aspectRatio` con un solo lado: en un
 * `flex-row` sin stretch, Yoga (el layout nativo de iOS/Android) no siempre
 * deriva el ancho a partir de la altura de forma confiable con `expo-image` —
 * anda bien en react-native-web, que usa CSS real, pero en el celular el logo
 * terminaba con 0 de ancho. Mismo criterio que el resto de las imágenes locales
 * de la app (`TeamShield`, `MarketCards`): las dos dimensiones, explícitas.
 */
export function wordmarkWidthFor(height: number): number {
  return Math.round(height * (WORDMARK_INTRINSIC.width / WORDMARK_INTRINSIC.height));
}
