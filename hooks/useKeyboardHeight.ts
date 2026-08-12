import { useEffect, useState } from 'react';
import { Keyboard, Platform } from 'react-native';
import type { KeyboardEvent } from 'react-native';

/**
 * Alto real del teclado en pantalla; `0` cuando está cerrado.
 *
 * Única fuente de la medición del teclado en la app: la usan
 * `useKeyboardAwareBottomInset` (barra de input de los chats) y
 * `SafeAreaBottomSheet` (sheets con campos de texto). Tener dos copias de esta
 * lógica es cómo se desincronizan las plataformas.
 *
 * `will` en iOS: llega **antes** de la animación, así que el cambio entra en el
 * mismo frame. En Android los `will` no existen — `did` son los únicos que
 * disparan.
 */
export function useKeyboardHeight(): number {
  const [height, setHeight] = useState(0);

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const showSub = Keyboard.addListener(showEvent, (event: KeyboardEvent) => {
      setHeight(event.endCoordinates?.height ?? 0);
    });
    const hideSub = Keyboard.addListener(hideEvent, () => setHeight(0));

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  return height;
}

/**
 * `true` mientras el teclado está en pantalla.
 *
 * Derivado de `useKeyboardHeight` y no de un listener propio: dos suscripciones
 * al mismo evento se desincronizan en el frame en el que una ya actualizó y la
 * otra no.
 *
 * Existe para condicionar el `keyboardVerticalOffset` de los chats — con el
 * teclado cerrado el offset debe ser 0, o el input queda desplazado.
 */
export function useIsKeyboardVisible(): boolean {
  return useKeyboardHeight() > 0;
}
