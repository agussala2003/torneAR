import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { supabase } from '../lib/supabase';
import { AuthError } from '@supabase/supabase-js';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import CustomAlert from '../components/ui/CustomAlert';
import { GlobalLoader } from '@/components/GlobalLoader';
import { getAuthErrorMessage } from '@/lib/auth-error-messages';

// 1. Definimos el Schema con Zod
const authSchema = z.object({
  email: z.string().email('Ingresa un correo electrónico válido'),
  password: z.string().min(6, 'La contraseña debe tener al menos 6 caracteres'),
});

type AuthFormData = z.infer<typeof authSchema>;

export default function LoginScreen() {
  const [loading, setLoading] = useState(false);
  const [isLogin, setIsLogin] = useState(true);

  const [alertVisible, setAlertVisible] = useState(false);
  const [alertTitle, setAlertTitle] = useState('');
  const [alertMessage, setAlertMessage] = useState('');

  // 2. Inicializamos React Hook Form
  const { control, handleSubmit, formState: { errors } } = useForm<AuthFormData>({
    resolver: zodResolver(authSchema),
    defaultValues: {
      email: '',
      password: '',
    },
  });

  const showAlert = (title: string, message: string) => {
    setAlertTitle(title);
    setAlertMessage(message);
    setAlertVisible(true);
  };

  // 3. La función onSubmit recibe directamente los datos validados
  const onSubmit = async (data: AuthFormData) => {
    if (loading) return;

    setLoading(true);
    let error: AuthError | null = null;

    try {
      if (isLogin) {
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email: data.email,
          password: data.password,
        });
        error = signInError;
      } else {
        const { error: signUpError } = await supabase.auth.signUp({
          email: data.email,
          password: data.password,
        });

        if (!signUpError) {
          showAlert('Exito', 'Cuenta creada. Revisa tu correo o inicia sesion.');
          setIsLogin(true);
        }

        error = signUpError;
      }
    } catch (unexpectedError) {
      error = {
        name: 'AuthError',
        message: String(unexpectedError),
        status: 0,
      } as AuthError;
    } finally {
      setLoading(false);
    }

    if (error) {
      showAlert('Error de autenticacion', getAuthErrorMessage(error, isLogin ? 'login' : 'signup'));
    }
    // NOTA: No necesitamos router.replace aca, porque el _layout lo va a atrapar y redirigir automáticamente al cambiar la sesión.
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      className="flex-1 bg-surface-base"
    >
      <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: 24 }}>
        <View className="mb-12 items-center">
          <Text className="mb-2 text-4xl font-black italic tracking-tighter text-brand-primary">TorneAR</Text>
          <Text className="text-base text-center text-neutral-on-surface-variant">
            {isLogin ? 'Bienvenido de vuelta a la cancha' : 'Comienza tu viaje hoy'}
          </Text>
        </View>

        <View className="space-y-4 mb-8 gap-4">
          <View>
            <Text className="mb-2 font-medium text-neutral-on-surface">Correo Electrónico</Text>
            {/* 4. Usamos Controller para el input */}
            <Controller
              control={control}
              name="email"
              render={({ field: { onChange, onBlur, value } }) => (
                <TextInput
                  className={`w-full rounded-xl border px-4 py-4 text-neutral-on-surface ${errors.email ? 'border-red-500' : 'border-neutral-outline-variant'} bg-surface-low`}
                  placeholder="jugador@tornear.com"
                  placeholderTextColor="#BCCBB9"
                  onBlur={onBlur}
                  onChangeText={onChange}
                  value={value}
                  autoCapitalize="none"
                  keyboardType="email-address"
                />
              )}
            />
            {errors.email && <Text className="text-red-500 text-xs mt-1">{errors.email.message}</Text>}
          </View>

          <View>
            <Text className="mb-2 font-medium text-neutral-on-surface">Contraseña</Text>
            <Controller
              control={control}
              name="password"
              render={({ field: { onChange, onBlur, value } }) => (
                <TextInput
                  className={`w-full rounded-xl border px-4 py-4 text-neutral-on-surface ${errors.password ? 'border-red-500' : 'border-neutral-outline-variant'} bg-surface-low`}
                  placeholder="••••••••"
                  placeholderTextColor="#BCCBB9"
                  onBlur={onBlur}
                  onChangeText={onChange}
                  value={value}
                  secureTextEntry
                />
              )}
            />
            {errors.password && <Text className="text-red-500 text-xs mt-1">{errors.password.message}</Text>}
          </View>
        </View>

        <TouchableOpacity
          onPress={handleSubmit(onSubmit)}
          disabled={loading}
          className={`mb-6 w-full rounded-xl py-4 items-center shadow-lg ${loading ? 'bg-brand-primary/50' : 'bg-brand-primary active:scale-[0.98]'}`}
          style={{ shadowColor: '#53E076', shadowOpacity: 0.2, shadowRadius: 10, shadowOffset: { width: 0, height: 4 } }}
        >
          {loading ? (
            <ActivityIndicator color="#003914" />
          ) : (
            <Text className="text-lg font-bold uppercase tracking-widest text-[#003914]">
              {isLogin ? 'Iniciar Sesión' : 'Crear Cuenta'}
            </Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity onPress={() => setIsLogin(!isLogin)} className="items-center py-4">
          <Text className="text-sm text-neutral-on-surface-variant">
            {isLogin ? "¿No tienes una cuenta? " : "¿Ya tienes una cuenta? "}
            <Text className="font-bold text-brand-primary">{isLogin ? 'Regístrate' : 'Inicia Sesión'}</Text>
          </Text>
        </TouchableOpacity>
      </ScrollView>

      <CustomAlert
        visible={alertVisible}
        title={alertTitle}
        message={alertMessage}
        onClose={() => setAlertVisible(false)}
      />

      {loading && <GlobalLoader label={isLogin ? 'Iniciando sesion' : 'Creando cuenta'} />}
    </KeyboardAvoidingView>
  );
}