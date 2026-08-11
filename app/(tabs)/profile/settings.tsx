import React from 'react';
import { View, Text, TouchableOpacity, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppIcon } from '@/components/ui/AppIcon';
import { SecondaryHeader } from '@/components/ui/SecondaryHeader';

export default function SettingsScreen() {
  const router = useRouter();

  return (
    // `edges={['bottom']}`: el inset superior ya lo aplica SecondaryHeader.
    <SafeAreaView edges={['bottom']} className="flex-1 bg-surface-base">
      <SecondaryHeader title="Preferencias" />

      {/* El `padding: 24` uniforme apretaba las filas contra el centro y
          desalineaba esta pantalla del resto, que usa px-4. */}
      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 24, paddingBottom: 60 }}>

        {/* Settings Block: Legal */}
        <View className="mb-6">
          <Text className="font-display mb-4 px-1 text-sm uppercase tracking-wider text-neutral-on-surface-variant">
            Legal
          </Text>
          <View className="overflow-hidden rounded-xl bg-surface-low">
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={() => router.push('/(modals)/terms' as any)}
              className="w-full flex-row items-center justify-between border-b border-neutral-outline-variant/35 px-5 py-4"
            >
              <View className="flex-row items-center gap-4">
                <AppIcon family="material-community" name="file-document-outline" size={18} color="#BCCBB9" />
                <Text className="font-ui text-sm text-neutral-on-surface">Términos y Condiciones</Text>
              </View>
              <AppIcon family="material-icons" name="chevron-right" size={18} color="#BCCBB9" />
            </TouchableOpacity>

            <TouchableOpacity
              activeOpacity={0.85}
              onPress={() => router.push('/(modals)/privacy' as any)}
              className="w-full flex-row items-center justify-between px-5 py-4"
            >
              <View className="flex-row items-center gap-4">
                <AppIcon family="material-community" name="shield-check-outline" size={18} color="#BCCBB9" />
                <Text className="font-ui text-sm text-neutral-on-surface">Política de Privacidad</Text>
              </View>
              <AppIcon family="material-icons" name="chevron-right" size={18} color="#BCCBB9" />
            </TouchableOpacity>
          </View>
        </View>

      </ScrollView>
    </SafeAreaView>
  );
}
