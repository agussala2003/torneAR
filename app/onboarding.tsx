import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator, ScrollView, Modal, FlatList, TouchableWithoutFeedback } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { Feather } from '@expo/vector-icons';
import CustomAlert from '../components/ui/CustomAlert';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { getGenericSupabaseErrorMessage } from '@/lib/auth-error-messages';

// Zod Schema
const onboardingSchema = z.object({
  fullName: z.string().min(3, 'El nombre debe tener al menos 3 caracteres'),
  username: z.string()
    .min(3, 'El usuario debe tener al menos 3 caracteres')
    .regex(/^[a-z0-9_]+$/, 'Solo minúsculas, números y guiones bajos (_) sin espacios'),
  zone: z.string().min(1, 'Debes seleccionar una zona'),
  position: z.enum(['CUALQUIERA', 'ARQUERO', 'DEFENSOR', 'MEDIOCAMPISTA', 'DELANTERO']),
});

type OnboardingFormData = z.infer<typeof onboardingSchema>;

// === COMPONENTE: Selector de Cancha Nativo ===
const PitchSelector = ({
  value,
  onChange
}: {
  value: string;
  onChange: (val: 'ARQUERO' | 'DEFENSOR' | 'MEDIOCAMPISTA' | 'DELANTERO') => void;
}) => {
  const positions: { id: 'DELANTERO' | 'MEDIOCAMPISTA' | 'DEFENSOR' | 'ARQUERO', label: string }[] = [
    { id: 'DELANTERO', label: 'DELANTERO' },
    { id: 'MEDIOCAMPISTA', label: 'MEDIOCAMPISTA' },
    { id: 'DEFENSOR', label: 'DEFENSOR' },
    { id: 'ARQUERO', label: 'ARQUERO' },
  ];

  return (
    <View className="w-full aspect-[2/3.2] max-w-[340px] mx-auto bg-surface-lowest border-2 border-neutral-outline-variant rounded-2xl relative overflow-hidden flex-col mb-6 shadow-xl">
      {/* Líneas de la cancha (Fondo) */}
      <View className="absolute inset-0 z-0 pointer-events-none">
        {/* Línea central */}
        <View className="absolute top-1/2 left-0 right-0 h-[2px] bg-neutral-outline-variant -translate-y-1/2" />
        {/* Círculo central */}
        <View className="absolute top-1/2 left-1/2 w-24 h-24 rounded-full border-[2px] border-neutral-outline-variant -translate-x-1/2 -translate-y-1/2" />
        {/* Punto central */}
        <View className="absolute top-1/2 left-1/2 w-1.5 h-1.5 rounded-full bg-neutral-outline-variant -translate-x-1/2 -translate-y-1/2" />

        {/* Área superior */}
        <View className="absolute top-0 left-1/2 w-40 h-16 border-b-[2px] border-x-[2px] border-neutral-outline-variant -translate-x-1/2" />
        <View className="absolute top-0 left-1/2 w-16 h-6 border-b-[2px] border-x-[2px] border-neutral-outline-variant -translate-x-1/2" />
        {/* Luna superior */}
        <View className="absolute top-16 left-1/2 w-16 h-6 border-b-[2px] border-x-[2px] border-t-0 border-neutral-outline-variant rounded-bl-full rounded-br-full -translate-x-1/2" />

        {/* Área inferior */}
        <View className="absolute bottom-0 left-1/2 w-40 h-16 border-t-[2px] border-x-[2px] border-neutral-outline-variant -translate-x-1/2" />
        <View className="absolute bottom-0 left-1/2 w-16 h-6 border-t-[2px] border-x-[2px] border-neutral-outline-variant -translate-x-1/2" />
        {/* Luna inferior */}
        <View className="absolute bottom-16 left-1/2 w-16 h-6 border-t-[2px] border-x-[2px] border-b-0 border-neutral-outline-variant rounded-tl-full rounded-tr-full -translate-x-1/2" />
      </View>

      {/* Zonas Clickables */}
      {positions.map((pos) => {
        const isSelected = value === pos.id;
        return (
          <TouchableOpacity
            key={pos.id}
            activeOpacity={0.9}
            onPress={() => onChange(pos.id)}
            className="flex-1 justify-center items-center z-10 border-b border-neutral-outline-variant/30 last:border-b-0"
          >
            {/* Fondo Verde si está seleccionado */}
            {isSelected && (
              <View className="absolute inset-0 bg-brand-primary/95" />
            )}

            {/* Pill de Texto */}
            <View className={`flex-row items-center justify-center px-6 py-2.5 rounded-full border ${isSelected ? 'bg-brand-primary border-[#003914]' : 'bg-surface-base/90 border-neutral-outline-variant'}`}>
              {isSelected && <Feather name="check" size={18} color="#003914" style={{ marginRight: 6 }} />}
              <Text className={`font-black text-sm uppercase tracking-widest ${isSelected ? 'text-[#003914]' : 'text-neutral-on-surface-variant'}`}>
                {pos.label}
              </Text>
            </View>
          </TouchableOpacity>
        );
      })}
    </View>
  );
};

