import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppIcon } from '@/components/ui/AppIcon';
import CustomAlert from '@/components/ui/CustomAlert';
import { HeroButton } from '@/components/ui/HeroButton';
import { supabase } from '@/lib/supabase';
import { getGenericSupabaseErrorMessage } from '@/lib/auth-error-messages';
import { useRouter } from 'expo-router';

export default function ForgotPasswordScreen() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [alertVisible, setAlertVisible] = useState(false);
  const [alertTitle, setAlertTitle] = useState('');
  const [alertMessage, setAlertMessage] = useState('');
  const [success, setSuccess] = useState(false);

  const showAlert = (title: string, message: string, isSuccess = false) => {
    setAlertTitle(title);
    setAlertMessage(message);
    setSuccess(isSuccess);
    setAlertVisible(true);
  };

  const onAlertClose = () => {
    setAlertVisible(false);
    if (success) {
      router.back();
    }
  };

  const handleResetPassword = async () => {
    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      showAlert('Error', 'Por favor, ingresa tu correo electrónico.', false);
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(trimmedEmail);

      if (error) throw error;

      showAlert(
        'Correo enviado',
        'Revisa tu bandeja de entrada o la carpeta de spam para obtener las instrucciones para restablecer tu contraseña.',
        true
      );
    } catch (error) {
      showAlert('Error al enviar', getGenericSupabaseErrorMessage(error, 'No pudimos procesar la solicitud. Inténtalo nuevamente.'), false);
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-surface-base">
      <View className="px-4 pb-2 pt-1">
        <TouchableOpacity className="w-10" activeOpacity={0.8} onPress={() => router.back()}>
          <AppIcon family="material-icons" name="arrow-back-ios-new" size={22} color="#BCCBB9" />
        </TouchableOpacity>
      </View>

      <View className="flex-1 px-6 pt-6">
        <Text className="font-displayBlack text-3xl uppercase tracking-tight text-neutral-on-surface mb-2">Recuperar Acceso</Text>
        <Text className="font-ui text-neutral-on-surface-variant mb-12">
          Ingresa el correo electrónico asociado a tu cuenta y te enviaremos las instrucciones para restablecer la contraseña.
        </Text>

        <View className="gap-2 mb-8">
          <Text className="font-display text-xs uppercase tracking-wider text-neutral-on-surface-variant">Correo Electrónico</Text>
          <View className="relative justify-center">
            <View className="absolute left-4 z-10">
              <AppIcon family="material-community" name="email-outline" size={20} color="#6F6D6C" />
            </View>
            <TextInput
              className="pl-12 pr-4 py-4 rounded-xl border border-neutral-outline-variant/15 bg-surface-low font-ui text-base text-neutral-on-surface"
              placeholder="tu@correo.com"
              placeholderTextColor="#6F6D6C"
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
              autoCorrect={false}
              value={email}
              onChangeText={setEmail}
            />
          </View>
        </View>

        <HeroButton
          onPress={handleResetPassword}
          label="Enviar Instrucciones"
          isLoading={loading}
        />
      </View>

      <CustomAlert visible={alertVisible} title={alertTitle} message={alertMessage} onClose={onAlertClose} />
    </SafeAreaView>
  );
}
