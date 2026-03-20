import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { supabase } from '../lib/supabase';
import { useRouter } from 'expo-router';
import CustomAlert from '../components/ui/CustomAlert';

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [isLogin, setIsLogin] = useState(true);
  
  // Custom Alert state
  const [alertVisible, setAlertVisible] = useState(false);
  const [alertTitle, setAlertTitle] = useState('');
  const [alertMessage, setAlertMessage] = useState('');

  const router = useRouter();

  const showAlert = (title: string, message: string) => {
    setAlertTitle(title);
    setAlertMessage(message);
    setAlertVisible(true);
  };

  async function handleAuth() {
    if (!email || !password) {
      showAlert('Error', 'Por favor, ingresa tanto el correo electrónico como la contraseña.');
      return;
    }

    setLoading(true);
    let error;

    if (isLogin) {
      const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
      error = signInError;
    } else {
      const { error: signUpError } = await supabase.auth.signUp({ email, password });
      if (!signUpError) {
        showAlert('Éxito', '¡Cuenta creada! Por favor verifica tu correo (si es requerido) o simplemente inicia sesión.');
        setIsLogin(true);
      }
      error = signUpError;
    }

    setLoading(false);
    
    if (error) {
      showAlert('Error de Autenticación', error.message);
    } else if (isLogin) {
      router.replace('/(tabs)');
    }
  }

  return (
    <KeyboardAvoidingView 
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      className="flex-1 bg-[#131313]"
    >
      <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: 24 }}>
        <View className="mb-12 items-center">
          <Text className="text-[#53e076] text-4xl font-black italic tracking-tighter mb-2">TorneAR</Text>
          <Text className="text-[#bccbb9] text-base text-center">
            {isLogin ? 'Bienvenido de vuelta a la cancha' : 'Comienza tu viaje hoy'}
          </Text>
        </View>

        <View className="space-y-4 mb-8 gap-4">
          <View>
            <Text className="text-[#e5e2e1] mb-2 font-medium">Correo Electrónico</Text>
            <TextInput
              className="w-full bg-[#1c1b1b] border border-[#3d4a3d] rounded-xl px-4 py-4 text-[#e5e2e1]"
              placeholder="jugador@tornear.com"
              placeholderTextColor="#bccbb9"
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
            />
          </View>

          <View>
            <Text className="text-[#e5e2e1] mb-2 font-medium">Contraseña</Text>
            <TextInput
              className="w-full bg-[#1c1b1b] border border-[#3d4a3d] rounded-xl px-4 py-4 text-[#e5e2e1]"
              placeholder="••••••••"
              placeholderTextColor="#bccbb9"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
            />
          </View>
        </View>

        <TouchableOpacity 
          onPress={handleAuth} 
          disabled={loading}
          className={`w-full py-4 rounded-xl items-center shadow-lg ${loading ? 'bg-[#53e076]/50' : 'bg-[#53e076] active:scale-[0.98]'} mb-6`}
          style={{ shadowColor: '#53e076', shadowOpacity: 0.2, shadowRadius: 10, shadowOffset: { width: 0, height: 4 } }}
        >
          {loading ? (
            <ActivityIndicator color="#003914" />
          ) : (
            <Text className="text-[#003914] font-bold text-lg uppercase tracking-widest">
              {isLogin ? 'Iniciar Sesión' : 'Crear Cuenta'}
            </Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity onPress={() => setIsLogin(!isLogin)} className="items-center py-4">
          <Text className="text-[#bccbb9] text-sm">
            {isLogin ? "¿No tienes una cuenta? " : "¿Ya tienes una cuenta? "}
            <Text className="text-[#53e076] font-bold">{isLogin ? 'Regístrate' : 'Inicia Sesión'}</Text>
          </Text>
        </TouchableOpacity>
      </ScrollView>
      
      <CustomAlert 
        visible={alertVisible} 
        title={alertTitle} 
        message={alertMessage} 
        onClose={() => setAlertVisible(false)} 
      />
    </KeyboardAvoidingView>
  );
}
