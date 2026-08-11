import type { ReactNode } from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppIcon } from './AppIcon';

/**
 * Aire entre la barra de estado del sistema y la fila de retroceso.
 *
 * Mismo criterio que `HEADER_BREATHING_ROOM` en GlobalHeader: se SUMA al inset
 * real en vez de reemplazarlo. `insets.top` es exactamente lo que ocupa el
 * sistema (24 en Android sin notch, ~59 con Dynamic Island), asi que por si
 * solo evita la superposicion pero deja el contenido pegado a la hora y la
 * bateria — que es lo que se reporto en el QA fisico.
 */
const HEADER_BREATHING_ROOM = 12;

interface SecondaryHeaderProps {
  /** Se renderiza SIEMPRE en mayusculas: el componente aplica `uppercase`. */
  title: string;
  /** Linea opcional de contexto debajo del titulo. */
  subtitle?: string;
  /** Por defecto `router.back()`. Pasalo solo si hay que confirmar o limpiar estado antes de salir. */
  onBack?: () => void;
  /** Texto del boton de retroceso. Se puede acortar en pantallas con acciones anchas a la derecha. */
  backLabel?: string;
  /** Acciones de la pantalla (marcar como leido, filtros, refresh). Van a la derecha de la fila de retroceso. */
  rightSlot?: ReactNode;
}

/**
 * Cabecera unificada de todas las pantallas secundarias (todo lo que no es una
 * tab con GlobalHeader).
 *
 * Reemplaza ~20 cabeceras escritas a mano que no coincidian entre si: unas
 * usaban `pt-1` fijo, otras `pt-2`, otras metian el titulo centrado con
 * `pr-10` para compensar el ancho del boton de atras.
 *
 * ## Layout: fila de navegacion arriba, titulo abajo
 *
 * El titulo NO va centrado en la misma fila que el boton de atras. Con
 * `font-displayBlack` + `uppercase`, titulos como "TERMINOS Y CONDICIONES" o
 * "REVISION DE DISPUTAS" no entran al lado del boton, y el hack de centrarlos
 * con padding compensatorio se rompia apenas la pantalla sumaba una accion a la
 * derecha. Apilado, el titulo dispone del ancho completo y `rightSlot` nunca
 * compite por espacio.
 *
 * ## El inset lo aplica este componente
 *
 * Las pantallas que lo usan NO deben envolverse en un `SafeAreaView` con el
 * borde superior activo: se duplicaria el padding. Usar `edges={['bottom']}`
 * o un `View` comun.
 */
export function SecondaryHeader({
  title,
  subtitle,
  onBack,
  backLabel = 'Volver',
  rightSlot,
}: SecondaryHeaderProps) {
  const insets = useSafeAreaInsets();
  const handleBack = onBack ?? (() => router.back());

  return (
    <View
      className="border-b border-neutral-outline/15 bg-surface-base px-4 pb-3"
      style={{ paddingTop: insets.top + HEADER_BREATHING_ROOM }}
    >
      <View className="flex-row items-center justify-between">
        {/* Sin `bg`/`rounded`: el QA marco que la caja de fondo lo hacia leer
            como un boton primario y competia con las acciones reales de la
            pantalla. El hitSlop compensa el area tactil que pierde al quedar
            sin padding propio. */}
        <TouchableOpacity
          onPress={handleBack}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel={backLabel}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          className="-ml-0.5 flex-row items-center gap-1"
        >
          <AppIcon family="material-icons" name="arrow-back-ios-new" size={18} color="#BCCBB9" />
          <Text className="font-ui text-sm text-neutral-on-surface-variant">{backLabel}</Text>
        </TouchableOpacity>

        {/* `shrink-0` + `ml-3`: las acciones mantienen su ancho natural y es el
            label de retroceso el que cede espacio si hiciera falta. */}
        {rightSlot ? <View className="ml-3 shrink-0 flex-row items-center gap-2">{rightSlot}</View> : null}
      </View>

      <Text
        numberOfLines={1}
        className="font-displayBlack mt-2 text-2xl uppercase tracking-tight text-neutral-on-surface"
      >
        {title}
      </Text>

      {subtitle ? (
        <Text numberOfLines={2} className="font-ui mt-0.5 text-xs text-neutral-on-surface-variant">
          {subtitle}
        </Text>
      ) : null}
    </View>
  );
}