export default function OnboardingScreen() {
  const { user, refreshProfile } = useAuth();

  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [zones, setZones] = useState<string[]>([]);
  const [showZonePicker, setShowZonePicker] = useState(false);
  const [loadingZones, setLoadingZones] = useState(true);

  const [alertVisible, setAlertVisible] = useState(false);
  const [alertTitle, setAlertTitle] = useState('');
  const [alertMessage, setAlertMessage] = useState('');

  const { control, handleSubmit, trigger, watch, setValue, formState: { errors } } = useForm<OnboardingFormData>({
    resolver: zodResolver(onboardingSchema),
    defaultValues: {
      fullName: '',
      username: '',
      zone: '',
      position: 'CUALQUIERA',
    },
  });

  const selectedZone = watch('zone');
  const selectedPosition = watch('position');

  useEffect(() => {
    fetchZones();
  }, []);

  async function fetchZones() {
    setLoadingZones(true);
    const { data, error } = await supabase.from('zones').select('name').eq('is_active', true);
    if (!error && data) {
      setZones(data.map(z => z.name));
    } else {
      setZones(['Buenos Aires Centro', 'GBA Norte', 'GBA Sur', 'GBA Oeste']);
    }
    setLoadingZones(false);
  }

  const showAlert = (title: string, message: string) => {
    setAlertTitle(title);
    setAlertMessage(message);
    setAlertVisible(true);
  };

  const handleNextStep = async () => {
    const isStep1Valid = await trigger(['fullName', 'username', 'zone']);
    if (isStep1Valid) {
      setStep(2);
    }
  };

  const onSubmit = async (data: OnboardingFormData) => {
    if (!user) return;
    setLoading(true);

    const { data: existingUser } = await supabase
      .from('profiles')
      .select('id')
      .eq('username', data.username)
      .neq('auth_user_id', user.id)
      .maybeSingle();

    if (existingUser) {
      setLoading(false);
      setStep(1);
      showAlert('Error', 'Ese nombre de usuario ya está en uso. Por favor, elige otro.');
      return;
    }

    const { error } = await supabase
      .from('profiles')
      .upsert({
        auth_user_id: user.id,
        full_name: data.fullName,
        username: data.username,
        zone: data.zone,
        preferred_position: data.position,
        updated_at: new Date().toISOString()
      });

    if (error) {
      setLoading(false);
      showAlert('Error al guardar', getGenericSupabaseErrorMessage(error, 'No se pudo guardar tu perfil. Intentalo nuevamente.'));
    } else {
      await refreshProfile();
      setLoading(false);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-surface-base">
      {step === 2 && (
        <View className="px-6 pt-4 pb-2">
          <TouchableOpacity className="flex-row items-center gap-1 active:opacity-70" onPress={() => setStep(1)}>
            <Feather name="chevron-left" size={24} color="#BCCBB9" />
            <Text className="font-bold text-sm text-neutral-on-surface-variant">Atrás</Text>
          </TouchableOpacity>
        </View>
      )}

      <ScrollView contentContainerStyle={{ padding: 24, paddingBottom: 60, paddingTop: step === 1 ? 24 : 8 }}>
        <View className="mb-8">
          <View className="flex-row justify-between items-end mb-3">
            <Text className="font-bold text-xl uppercase tracking-widest text-brand-primary">Paso {step} de 2</Text>
            <Text className="font-medium text-sm text-neutral-on-surface-variant">{step === 1 ? 'Datos Base' : 'Finalizando Perfil'}</Text>
          </View>
          <View className="h-1.5 w-full rounded-full overflow-hidden flex-row bg-surface-high">
            <View className={`h-full bg-brand-primary ${step === 1 ? 'w-1/2' : 'w-full'}`} style={{ shadowColor: '#53E076', shadowOpacity: 0.4, shadowRadius: 12 }} />
          </View>
        </View>

        {step === 1 ? (
          <View>
            <View className="mb-6">
              <Text className="text-3xl font-bold text-neutral-on-surface mb-2">Datos Personales</Text>
              <Text className="text-neutral-on-surface-variant">Cuéntanos cómo te llamas y por dónde prefieres jugar.</Text>
            </View>

            <View className="space-y-4 mb-8 gap-4">
              <View>
                <Text className="text-xs uppercase tracking-wider mb-2 font-bold text-neutral-on-surface-variant">Nombre Completo</Text>
                <Controller
                  control={control}
                  name="fullName"
                  render={({ field: { onChange, onBlur, value } }) => (
                    <TextInput
                      className={`w-full rounded-xl border px-4 py-4 text-neutral-on-surface ${errors.fullName ? 'border-red-500' : 'border-neutral-outline-variant'} bg-surface-low`}
                      placeholder="Ej: Lionel Messi"
                      placeholderTextColor="#3A3939"
                      onBlur={onBlur}
                      onChangeText={onChange}
                      value={value}
                    />
                  )}
                />
                {errors.fullName && <Text className="text-red-500 text-xs mt-1">{errors.fullName.message}</Text>}
              </View>

              <View>
                <Text className="text-xs uppercase tracking-wider mb-2 font-bold text-neutral-on-surface-variant">Nombre de Usuario</Text>
                <Controller
                  control={control}
                  name="username"
                  render={({ field: { onChange, onBlur, value } }) => (
                    <TextInput
                      className={`w-full rounded-xl border px-4 py-4 text-neutral-on-surface ${errors.username ? 'border-red-500' : 'border-neutral-outline-variant'} bg-surface-low`}
                      placeholder="Ej: leomessi"
                      placeholderTextColor="#3A3939"
                      autoCapitalize="none"
                      onBlur={onBlur}
                      onChangeText={(text) => onChange(text.toLowerCase())}
                      value={value}
                    />
                  )}
                />
                {errors.username && <Text className="text-red-500 text-xs mt-1">{errors.username.message}</Text>}
              </View>

              <View>
                <Text className="text-xs uppercase tracking-wider mb-2 font-bold text-neutral-on-surface-variant">Zona de Juego Principal</Text>
                <TouchableOpacity
                  onPress={() => setShowZonePicker(true)}
                  activeOpacity={0.8}
                  className={`w-full rounded-xl px-4 py-4 flex-row justify-between items-center border ${errors.zone ? 'border-red-500' : 'border-neutral-outline-variant'} bg-surface-low`}
                >
                  <Text className={selectedZone ? 'text-neutral-on-surface' : 'text-surface-bright'}>
                    {selectedZone || "Selecciona una zona"}
                  </Text>
                  {loadingZones ? <ActivityIndicator size="small" color="#53E076" /> : <Feather name="chevron-down" size={20} color="#BCCBB9" />}
                </TouchableOpacity>
                {errors.zone && <Text className="text-red-500 text-xs mt-1">{errors.zone.message}</Text>}
              </View>
            </View>

            <TouchableOpacity
              onPress={handleNextStep}
              activeOpacity={0.9}
              className="w-full py-4 rounded-xl items-center bg-brand-primary"
            >
              <Text className="font-bold text-xl uppercase tracking-widest text-[#003914]">Siguiente</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View>
            <View className="mb-6">
              <Text className="text-3xl font-bold text-neutral-on-surface mb-2">Perfil Técnico</Text>
              <Text className="text-neutral-on-surface-variant">Toca el sector de la cancha donde te destacas.</Text>
            </View>

            {/* Selector de Cancha Nativo */}
            <PitchSelector
              value={selectedPosition}
              onChange={(val) => setValue('position', val, { shouldValidate: true })}
            />

            {/* Opción Flexible como lo pide el diseño */}
            <View className="flex-row items-center justify-center mb-8">
              <TouchableOpacity
                activeOpacity={0.9}
                onPress={() => setValue('position', 'CUALQUIERA')}
                className={`px-8 py-3.5 rounded-full border ${selectedPosition === 'CUALQUIERA' ? 'bg-brand-primary border-[#003914]' : 'bg-surface-low border-neutral-outline-variant'}`}
              >
                <Text className={`font-bold uppercase tracking-widest text-sm ${selectedPosition === 'CUALQUIERA' ? 'text-[#003914]' : 'text-neutral-on-surface-variant'}`}>
                  {selectedPosition === 'CUALQUIERA' && <Feather name="check" size={14} color="#003914" />} Soy Flexible
                </Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              onPress={handleSubmit(onSubmit)}
              disabled={loading}
              activeOpacity={0.9}
              className={`w-full py-4 rounded-xl items-center ${loading ? 'bg-brand-primary/50' : 'bg-brand-primary'}`}
            >
              {loading ? <ActivityIndicator color="#003914" /> : <Text className="font-bold text-xl uppercase tracking-widest text-[#003914]">Comenzar</Text>}
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>

      {/* Modal Zonas */}
      <Modal visible={showZonePicker} transparent animationType="fade" onRequestClose={() => setShowZonePicker(false)}>
        <TouchableWithoutFeedback onPress={() => setShowZonePicker(false)}>
          <View className="flex-1 justify-end bg-black/80">
            <TouchableWithoutFeedback>
              <View className="rounded-t-3xl overflow-hidden max-h-[50%] border-t border-neutral-outline-variant bg-surface-base">
                <View className="p-4 border-b border-neutral-outline-variant flex-row justify-between items-center">
                  <Text className="text-lg font-bold text-neutral-on-surface">Selecciona tu Zona</Text>
                  <TouchableOpacity onPress={() => setShowZonePicker(false)}><Feather name="x" size={24} color="#BCCBB9" /></TouchableOpacity>
                </View>
                <FlatList
                  data={zones}
                  keyExtractor={(item, index) => `${item}-${index}`}
                  contentContainerStyle={{ padding: 16 }}
                  renderItem={({ item }) => (
                    <TouchableOpacity
                      className="py-4 border-b border-surface-high flex-row items-center justify-between"
                      onPress={() => {
                        setValue('zone', item, { shouldValidate: true });
                        setShowZonePicker(false);
                      }}
                    >
                      <Text className="text-base text-neutral-on-surface">{item}</Text>
                      {selectedZone === item && <Feather name="check" size={20} color="#53E076" />}
                    </TouchableOpacity>
                  )}
                />
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      <CustomAlert visible={alertVisible} title={alertTitle} message={alertMessage} onClose={() => setAlertVisible(false)} />
    </SafeAreaView>
  );
}