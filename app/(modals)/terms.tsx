import React from 'react';
import { View, Text, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { SecondaryHeader } from '@/components/ui/SecondaryHeader';
import {
  TERMS_INTRO,
  TERMS_LAST_UPDATED,
  TERMS_SECTIONS,
} from '@/components/legal/termsContent';

/**
 * Pantalla de Términos y Condiciones.
 *
 * Sólo presenta: el texto vive en `components/legal/termsContent.ts`, así que
 * la actualización de la Beta se hace ahí y este archivo no cambia.
 */
export default function TermsScreen() {
  return (
    // `edges={['bottom']}`: el inset superior ya lo aplica SecondaryHeader.
    <SafeAreaView edges={['bottom']} className="flex-1 bg-surface-base">
      <SecondaryHeader title="Términos y Condiciones" />

      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 24, paddingBottom: 60 }}>
        <Text className="font-displayBlack mb-1 text-2xl text-neutral-on-surface">
          Términos y Condiciones de Uso
        </Text>

        <Text className="font-ui mb-5 text-xs uppercase tracking-wider text-neutral-outline">
          Última actualización: {TERMS_LAST_UPDATED}
        </Text>

        <Text className="font-ui mb-8 text-sm leading-6 text-neutral-on-surface-variant">
          {TERMS_INTRO}
        </Text>

        {TERMS_SECTIONS.map((section, index) => (
          <View key={section.title} className="mb-6">
            <Text className="font-display mb-2 text-lg uppercase tracking-wider text-brand-primary">
              {index + 1}. {section.title}
            </Text>
            {section.paragraphs.map((paragraph) => (
              <Text
                key={paragraph.slice(0, 40)}
                className="font-ui mb-2 text-sm leading-6 text-neutral-on-surface-variant"
              >
                {paragraph}
              </Text>
            ))}
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}
