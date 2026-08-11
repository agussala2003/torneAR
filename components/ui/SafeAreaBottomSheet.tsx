import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, View } from 'react-native';
import type { DimensionValue } from 'react-native';
import { useBottomInset } from '@/hooks/useBottomInset';
import { useKeyboardHeight } from '@/hooks/useKeyboardHeight';

/** Aire entre el fondo del sheet y el teclado cuando está abierto. */
const KEYBOARD_GAP = 8;

interface Props {
  visible: boolean;
  /** Back de Android, botón de cerrar y —si se habilita— tap en el fondo. */
  onClose: () => void;
  children: ReactNode;
  /**
   * Tope de alto del sheet. Sin esto el contenido crece hasta ocupar la
   * pantalla entera y un `ScrollView` interno, sin altura acotada por la que
   * desbordar, nunca llega a scrollear.
   */
  maxHeight?: DimensionValue;
  /** `true` si el contenido tiene campos de texto. */
  avoidKeyboard?: boolean;
  /** Cerrar tocando el fondo oscurecido. */
  dismissOnBackdropPress?: boolean;
  animationType?: 'slide' | 'fade' | 'none';
  /**
   * Se renderiza dentro del `<Modal>`, como hermano del sheet. Para los alerts
   * propios: montados en la pantalla padre quedarían **detrás** del modal
   * nativo.
   */
  overlay?: ReactNode;
  /** Clases de la superficie del sheet. Por defecto el contenedor estándar. */
  surfaceClassName?: string;
}

/**
 * Bottom sheet estándar de la app.
 *
 * Nace de la auditoría E2E: varios sheets tenían el padding inferior hardcodeado
 * (`pb-8`, `pb-10`, `pb-12`) y en edge-to-edge el último control quedaba pisado
 * por la barra de navegación — el botón «Confirmar lista», el segundo equipo del
 * selector, el fondo del modal de invitado. Este componente centraliza las tres
 * decisiones que esos sheets tomaban por separado y mal:
 *
 * 1. **Colchón inferior** desde el inset real del dispositivo (`useBottomInset`).
 * 2. **Tope de alto**, para que el scroll interno funcione.
 * 3. **Teclado**: el sheet es el único dueño del espacio de abajo. En Android
 *    edge-to-edge la ventana no se redimensiona y el `KeyboardAvoidingView`
 *    deja un residuo al replegarse el teclado (ver
 *    `useKeyboardAwareBottomInset`), así que el empuje lo hace este padding y
 *    el KAV queda sólo para iOS.
 */
export function SafeAreaBottomSheet({
  visible,
  onClose,
  children,
  maxHeight = '88%',
  avoidKeyboard = false,
  dismissOnBackdropPress = false,
  animationType = 'slide',
  overlay,
  surfaceClassName = 'bg-surface-container',
}: Props) {
  const restingInset = useBottomInset();
  const keyboardHeight = useKeyboardHeight();

  const keyboardOpen = avoidKeyboard && keyboardHeight > 0;
  const paddingBottom = keyboardOpen
    ? // iOS: el KAV ya empujó el sheet, acá sólo va el aire.
      Platform.OS === 'ios'
      ? KEYBOARD_GAP
      : keyboardHeight + KEYBOARD_GAP
    : restingInset;

  const content = (
    <>
      {dismissOnBackdropPress && (
        <Pressable
          className="absolute inset-0"
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Cerrar"
        />
      )}
      <View
        className={`overflow-hidden rounded-t-3xl ${surfaceClassName}`}
        style={{ maxHeight, paddingBottom }}
      >
        {children}
      </View>
    </>
  );

  return (
    <Modal visible={visible} animationType={animationType} transparent onRequestClose={onClose}>
      {avoidKeyboard ? (
        <KeyboardAvoidingView
          className="flex-1 justify-end bg-black/60"
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          {content}
        </KeyboardAvoidingView>
      ) : (
        <View className="flex-1 justify-end bg-black/60">{content}</View>
      )}
      {overlay}
    </Modal>
  );
}
