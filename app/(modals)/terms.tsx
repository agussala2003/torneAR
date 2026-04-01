import React from 'react';
import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { AppIcon } from '@/components/ui/AppIcon';

export default function TermsScreen() {
  const router = useRouter();
  return (
    <SafeAreaView className="flex-1 bg-surface-base">
      <View className="flex-row items-center px-4 pb-2 pt-2">
        <TouchableOpacity className="w-10" activeOpacity={0.8} onPress={() => router.back()}>
          <AppIcon family="material-icons" name="arrow-back-ios-new" size={22} color="#BCCBB9" />
        </TouchableOpacity>
        <Text className="font-displayBlack text-xl text-neutral-on-surface flex-1 text-center pr-10">TÉRMINOS Y CONDICIONES</Text>
      </View>
      
      <ScrollView contentContainerStyle={{ padding: 24, paddingBottom: 60 }}>
        <Text className="font-displayBlack text-2xl text-neutral-on-surface mb-6">
          Términos y Condiciones de Uso
        </Text>
        
        <Text className="font-ui text-sm text-neutral-on-surface-variant mb-6 leading-6">
          Última actualización: 30 de Marzo, 2026.
          Al utilizar torneAR, aceptas someterte a estos Términos y Condiciones. Lee detenidamente esta información antes de utilizar la plataforma.
        </Text>

        <View className="mb-6">
          <Text className="font-display text-lg uppercase tracking-wider text-brand-primary mb-2">
            1. FAIR PLAY Y COMPORTAMIENTO
          </Text>
          <Text className="font-ui text-sm text-neutral-on-surface-variant leading-6">
            torneAR fomenta la competencia sana y el respeto. El Fair Play es estrictamente requerido. Cualquier comportamiento antideportivo, lenguaje abusivo, discriminación o violencia física/verbal dentro o fuera de la cancha podrá resultar en la suspensión temporal o permanente de la cuenta, y/o la eliminación de los equipos implicados.
          </Text>
        </View>

        <View className="mb-6">
          <Text className="font-display text-lg uppercase tracking-wider text-brand-primary mb-2">
            2. RESPONSABILIDAD DE LESIONES FÍSICAS
          </Text>
          <Text className="font-ui text-sm text-neutral-on-surface-variant leading-6">
            El fútbol es un deporte de contacto con riesgo inherente de lesiones. Al utilizar torneAR para organizar y participar en partidos, reconoces y aceptas voluntariamente estos riesgos. TorneAR no se hace responsable de lesiones, accidentes físicos o gastos médicos derivados de los partidos coordinados mediante nuestra plataforma. Cada usuario comprende que juega bajo su propio riesgo y responsabilidad.
          </Text>
        </View>

        <View className="mb-6">
          <Text className="font-display text-lg uppercase tracking-wider text-brand-primary mb-2">
            3. DISPUTAS Y RESULTADOS
          </Text>
          <Text className="font-ui text-sm text-neutral-on-surface-variant leading-6">
            Los resultados de los partidos deben ser reportados con honestidad. Las disputas por resultados falsos serán auditadas por los administradores y pueden derivar en pérdida de puntos u otras sanciones para el equipo infractor.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
