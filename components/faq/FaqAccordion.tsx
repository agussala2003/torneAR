import { useEffect } from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import Animated, {
  FadeIn,
  useAnimatedStyle,
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
 * El cuerpo se monta y desmonta (no se oculta con altura 0): con cinco
 * categorías de ~7 respuestas cada una, mantenerlas todas montadas era pagar el
 * render completo de la pantalla para mostrar un título. La entrada se suaviza
 * con un fade y el chevron gira, que es suficiente para que el despliegue no se
 * sienta un salto.
 */
export function FaqAccordion({ category, expanded, onToggle }: Props) {
  const rotation = useSharedValue(expanded ? 1 : 0);

  useEffect(() => {
    rotation.value = withTiming(expanded ? 1 : 0, { duration: 180 });
  }, [expanded, rotation]);

  const chevronStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotation.value * 180}deg` }],
  }));

  return (
    <View
      className={`mb-3 overflow-hidden rounded-2xl bg-surface-container ${
        expanded ? 'border border-brand-primary/25' : ''
      }`}
    >
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

      {expanded && (
        <Animated.View
          entering={FadeIn.duration(160)}
          className="border-t border-neutral-outline-variant/30 px-4 pb-4 pt-4"
        >
          {category.entries.map((entry, index) => (
            <FaqEntryBlock
              key={entry.question}
              entry={entry}
              isLast={index === category.entries.length - 1}
            />
          ))}
        </Animated.View>
      )}
    </View>
  );
}
