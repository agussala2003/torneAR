import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface BottomInsetOptions {
  /**
   * Piso para los dispositivos que reportan inset 0 (sin gesture bar), donde
   * un padding de 0 dejaría el contenido pegado al borde físico.
   */
  minimum?: number;
  /**
   * Aire **extra** por encima de la barra del sistema. Para superficies cuyo
   * último elemento llega hasta el borde (un botón anclado abajo), donde el
   * inset justo deja el control flush contra la gesture bar y competiendo con
   * el gesto de "volver".
   */
  gap?: number;
}

/**
 * Colchón inferior de cualquier superficie anclada al fondo: sheets, barras de
 * acción fijas, botoneras absolutas.
 *
 * La app corre edge-to-edge (`app.json` → `android.edgeToEdgeEnabled`), así que
 * **nada** se aparta solo de la barra de navegación: un `pb-8` fijo alcanza en
 * un teléfono con gesture bar delgada y queda corto en uno con botones. El
 * único valor correcto es el inset real del dispositivo.
 *
 * Es la contraparte estática de `useKeyboardAwareBottomInset`, que resuelve lo
 * mismo para barras que además tienen que esquivar el teclado.
 */
export function useBottomInset({ minimum = 16, gap = 0 }: BottomInsetOptions = {}): number {
  const insets = useSafeAreaInsets();
  return Math.max(insets.bottom + gap, minimum);
}
