import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { AuthError } from '@supabase/supabase-js';
import { signIn, signInWithGoogle, signUp } from '@/lib/auth-data';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { GlobalLoader } from '@/components/GlobalLoader';
import { getAuthErrorMessage } from '@/lib/auth-error-messages';
import { HeroButton } from '@/components/ui/HeroButton';
import { GoogleAuthButton } from '@/components/ui/GoogleAuthButton';
import { router } from 'expo-router';
import { useCustomAlert } from '@/hooks/useCustomAlert';
import {
  signInSchema,
  signUpSchema,
  PASSWORD_MIN_LENGTH,
  type AuthFormData,
} from '@/lib/schemas/authSchema';

export default function LoginScreen() {
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [isLogin, setIsLogin] = useState(true);

  const { showAlert, AlertComponent } = useCustomAlert();

  // El schema depende del modo: login no revalida el largo (cuentas viejas con
  // 6 caracteres deben poder entrar), registro exige PASSWORD_MIN_LENGTH.
  // RHF reasigna control._options en cada render, asi que cambiar el resolver
  // al alternar de modo toma efecto en la validacion siguiente.
  const { control, handleSubmit, clearErrors, formState: { errors } } = useForm<AuthFormData>({
    resolver: zodResolver(isLogin ? signInSchema : signUpSchema),
    defaultValues: {
      email: '',
      password: '',
    },
  });

  // Al alternar limpiamos los errores del schema anterior: si no, el mensaje
  // "debe tener al menos 8 caracteres" queda colgado despues de volver a login.
  const toggleMode = () => {
    clearErrors();
    setIsLogin((prev) => !prev);
  };

  // 3. La función onSubmit recibe directamente los datos validados
  const onSubmit = async (data: AuthFormData) => {
    if (loading) return;

    setLoading(true);
    let error: AuthError | null = null;

    try {
      if (isLogin) {
        const { error: signInError } = await signIn(data.email, data.password);
        error = signInError;
      } else {
        const { error: signUpError } = await signUp(data.email, data.password);

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
    // NOTA: No hacemos router.replace aca. El guard de app/_layout.tsx atrapa el
    // cambio de sesion y decide el destino de forma centralizada: si hay un
    // pendingDeepLink guardado (deep link que llego mientras estabamos deslogueados)
    // lo consume y navega ahi; si no, cae en /(tabs) — respetando siempre el gate
    // de onboarding. Redirigir aca competiria con ese guard y podria saltear onboarding.
  };

  // Google no distingue entre "entrar" y "registrarse": el proveedor crea la
  // cuenta en el primer consentimiento. Por eso el boton es el mismo en los dos
  // modos, y el gate de onboarding (app/_layout.tsx) es el que pide los datos
  // del perfil que Google no aporta (zona, posicion, pie habil, nacimiento).
  const onGooglePress = async () => {
    if (loading || googleLoading) return;

    setGoogleLoading(true);
    try {
      const { error, cancelled } = await signInWithGoogle();

      // Cerrar la ventana de Google es una decision del usuario, no un fallo:
      // volvemos al formulario sin alerta.
      if (!cancelled && error) {
        showAlert('Error de autenticacion', getAuthErrorMessage(error, 'login'));
      }
    } catch (unexpectedError) {
      showAlert('Error de autenticacion', getAuthErrorMessage(unexpectedError, 'login'));
    } finally {
      setGoogleLoading(false);
    }
    // Igual que arriba: no navegamos, el guard de _layout atrapa la sesion nueva.
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      className="flex-1 bg-surface-base"
    >
      <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: 24 }}>
        <View className="mb-12 items-center">
          <Text className="font-displayBlack mb-2 text-4xl italic tracking-tighter text-brand-primary">TorneAR</Text>
          <Text className="font-ui text-base text-center text-neutral-on-surface-variant">
            {isLogin ? 'Bienvenido de vuelta a la cancha' : 'Comienza tu viaje hoy'}
          </Text>
        </View>

        <View className="space-y-4 mb-8 gap-4">
          <View>
            <Text className="font-uiBold mb-2 text-neutral-on-surface">Correo Electronico</Text>
            {/* 4. Usamos Controller para el input */}
            <Controller
              control={control}
              name="email"
              render={({ field: { onChange, onBlur, value } }) => (
                <TextInput
                  className={`w-full rounded-xl border px-4 py-4 text-neutral-on-surface ${errors.email ? 'border-red-500' : 'border-neutral-outline-variant/15'} bg-surface-low`}
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
            <Text className="font-uiBold mb-2 text-neutral-on-surface">Contraseña</Text>
            <Controller
              control={control}
              name="password"
              render={({ field: { onChange, onBlur, value } }) => (
                <TextInput
                  className={`w-full rounded-xl border px-4 py-4 text-neutral-on-surface ${errors.password ? 'border-red-500' : 'border-neutral-outline-variant/15'} bg-surface-low`}
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

            {/* Hint proactivo solo en registro: el usuario conoce la regla ANTES
                de que el server rechace la contrasena. */}
            {!isLogin && !errors.password && (
              <Text className="font-ui mt-1 text-xs text-neutral-outline">
                Mínimo {PASSWORD_MIN_LENGTH} caracteres.
              </Text>
            )}

            {isLogin && (
              <TouchableOpacity onPress={() => router.push('/forgot-password')} className="mt-2 items-end">
                <Text className="font-uiBold text-xs text-brand-primary">¿Olvidaste tu contraseña?</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        {!isLogin && (
          <View className="mb-6 flex-row flex-wrap items-center justify-center px-4">
            <Text className="font-ui text-xs text-neutral-on-surface-variant text-center">
              Al crear la cuenta aceptas los{' '}
            </Text>
            <TouchableOpacity onPress={() => router.push('/(modals)/terms')}>
              <Text className="font-uiBold text-xs text-brand-primary">Términos</Text>
            </TouchableOpacity>
            <Text className="font-ui text-xs text-neutral-on-surface-variant"> y la{' '}</Text>
            <TouchableOpacity onPress={() => router.push('/(modals)/privacy')}>
              <Text className="font-uiBold text-xs text-brand-primary">Privacidad</Text>
            </TouchableOpacity>
            <Text className="font-ui text-xs text-neutral-on-surface-variant">.</Text>
          </View>
        )}

        <HeroButton
          onPress={handleSubmit(onSubmit)}
          isLoading={loading}
          disabled={googleLoading}
          label={isLogin ? 'Iniciar Sesión' : 'Crear Cuenta'}
          style={{ marginBottom: 24, width: '100%', shadowColor: '#53E076', shadowOpacity: 0.2, shadowRadius: 10, shadowOffset: { width: 0, height: 4 } }}
        />

        <View className="mb-6 flex-row items-center gap-4">
          <View className="h-px flex-1 bg-neutral-outline/30" />
          <Text className="font-ui text-xs uppercase tracking-widest text-neutral-outline">o</Text>
          <View className="h-px flex-1 bg-neutral-outline/30" />
        </View>

        <GoogleAuthButton
          onPress={onGooglePress}
          isLoading={googleLoading}
          disabled={loading}
          label={isLogin ? 'Continuar con Google' : 'Registrarme con Google'}
        />

        <TouchableOpacity onPress={toggleMode} className="items-center py-4">
          <Text className="font-ui text-sm text-neutral-on-surface-variant">
            {isLogin ? "¿No tienes una cuenta? " : "¿Ya tienes una cuenta? "}
            <Text className="font-uiBold text-brand-primary">{isLogin ? 'Regístrate' : 'Inicia Sesión'}</Text>
          </Text>
        </TouchableOpacity>
      </ScrollView>

      {AlertComponent}

      {loading && <GlobalLoader label={isLogin ? 'Iniciando sesion' : 'Creando cuenta'} />}
    </KeyboardAvoidingView>
  );
}