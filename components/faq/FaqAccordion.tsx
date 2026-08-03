import { useCallback } from 'react';
import { Text, TouchableOpacity, View, type LayoutChangeEvent } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { AppIcon } from '@/components/ui/AppIcon';
import type { FaqCategory, FaqEntry } from './types';

interface Props {
  category: FaqCategory;
  expanded: boolean;
  onToggle: () => void;
}

const OPEN_DURATION_MS = 220;
const CLOSE_DURATION_MS = 170;

/**
 * Un dato duro dentro de una respuesta: etiqueta a la izquierda, valor a la
 * derecha en verde. Es lo que permite que la respuesta larga se pueda "escanear"
 * sin leerla entera — el usuario que sólo quiere saber el radio del geofence lo
 * encuentra sin buscarlo en el párrafo.
 */
function FactRow({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-row items-center justify-between gap-3 py-1.5">
      <Text className="font-ui flex-1 text-xs text-neutral-on-surface-variant">{label}</Text>
      <Text className="font-uiBold text-right text-xs text-brand-primary">{value}</Text>
    </View>
  );
}

function FaqEntryBlock({ entry, isLast }: { entry: FaqEntry; isLast: boolean }) {
  return (
    <View className={isLast ? '' : 'mb-4 border-b border-neutral-outline-variant/30 pb-4'}>
      <Text className="font-uiBold mb-1.5 text-sm leading-5 text-neutral-on-surface">
        {entry.question}
      </Text>
      <Text className="font-ui text-[13px] leading-[19px] text-neutral-on-surface-variant">
        {entry.answer}
      </Text>

      {entry.facts && entry.facts.length > 0 && (
        <View className="mt-3 rounded-xl bg-surface-lowest px-3 py-1.5">
          {entry.facts.map((fact) => (
            <FactRow key={fact.label} label={fact.label} value={fact.value} />
          ))}
        </View>
      )}
    </View>
  );
}

/**
 * Sección desplegable de una categoría de reglas.
 *
 * ── Por qué el encabezado no está animado ───────────────────────────────────
 * La versión anterior montaba y desmontaba el cuerpo con `entering={FadeIn}`.
 * Al cerrar, el desmontaje de una vista con animación de entrada en vuelo dejaba
 * al hermano —el encabezado— con la opacidad de la animación interrumpida: el
 * título y la bajada desaparecían y la tarjeta quedaba como una caja gris vacía.
 *
 * El arreglo no es ajustar la animación de entrada: es que el encabezado **no
 * participe de ninguna animación**. Hoy es un `TouchableOpacity` común, sin
 * estilo animado y sin desmontarse nunca. Lo único animado del encabezado es el
 * chevron, que vive en su propio `Animated.View` aislado y no puede afectar al
 * texto que tiene al lado.
 *
 * ── Cómo se anima el cuerpo ─────────────────────────────────────────────────
 * `height` y `opacity` se interpolan sobre el contenedor del cuerpo y sólo
 * sobre él. El contenido va en una vista `absolute` adentro: así no aporta alto
 * al contenedor (que lo controla la animación) pero `onLayout` igual reporta su
 * alto natural, que es contra lo que se interpola. Sin esa medición habría que
 * elegir entre animar a una altura fija inventada o no animar.
 *
 * El costo asumido: el contenido de todas las categorías queda montado siempre.
 * Es contenido estático y sin consultas, así que se paga una vez al abrir la
 * pantalla; a cambio la animación es correcta desde el primer toque en lugar de
 * necesitar una apertura previa para conocer la altura.
 */
export function FaqAccordion({ category, expanded, onToggle }: Props) {
  /** Alto natural del cuerpo, medido sobre el contenido real. */
  const bodyHeight = useSharedValue(0);

  /** 0 = cerrado · 1 = abierto. Única fuente de la animación. */
  const progress = useDerivedValue(() =>
    withTiming(expanded ? 1 : 0, {
      duration: expanded ? OPEN_DURATION_MS : CLOSE_DURATION_MS,
    }),
  );

  const handleBodyLayout = useCallback(
    (event: LayoutChangeEvent) => {
      const measured = event.nativeEvent.layout.height;
      // Se reasigna en cada layout (rotación, escala de fuente del sistema): el
      // alto de destino tiene que seguir al contenido, no quedar fijo al primero.
      if (measured > 0) bodyHeight.value = measured;
    },
    [bodyHeight],
  );

  const chevronStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${progress.value * 180}deg` }],
  }));

  const bodyStyle = useAnimatedStyle(() => ({
    height: progress.value * bodyHeight.value,
    opacity: progress.value,
  }));

  return (
    <View
      className={`mb-3 overflow-hidden rounded-2xl bg-surface-container ${
        expanded ? 'border border-brand-primary/25' : ''
      }`}
    >
      {/* ⚠️ Encabezado sin animación y siempre montado. Cualquier estilo animado
          acá reintroduce el bug de la caja gris vacía. */}
      <TouchableOpacity
        activeOpacity={0.85}
        onPress={onToggle}
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        accessibilityLabel={`${category.title}. ${expanded ? 'Tocá para contraer' : 'Tocá para desplegar'}`}
        className="flex-row items-center gap-3 px-4 py-4"
      >
        <View
          className={`h-10 w-10 items-center justify-center rounded-xl ${
            expanded ? 'bg-brand-primary/15' : 'bg-surface-high'
          }`}
        >
          <AppIcon
            family="material-community"
            name={category.icon}
            size={20}
            color={expanded ? '#53E076' : '#BCCBB9'}
          />
        </View>

        <View className="flex-1">
          <Text
            className={`font-display text-base uppercase tracking-wide ${
              expanded ? 'text-brand-primary' : 'text-neutral-on-surface'
            }`}
          >
            {category.title}
          </Text>
          <Text className="font-ui mt-0.5 text-[11px] text-neutral-outline" numberOfLines={2}>
            {category.subtitle}
          </Text>
        </View>

        <Animated.View style={chevronStyle}>
          <AppIcon
            family="material-community"
            name="chevron-down"
            size={22}
            color={expanded ? '#53E076' : '#869585'}
          />
        </Animated.View>
      </TouchableOpacity>

      <Animated.View
        style={bodyStyle}
        className="overflow-hidden"
        pointerEvents={expanded ? 'auto' : 'none'}
      >
        {/* `absolute` para que el contenido no imponga alto al contenedor: el
            alto lo manda la animación. `onLayout` sigue midiendo el natural. */}
        <View
          onLayout={handleBodyLayout}
          className="absolute left-0 right-0 top-0 border-t border-neutral-outline-variant/30 px-4 pb-4 pt-4"
          // Colapsado, el contenido sigue en el árbol: hay que sacarlo del
          // alcance del lector de pantalla o anuncia texto que no se ve.
          accessibilityElementsHidden={!expanded}
          importantForAccessibility={expanded ? 'auto' : 'no-hide-descendants'}
        >
          {category.entries.map((entry, index) => (
            <FaqEntryBlock
              key={entry.question}
              entry={entry}
              isLast={index === category.entries.length - 1}
            />
          ))}
        </View>
      </Animated.View>
    </View>
  );
}
