import { useSafeAreaInsets } from 'react-native-safe-area-context';

/**
 * Alto del contenido de la Tab Bar, sin el inset del sistema.
 *
 * Vive acá y no en `app/(tabs)/_layout.tsx` porque lo necesitan dos partes que
 * tienen que coincidir: el `tabBarStyle` que dibuja la barra y el padding
 * inferior de cada pantalla que scrollea por debajo de ella. Cuando el numero
 * estaba solo en el layout, las pantallas lo replicaban a ojo (`paddingBottom:
 * 114`, `120`) y quedaban cortas o largas segun el equipo.
 */
export const TAB_BAR_CONTENT_HEIGHT = 62;

interface TabBarInsetOptions {
  /** Aire extra entre el ultimo elemento y la barra. */
  gap?: number;
}

/**
 * Padding inferior que necesita una lista o scroll de una pantalla con Tab Bar.
 *
 * La barra es `position: 'absolute'`, asi que **flota sobre el contenido**: sin
 * este colchon el ultimo elemento queda debajo de ella y es inalcanzable. Su
 * alto real es `TAB_BAR_CONTENT_HEIGHT + insets.bottom`, y ese inset va de 0
 * (Android con botones) a ~34 (Home Indicator), que es justo el rango en el que
 * un numero fijo falla: el `paddingBottom: 114` de antes sobraba 30px en un
 * telefono y quedaba corto en otro.
 */
export function useTabBarInset({ gap = 24 }: TabBarInsetOptions = {}): number {
  const insets = useSafeAreaInsets();
  return TAB_BAR_CONTENT_HEIGHT + insets.bottom + gap;
}
