import { useEffect, useState } from 'react';
import { Keyboard, Platform } from 'react-native';
import type { KeyboardEvent } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

/**
 * Padding inferior de una barra fija anclada al fondo (el input de los chats).
 *
 * Devuelve **todo** el espacio que la barra necesita abajo, tanto en reposo como
 * con el teclado abierto. Es el único dueño de ese espacio: en Android el
 * `KeyboardAvoidingView` NO debe empujar además, o se suman dos empujes.
 *
 * ## Por qué el cálculo no se delega en el KeyboardAvoidingView (Android)
 *
 * La app corre edge-to-edge (`app.json` → `android.edgeToEdgeEnabled`), así que
 * la ventana no se redimensiona con el teclado y el KAV tiene que empujar. Pero
 * el KAV deriva ese empuje de su propio frame contra `endCoordinates.screenY`,
 * y en edge-to-edge el frame se extiende por debajo de la barra de navegación
 * mientras el evento de cierre reporta la coordenada por encima de ella: al
 * replegarse el teclado queda un **residuo** del alto de la barra que nunca
 * vuelve a cero. Ese residuo se sumaba al inset de reposo y dejaba el input
 * flotando muy por encima de la barra — visiblemente distinto de cómo se veía
 * al entrar al chat (auditoría E2E, módulo 3.3).
 *
 * Acá el empuje se calcula desde el alto real del teclado, que sí vuelve a 0 de
 * forma determinista, y el KAV queda sólo para iOS (donde `padding` sí se
 * comporta bien y el evento llega antes de la animación).
 *
 * ## El inset de reposo se congela
 *
 * Con el IME abierto el teclado es un system inset más, y el provider puede
 * reportar `insets.bottom` inflado con su altura. Por eso el valor de reposo se
 * captura sólo mientras el teclado está cerrado: la posición de descanso no
 * depende de lo que informe el provider durante la animación.
 *
 * @param gap Aire mínimo entre la barra y lo que tenga debajo (gesture bar o
 *            teclado). Sin esto el input quedaba flush contra la barra del
 *            sistema y el botón de enviar competía con el gesto de "volver".
 */
export function useKeyboardAwareBottomInset(gap = 8): number {
  const insets = useSafeAreaInsets();
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [restingInset, setRestingInset] = useState(insets.bottom);

  // Sólo se actualiza con el teclado cerrado (ver "el inset de reposo se congela").
  useEffect(() => {
    if (keyboardHeight === 0 && insets.bottom !== restingInset) {
      setRestingInset(insets.bottom);
    }
  }, [insets.bottom, keyboardHeight, restingInset]);

  useEffect(() => {
    // `will` en iOS: llega antes de la animación, así que el cambio va en el
    // mismo frame. En Android `keyboardDidShow`/`DidHide` son los únicos que
    // disparan.
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const showSub = Keyboard.addListener(showEvent, (event: KeyboardEvent) => {
      setKeyboardHeight(event.endCoordinates?.height ?? 0);
    });
    const hideSub = Keyboard.addListener(hideEvent, () => setKeyboardHeight(0));

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  // Reposo: la altura real de la gesture bar (o de los botones) más el aire.
  if (keyboardHeight === 0) {
    return restingInset + gap;
  }

  // Teclado abierto: el inset de reposo ya no corresponde — el teclado tapa la
  // barra del sistema. En iOS el KAV hace el empuje y acá sólo va el aire; en
  // Android el empuje es este padding.
  return Platform.OS === 'ios' ? gap : keyboardHeight + gap;
}
