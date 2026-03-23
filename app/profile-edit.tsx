import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, Modal, FlatList, TouchableWithoutFeedback, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';

import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { AppIcon } from '@/components/ui/AppIcon';
import CustomAlert from '@/components/ui/CustomAlert';
import { HeroButton } from '@/components/ui/HeroButton';
import { PitchSelector } from '@/components/ui/PitchSelector';
import { getGenericSupabaseErrorMessage } from '@/lib/auth-error-messages';

const editProfileSchema = z.object({
  fullName: z.string().min(3, 'El nombre debe tener al menos 3 caracteres'),
  username: z.string()
    .min(3, 'El usuario debe tener al menos 3 caracteres')
    .regex(/^[a-z0-9_]+$/, 'Solo minúsculas, números y guiones bajos (_) sin espacios'),
  zone: z.string().min(1, 'Debes seleccionar una zona'),
  position: z.enum(['CUALQUIERA', 'ARQUERO', 'DEFENSOR', 'MEDIOCAMPISTA', 'DELANTERO']),
});

type EditProfileFormData = z.infer<typeof editProfileSchema>;

export default function ProfileEditScreen() {
  const router = useRouter();
  const { profile, refreshProfile } = useAuth();

  const [loading, setLoading] = useState(false);
  const [alertVisible, setAlertVisible] = useState(false);
  const [alertTitle, setAlertTitle] = useState('');
  const [alertMessage, setAlertMessage] = useState('');

  const [zones, setZones] = useState<string[]>([]);
  const [showZonePicker, setShowZonePicker] = useState(false);
  const [loadingZones, setLoadingZones] = useState(true);

  const showAlert = (title: string, message: string) => {
    setAlertTitle(title);
    setAlertMessage(message);
    setAlertVisible(true);
  };

  const { control, handleSubmit, setValue, watch, formState: { errors } } = useForm<EditProfileFormData>({
    resolver: zodResolver(editProfileSchema),
    defaultValues: {
      fullName: profile?.full_name || '',
      username: profile?.username || '',
      zone: profile?.zone || '',
      position: (profile?.preferred_position as any) || 'CUALQUIERA',
    },
  });

  const selectedZone = watch('zone');
  const selectedPosition = watch('position');

  useEffect(() => {
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
    void fetchZones();
  }, []);

  const onSubmit = async (data: EditProfileFormData) => {
    if (!profile) return;
    setLoading(true);

    try {
      // Update profile
      const { error: updateError } = await supabase
        .from('profiles')
        .update({
          full_name: data.fullName,
          username: data.username,
          zone: data.zone,
          preferred_position: data.position,
        })
        .eq('id', profile.id);

      if (updateError) throw updateError;

      await refreshProfile();
      showAlert('Éxito', 'Tu perfil se ha actualizado correctamente.');

      // Navigate back after a short delay so user sees the success message
      setTimeout(() => {
        router.back();
      }, 1500);

    } catch (error: any) {
      showAlert('Error al actualizar', getGenericSupabaseErrorMessage(error, 'No pudimos guardar los cambios. Revisa que el usuario no esté en uso.'));
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

      <ScrollView className="px-4" contentContainerStyle={{ paddingBottom: 36 }}>
        <Text className="font-displayBlack text-3xl uppercase tracking-tight text-neutral-on-surface">Editar Perfil</Text>
        <Text className="font-ui mt-1 text-sm text-neutral-on-surface-variant">Modifica tus datos personales y tu posicion preferida en la cancha.</Text>

        <View className="mt-8 gap-4">
          {/* FULL NAME */}
          <View>
            <Text className="font-display text-xs uppercase tracking-wider mb-2 text-neutral-on-surface-variant">Nombre y Apellido</Text>
            <Controller
              control={control}
              name="fullName"
              render={({ field: { onChange, onBlur, value } }) => (
                <TextInput
                  className={`w-full rounded-xl border px-4 py-4 text-neutral-on-surface ${errors.fullName ? 'border-red-500' : 'border-neutral-outline-variant/15'} bg-surface-low`}
                  placeholder="Ej. Lionel Messi"
                  placeholderTextColor="#3A3939"
                  onBlur={onBlur}
                  onChangeText={onChange}
                  value={value}
                  autoCapitalize="words"
                />
              )}
            />
            {errors.fullName && <Text className="text-red-500 text-xs mt-1">{errors.fullName.message}</Text>}
          </View>

          {/* USERNAME */}
          <View>
            <Text className="font-display text-xs uppercase tracking-wider mb-2 text-neutral-on-surface-variant">Nombre de usuario</Text>
            <Controller
              control={control}
              name="username"
              render={({ field: { onChange, onBlur, value } }) => (
                <TextInput
                  className={`w-full rounded-xl border px-4 py-4 text-neutral-on-surface ${errors.username ? 'border-red-500' : 'border-neutral-outline-variant/15'} bg-surface-low`}
                  placeholder="usuario_123"
                  placeholderTextColor="#3A3939"
                  autoCapitalize="none"
                  autoCorrect={false}
                  onBlur={onBlur}
                  onChangeText={(text) => onChange(text.toLowerCase())}
                  value={value}
                />
              )}
            />
            {errors.username && <Text className="text-red-500 text-xs mt-1">{errors.username.message}</Text>}
          </View>

          {/* ZONE */}
          <View>
            <Text className="font-display text-xs uppercase tracking-wider mb-2 text-neutral-on-surface-variant">Zona de Juego Principal</Text>
            <TouchableOpacity
              onPress={() => setShowZonePicker(true)}
              activeOpacity={0.8}
              className={`w-full rounded-xl px-4 py-4 flex-row justify-between items-center border ${errors.zone ? 'border-red-500' : 'border-neutral-outline-variant/15'} bg-surface-low`}
            >
              <Text className={selectedZone ? 'text-neutral-on-surface' : 'text-surface-bright'}>
                {selectedZone || "Selecciona una zona"}
              </Text>
              {loadingZones ? <ActivityIndicator size="small" color="#53E076" /> : <AppIcon family="material-icons" name="keyboard-arrow-down" size={22} color="#BCCBB9" />}
            </TouchableOpacity>
            {errors.zone && <Text className="text-red-500 text-xs mt-1">{errors.zone.message}</Text>}
          </View>

          {/* POSITION */}
          <View>
            <Text className="font-display text-xs uppercase tracking-widest text-[#BCCBB9] text-center mb-6 mt-4">Tu Posición Preferida</Text>
            <Controller
              control={control}
              name="position"
              render={({ field: { onChange, value } }) => (
                <PitchSelector value={value} onChange={onChange} />
              )}
            />
            
            {/* Opción Flexible como lo pide el diseño */}
            <View className="flex-row items-center justify-center mt-6 mb-2">
              <TouchableOpacity
                activeOpacity={0.9}
                onPress={() => setValue('position', 'CUALQUIERA')}
                className={`px-8 py-3.5 rounded-full border ${selectedPosition === 'CUALQUIERA' ? 'bg-brand-primary border-[#003914]' : 'bg-surface-low border-neutral-outline-variant/15'}`}
              >
                <Text className={`font-display uppercase tracking-widest text-sm ${selectedPosition === 'CUALQUIERA' ? 'text-[#003914]' : 'text-neutral-on-surface-variant'}`}>
                  {selectedPosition === 'CUALQUIERA' && <AppIcon family="material-community" name="check-circle" size={14} color="#003914" />} Soy Flexible
                </Text>
              </TouchableOpacity>
            </View>

            {errors.position && <Text className="font-ui mt-1 text-xs text-red-500 text-center">{errors.position.message}</Text>}
          </View>
        </View>

        <View className="mt-8">
            {/* SAVE BUTTON */}
            <HeroButton
              onPress={handleSubmit(onSubmit)}
              label={loading ? "Guardando..." : "Guardar Cambios"}
              isLoading={loading}
            />
          </View>
      </ScrollView>

      {/* Modal Zonas */}
      <Modal visible={showZonePicker} transparent animationType="fade" onRequestClose={() => setShowZonePicker(false)}>
        <TouchableWithoutFeedback onPress={() => setShowZonePicker(false)}>
          <View className="flex-1 items-center justify-center bg-black/80 px-6">
            <TouchableWithoutFeedback>
              <View className="w-full max-w-sm rounded-2xl border border-neutral-outline-variant/15 bg-surface-high p-4">
                <Text className="font-display mb-3 text-lg text-neutral-on-surface">Selecciona una zona</Text>

                {loadingZones ? (
                  <View className="py-6">
                    <ActivityIndicator size="small" color="#53E076" />
                  </View>
                ) : (
                  <FlatList
                    data={zones}
                    keyExtractor={(item) => item}
                    style={{ maxHeight: 320 }}
                    ItemSeparatorComponent={() => <View className="h-2" />}
                    renderItem={({ item }) => (
                        <TouchableOpacity
                          activeOpacity={0.9}
                          onPress={() => {
                            setValue('zone', item, { shouldValidate: true });
                            setShowZonePicker(false);
                          }}
                          className={`rounded-lg border px-3 py-3 ${selectedZone === item ? 'border-brand-primary bg-brand-primary/15' : 'border-neutral-outline-variant/15 bg-surface-low'}`}
                        >
                          <Text className={`font-ui ${selectedZone === item ? 'text-brand-primary' : 'text-neutral-on-surface'}`}>{item}</Text>
                      </TouchableOpacity>
                    )}
                    ListEmptyComponent={() => (
                      <Text className="py-2 text-sm text-neutral-on-surface-variant">No hay zonas activas disponibles.</Text>
                    )}
                  />
                )}

                <TouchableOpacity
                  onPress={() => setShowZonePicker(false)}
                  activeOpacity={0.9}
                  className="mt-4 items-center rounded-lg bg-surface-low py-3"
                >
                  <Text className="font-display text-xs uppercase tracking-wider text-neutral-on-surface-variant">Cerrar</Text>
                </TouchableOpacity>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      <CustomAlert visible={alertVisible} title={alertTitle} message={alertMessage} onClose={() => setAlertVisible(false)} />
    </SafeAreaView>
  );
}