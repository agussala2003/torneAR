import { useState } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useAuth } from '../../context/AuthContext';
import CustomAlert from '../../components/ui/CustomAlert';
import { GlobalLoader } from '@/components/GlobalLoader';
import { getAuthErrorMessage } from '@/lib/auth-error-messages';

export default function ProfileScreen() {
  const { signOut, user } = useAuth();
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [alertVisible, setAlertVisible] = useState(false);
  const [alertTitle, setAlertTitle] = useState('');
  const [alertMessage, setAlertMessage] = useState('');

  const showAlert = (title: string, message: string) => {
    setAlertTitle(title);
    setAlertMessage(message);
    setAlertVisible(true);
  };

  const handleSignOut = async () => {
    try {
      setIsSigningOut(true);
      await signOut();
    } catch (error) {
      showAlert('Error al cerrar sesion', getAuthErrorMessage(error, 'login'));
    } finally {
      setIsSigningOut(false);
    }
  };

  return (
    <View className="flex-1 items-center justify-center bg-surface-base px-6">
      <Text className="text-2xl font-black text-neutral-on-surface">Perfil</Text>
      <Text className="mt-2 text-neutral-on-surface-variant">Pantalla en construcción con nueva paleta TorneAR.</Text>

      {!!user?.email && (
        <Text className="mt-6 text-xs uppercase tracking-wider text-neutral-on-surface-variant">{user.email}</Text>
      )}

      <TouchableOpacity
        activeOpacity={0.9}
        className={`mt-6 w-full max-w-xs items-center rounded-xl py-3 ${isSigningOut ? 'bg-danger-error-container/50' : 'bg-danger-error-container'}`}
        disabled={isSigningOut}
        onPress={handleSignOut}
      >
        {isSigningOut ? (
          <ActivityIndicator color="#FFDAD6" />
        ) : (
          <Text className="font-bold uppercase tracking-widest text-danger-on-error-container">Cerrar sesion</Text>
        )}
      </TouchableOpacity>

      <CustomAlert
        visible={alertVisible}
        title={alertTitle}
        message={alertMessage}
        onClose={() => setAlertVisible(false)}
      />

      {isSigningOut && <GlobalLoader label="Cerrando sesion" />}
    </View>
  );
}
