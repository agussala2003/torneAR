import React from 'react';
import { View, Text, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { SecondaryHeader } from '@/components/ui/SecondaryHeader';
import {
  PRIVACY_INTRO,
  PRIVACY_LAST_UPDATED,
  PRIVACY_SECTIONS,
} from '@/components/legal/privacyContent';

/**
 * Pantalla de Política de Privacidad.
 *
 * Sólo presenta: el texto vive en `components/legal/privacyContent.ts`, igual
 * que Términos, así que actualizarlo es editar datos y no JSX.
 */
export default function PrivacyScreen() {
  return (
    // `edges={['bottom']}`: el inset superior ya lo aplica SecondaryHeader.
    <SafeAreaView edges={['bottom']} className="flex-1 bg-surface-base">
      <SecondaryHeader title="Política de Privacidad" />

      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 24, paddingBottom: 60 }}>
        <Text className="font-displayBlack mb-1 text-2xl text-neutral-on-surface">
          Política de Privacidad
        </Text>

        <Text className="font-ui mb-5 text-xs uppercase tracking-wider text-neutral-outline">
          Última actualización: {PRIVACY_LAST_UPDATED}
        </Text>

        <Text className="font-ui mb-8 text-sm leading-6 text-neutral-on-surface-variant">
          {PRIVACY_INTRO}
        </Text>

        {PRIVACY_SECTIONS.map((section, index) => (
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
