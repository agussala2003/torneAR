import { useCallback, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppIcon } from '@/components/ui/AppIcon';
import { SecondaryHeader } from '@/components/ui/SecondaryHeader';
import { FaqAccordion } from '@/components/faq/FaqAccordion';
import { FAQ_CATEGORIES } from '@/components/faq/faqContent';

/**
 * "Reglas del Juego" — la cara visible de `docs/TRANSPARENCY_GUIDE.md`.
 *
 * Contenido estático a propósito: son las reglas del sistema, no datos del
 * usuario. La pantalla abre sin red, sin loader y sin estado de error.
 *
 * Un solo acordeón abierto por vez: con siete categorías de respuestas largas,
 * permitir varias abiertas convierte la pantalla en un muro de texto donde se
 * pierde la referencia de dónde estás parado. Como efecto secundario, sólo una
 * categoría tiene su cuerpo montado a la vez.
 */
export default function FaqScreen() {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const handleToggle = useCallback((id: string) => {
    setExpandedId((current) => (current === id ? null : id));
  }, []);

  return (
    // `edges={['bottom']}`: el inset superior ya lo aplica SecondaryHeader.
    <SafeAreaView edges={['bottom']} className="flex-1 bg-surface-base">
      <SecondaryHeader
        title="Reglas del Juego"
        subtitle="Todo lo que el sistema decide solo, con los números exactos. Sin letra chica."
      />

      <ScrollView
        className="px-4"
        contentContainerStyle={{ paddingTop: 18, paddingBottom: 48 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Nota de honestidad: los números ajustables pueden cambiar sin que se
            actualice la app, y el usuario tiene que saber cuál manda. */}
        <View className="flex-row items-start gap-2.5 rounded-xl bg-surface-low px-3.5 py-3">
          <AppIcon
            family="material-community"
            name="information-outline"
            size={16}
            color="#8CCDFF"
          />
          <Text className="font-ui flex-1 text-[11px] leading-4 text-neutral-on-surface-variant">
            Algunos valores (radio del check-in, plazos, multas) los podemos ajustar sin
            actualizar la app. Si alguno no coincide, el que manda es el que ves en el partido.
          </Text>
        </View>

        <View className="mt-5">
          {FAQ_CATEGORIES.map((category) => (
            <FaqAccordion
              key={category.id}
              category={category}
              expanded={expandedId === category.id}
              onToggle={() => handleToggle(category.id)}
            />
          ))}
        </View>

        <Text className="font-ui mt-2 px-1 text-center text-[11px] leading-4 text-neutral-outline">
          ¿Encontraste algo que no coincide con lo que pasó en tu partido?{'\n'}
          Escribinos desde Perfil → Enviar comentarios.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}
