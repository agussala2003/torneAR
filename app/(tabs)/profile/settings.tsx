import React from 'react';
import { View, Text, TouchableOpacity, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppIcon } from '@/components/ui/AppIcon';

export default function SettingsScreen() {
  const router = useRouter();

  return (
    <SafeAreaView className="flex-1 bg-surface-base">
      <View className="flex-row items-center px-4 pb-2 pt-2">
        <TouchableOpacity className="w-10" activeOpacity={0.8} onPress={() => router.back()}>
          <AppIcon family="material-icons" name="arrow-back-ios-new" size={22} color="#BCCBB9" />
        </TouchableOpacity>
        <Text className="font-displayBlack text-xl text-neutral-on-surface flex-1 text-center pr-10">PREFERENCIAS</Text>
      </View>
      
      <ScrollView contentContainerStyle={{ padding: 24, paddingBottom: 60 }}>

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
