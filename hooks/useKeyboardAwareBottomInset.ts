import { useEffect, useState } from 'react';
import { Keyboard, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

/**
 * Padding inferior para una barra fija (el input de los chats).
 *
 * Resuelve las dos mitades del mismo problema:
 *
 * 1. **Teclado cerrado.** La barra usaba un padding fijo, así que en los
 *    teléfonos con gesture bar quedaba literalmente pegada al borde y el botón
 *    de enviar competía con el gesto de "volver" del sistema. Se usa
 *    `insets.bottom`, que es la altura real de esa barra en cada dispositivo.
 *
 * 2. **Teclado abierto.** Acá `insets.bottom` deja de corresponder: el teclado
 *    ya tapa la gesture bar, y el `KeyboardAvoidingView` encima empuja la barra
 *    la altura del teclado. Sumarle además el inset abre un hueco muerto entre
 *    el input y el teclado. Por eso al abrirse el teclado el padding cae al
 *    mínimo.
 *
 * `keyboardWillShow` en iOS (llega antes de la animación, así que el cambio va
 * en el mismo frame) y `keyboardDidShow` en Android, que es el único que
 * dispara.
 */
export function useKeyboardAwareBottomInset(minimum = 8): number {
  const insets = useSafeAreaInsets();
  const [keyboardVisible, setKeyboardVisible] = useState(false);

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const showSub = Keyboard.addListener(showEvent, () => setKeyboardVisible(true));
    const hideSub = Keyboard.addListener(hideEvent, () => setKeyboardVisible(false));

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  return keyboardVisible ? minimum : Math.max(insets.bottom, minimum);
}
