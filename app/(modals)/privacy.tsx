import React from 'react';
import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { AppIcon } from '@/components/ui/AppIcon';

export default function PrivacyScreen() {
  const router = useRouter();
  return (
    <SafeAreaView className="flex-1 bg-surface-base">
      <View className="flex-row items-center px-4 pb-2 pt-2">
        <TouchableOpacity className="w-10" activeOpacity={0.8} onPress={() => router.back()}>
          <AppIcon family="material-icons" name="arrow-back-ios-new" size={22} color="#BCCBB9" />
        </TouchableOpacity>
        <Text className="font-displayBlack text-xl text-neutral-on-surface flex-1 text-center pr-10">POLÍTICA DE PRIVACIDAD</Text>
      </View>
      
      <ScrollView contentContainerStyle={{ padding: 24, paddingBottom: 60 }}>
        <Text className="font-displayBlack text-2xl text-neutral-on-surface mb-6">
          Política de Privacidad
        </Text>
        
        <Text className="font-ui text-sm text-neutral-on-surface-variant mb-6 leading-6">
          En torneAR valoramos y respetamos la privacidad de nuestros usuarios. Esta política describe cómo recopilamos, utilizamos y protegemos tu información.
        </Text>

        <View className="mb-6">
          <Text className="font-display text-lg uppercase tracking-wider text-brand-primary mb-2">
            1. RECOPILACIÓN DE DATOS
          </Text>
          <Text className="font-ui text-sm text-neutral-on-surface-variant leading-6">
            Recopilamos información personal (como nombre y correo electrónico) para crear tu perfil de jugador. Además, recopilamos estadísticas de tu rendimiento en la plataforma para generar rankings asimétricos e influyentes en tu ELO.
          </Text>
        </View>

        <View className="mb-6">
          <Text className="font-display text-lg uppercase tracking-wider text-brand-primary mb-2">
            2. USO DE GEOLOCALIZACIÓN (CHECK-IN)
          </Text>
          <Text className="font-ui text-sm text-neutral-on-surface-variant leading-6">
            Al utilizar la función de Check-In en los partidos, procesamos tu ubicación en tiempo real únicamente para validar tu presencia física en las coordenadas designadas de la cancha. Esta ubicación se recopila temporalmente y no se almacena permanentemente ni se rastrea tu ubicación de fondo.
          </Text>
        </View>

        <View className="mb-6">
          <Text className="font-display text-lg uppercase tracking-wider text-brand-primary mb-2">
            3. PROTECCIÓN Y COMPARTICIÓN
          </Text>
          <Text className="font-ui text-sm text-neutral-on-surface-variant leading-6">
            No vendemos tus datos personales a terceros. Parte de tu información como estadísticas, nombre de usuario y zona, será visible en los perfiles públicos dentro de la aplicación para fomentar el ecosistema de mercado y contratación de la red torneAR.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
