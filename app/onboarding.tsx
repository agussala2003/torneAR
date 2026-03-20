import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator, ScrollView, Modal, FlatList, TouchableWithoutFeedback } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '../lib/supabase';
import { useRouter } from 'expo-router';
import { useAuth } from '../context/AuthContext';
import { Feather } from '@expo/vector-icons';
import CustomAlert from '../components/ui/CustomAlert';

export default function OnboardingScreen() {
  const { user, refreshProfile } = useAuth();
  const router = useRouter();
  
  // App logic state
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);

  // Profile data
  const [fullName, setFullName] = useState('');
  const [username, setUsername] = useState('');
  const [zone, setZone] = useState('');
  const [position, setPosition] = useState<'CUALQUIERA' | 'ARQUERO' | 'DEFENSOR' | 'MEDIOCAMPISTA' | 'DELANTERO'>('CUALQUIERA');

  // Dynamic Zones state
  const [zones, setZones] = useState<string[]>([]);
  const [showZonePicker, setShowZonePicker] = useState(false);
  const [loadingZones, setLoadingZones] = useState(true);

  // Custom Alert state
  const [alertVisible, setAlertVisible] = useState(false);
  const [alertTitle, setAlertTitle] = useState('');
  const [alertMessage, setAlertMessage] = useState('');

  useEffect(() => {
    fetchZones();
  }, []);

  async function fetchZones() {
    setLoadingZones(true);
    const { data, error } = await supabase
      .from('zones')
      .select('name')
      .eq('is_active', true);
    
    if (!error && data) {
      setZones(data.map(z => z.name));
    } else {
      console.warn('Could not fetch zones', error);
      setZones(['Buenos Aires Centro', 'GBA Norte', 'GBA Sur', 'GBA Oeste']);
    }
    setLoadingZones(false);
  }

  const showAlert = (title: string, message: string) => {
    setAlertTitle(title);
    setAlertMessage(message);
    setAlertVisible(true);
  };

  const POSITIONS = [
    { id: 'DELANTERO', label: 'Delantero', icon: 'crosshair' },
    { id: 'MEDIOCAMPISTA', label: 'Mediocampista', icon: 'git-commit' },
    { id: 'DEFENSOR', label: 'Defensor', icon: 'shield' },
    { id: 'ARQUERO', label: 'Arquero', icon: 'stop-circle' },
  ] as const;

  function handleNext() {
    if (!fullName.trim() || !username.trim() || !zone) {
      showAlert('Faltan Datos', 'Por favor, completa tu nombre, nombre de usuario y selecciona una zona para continuar.');
      return;
    }
    setStep(2);
  }

  async function handleCompleteProfile() {
    if (!user) return;

    setLoading(true);
    
    const { error } = await supabase
      .from('profiles')
      .upsert({
        auth_user_id: user.id,
        full_name: fullName,
        username: username,
        zone: zone,
        preferred_position: position,
        updated_at: new Date().toISOString()
      });

    if (error) {
      setLoading(false);
      showAlert('Error', error.message);
    } else {
      await refreshProfile();
      setLoading(false);
      router.replace('/(tabs)');
    }
  }

  return (
    <SafeAreaView className="flex-1 bg-[#131313]">
      {/* Top Header Navigation (appears only in Step 2) */}
      {step === 2 && (
        <View className="px-6 pt-4 pb-2">
          <TouchableOpacity 
            className="flex-row items-center gap-1 active:opacity-70"
            onPress={() => setStep(1)}
          >
            <Feather name="chevron-left" size={24} color="#bccbb9" />
            <Text className="text-[#bccbb9] font-bold text-sm">Atrás</Text>
          </TouchableOpacity>
        </View>
      )}

      <ScrollView contentContainerStyle={{ padding: 24, paddingBottom: 60, paddingTop: step === 1 ? 24 : 8 }}>
        
        {/* Progress Header */}
        <View className="mb-8">
          <View className="flex-row justify-between items-end mb-3">
            <Text className="text-[#53e076] font-bold text-xl uppercase tracking-widest">
              Paso {step} de 2
            </Text>
            <Text className="text-[#bccbb9] font-medium text-sm">
              {step === 1 ? 'Datos Base' : 'Finalizando Perfil'}
            </Text>
          </View>
          <View className="h-1.5 w-full bg-[#2a2a2a] rounded-full overflow-hidden flex-row">
            <View className={`h-full bg-[#53e076] ${step === 1 ? 'w-1/2' : 'w-full'}`} style={{ shadowColor: '#53e076', shadowOpacity: 0.4, shadowRadius: 12 }} />
          </View>
        </View>

        {/* Dynamic Step Content */}
        {step === 1 ? (
          <View>
            <View className="mb-6">
              <Text className="text-3xl font-bold text-[#e5e2e1] mb-2">Datos Personales</Text>
              <Text className="text-[#bccbb9]">Cuéntanos cómo te llamas y por dónde prefieres jugar.</Text>
            </View>

            <View className="space-y-4 mb-8 gap-4">
              <View>
                <Text className="text-[#bccbb9] text-xs uppercase tracking-wider mb-2 font-bold">Nombre Completo</Text>
                <TextInput
                  className="w-full bg-[#1c1b1b] border border-[#3d4a3d] rounded-xl px-4 py-4 text-[#e5e2e1]"
                  placeholder="Ej: Lionel Messi"
                  placeholderTextColor="#3a3939"
                  value={fullName}
                  onChangeText={setFullName}
                />
              </View>

              <View>
                <Text className="text-[#bccbb9] text-xs uppercase tracking-wider mb-2 font-bold">Nombre de Usuario</Text>
                <TextInput
                  className="w-full bg-[#1c1b1b] border border-[#3d4a3d] rounded-xl px-4 py-4 text-[#e5e2e1]"
                  placeholder="Ej: @leomessi"
                  placeholderTextColor="#3a3939"
                  autoCapitalize="none"
                  value={username}
                  onChangeText={setUsername}
                />
              </View>

              <View>
                <Text className="text-[#bccbb9] text-xs uppercase tracking-wider mb-2 font-bold">Zona de Juego Principal</Text>
                <TouchableOpacity 
                  onPress={() => setShowZonePicker(true)}
                  activeOpacity={0.8}
                  className="w-full bg-[#1c1b1b] border border-[#3d4a3d] rounded-xl px-4 py-4 flex-row justify-between items-center"
                >
                  <Text className={zone ? "text-[#e5e2e1]" : "text-[#3a3939]"}>
                    {zone || "Selecciona una zona"}
                  </Text>
                  {loadingZones ? (
                    <ActivityIndicator size="small" color="#53e076" />
                  ) : (
                    <Feather name="chevron-down" size={20} color="#bccbb9" />
                  )}
                </TouchableOpacity>
              </View>
            </View>

            <TouchableOpacity 
              onPress={handleNext} 
              activeOpacity={0.9}
              className="w-full py-4 rounded-xl items-center bg-[#53e076]"
              style={{ shadowColor: '#53e076', shadowOpacity: 0.2, shadowRadius: 30, shadowOffset: { width: 0, height: 8 } }}
            >
              <Text className="text-[#003914] font-bold text-xl uppercase tracking-widest">
                Siguiente
              </Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View>
            <View className="mb-6">
              <Text className="text-3xl font-bold text-[#e5e2e1] mb-2">Perfil Técnico</Text>
              <Text className="text-[#bccbb9]">Define tu impacto en la cancha. ¿Dónde te destacas?</Text>
            </View>

            <Text className="text-[#bccbb9] text-xs uppercase tracking-wider mb-3 font-bold">Posición Preferida</Text>
            <View className="flex-row flex-wrap justify-between gap-y-3 mb-6">
              {POSITIONS.map((pos) => {
                const isSelected = position === pos.id;
                return (
                  <TouchableOpacity
                    key={pos.id}
                    onPress={() => setPosition(pos.id)}
                    activeOpacity={0.9}
                    className={`w-[48%] relative flex flex-col items-center justify-center py-6 rounded-lg border
                      ${isSelected ? 'bg-[#1db954] border-[#1db954]' : 'bg-[#201f1f] border-[#3d4a3d]'}`}
                    style={isSelected ? { shadowColor: '#1db954', shadowOpacity: 0.2, shadowRadius: 20 } : {}}
                  >
                    <Feather 
                      name={isSelected ? 'check-circle' : pos.icon as any} 
                      size={32} 
                      color={isSelected ? '#002d44' : '#53e076'} 
                      style={{ marginBottom: 12 }}
                    />
                    <Text className={`font-bold text-lg uppercase tracking-tight ${isSelected ? 'text-[#002d44]' : 'text-[#e5e2e1]'}`}>
                      {pos.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <View className="flex-row items-center justify-between mb-10 mt-2">
              <Text className="text-sm font-medium text-[#bccbb9] uppercase tracking-wider">Alternativa</Text>
              <TouchableOpacity 
                activeOpacity={0.9}
                onPress={() => setPosition('CUALQUIERA')}
                className={`px-6 py-2 rounded-full border ${position === 'CUALQUIERA' ? 'bg-[#53e076] border-[#53e076]' : 'bg-[#2a2a2a] border-[#3d4a3d]'}`}
              >
                <Text className={`text-sm font-bold ${position === 'CUALQUIERA' ? 'text-[#003914]' : 'text-[#e5e2e1]'}`}>CUALQUIERA</Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity 
              onPress={handleCompleteProfile} 
              disabled={loading}
              activeOpacity={0.9}
              className={`w-full py-4 rounded-xl items-center ${loading ? 'bg-[#53e076]/50' : 'bg-[#53e076]'}`}
              style={{ shadowColor: '#53e076', shadowOpacity: 0.2, shadowRadius: 30, shadowOffset: { width: 0, height: 8 } }}
            >
              {loading ? (
                <ActivityIndicator color="#003914" />
              ) : (
                <Text className="text-[#003914] font-bold text-xl uppercase tracking-widest">
                  Comenzar
                </Text>
              )}
            </TouchableOpacity>
            
            <Text className="text-center text-[10px] text-[#bccbb9] mt-6 uppercase tracking-[0.2em]">
              Al continuar aceptas los Términos de Servicio del Atleta
            </Text>
          </View>
        )}
      </ScrollView>

      {/* Zone Picker Modal */}
      <Modal visible={showZonePicker} transparent animationType="fade" onRequestClose={() => setShowZonePicker(false)}>
        <TouchableWithoutFeedback onPress={() => setShowZonePicker(false)}>
          <View className="flex-1 justify-end bg-black/80">
            <TouchableWithoutFeedback>
              <View className="bg-zinc-900 border-t border-[#3d4a3d] rounded-t-3xl overflow-hidden max-h-[50%]">
                <View className="p-4 border-b border-[#3d4a3d] flex-row justify-between items-center">
                  <Text className="text-lg font-bold text-[#e5e2e1]">Selecciona tu Zona</Text>
                  <TouchableOpacity onPress={() => setShowZonePicker(false)}>
                    <Feather name="x" size={24} color="#bccbb9" />
                  </TouchableOpacity>
                </View>
                <FlatList
                  data={zones}
                  keyExtractor={(item, index) => `${item}-${index}`}
                  contentContainerStyle={{ padding: 16 }}
                  renderItem={({ item }) => (
                    <TouchableOpacity 
                      activeOpacity={0.7}
                      className="py-4 border-b border-[#2a2a2a] flex-row items-center justify-between"
                      onPress={() => {
                        setZone(item);
                        setShowZonePicker(false);
                      }}
                    >
                      <Text className="text-base text-[#e5e2e1]">{item}</Text>
                      {zone === item && <Feather name="check" size={20} color="#53e076" />}
                    </TouchableOpacity>
                  )}
                  ListEmptyComponent={
                    <Text className="text-[#bccbb9] text-center mt-4">No se encontraron zonas disponibles.</Text>
                  }
                />
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      <CustomAlert 
        visible={alertVisible} 
        title={alertTitle} 
        message={alertMessage} 
        onClose={() => setAlertVisible(false)} 
      />
    </SafeAreaView>
  );
}
