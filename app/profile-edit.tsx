import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, Platform, KeyboardAvoidingView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';

import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { AppIcon } from '@/components/ui/AppIcon';
import { HeroButton } from '@/components/ui/HeroButton';
import { PitchSelector } from '@/components/ui/PitchSelector';
import { getGenericSupabaseErrorMessage } from '@/lib/auth-error-messages';
import { useCustomAlert } from '@/hooks/useCustomAlert';
import { GlobalLoader } from '@/components/GlobalLoader';
import { updateProfile } from '@/lib/profile-edit-data';
import { ZonePickerDialog } from '@/components/ui/ZonePickerDialog';
import { userProfileSchema, UserProfileFormData } from '@/lib/schemas/userSchema';

type ProfilePos = UserProfileFormData['position'];

export default function ProfileEditScreen() {
  const router = useRouter();
  const { profile, refreshProfile } = useAuth();

  const [loading, setLoading] = useState(false);
  const [showZonePicker, setShowZonePicker] = useState(false);
  
  const { showAlert, AlertComponent } = useCustomAlert();

  const { control, handleSubmit, setValue, watch, formState: { errors } } = useForm<UserProfileFormData>({
    resolver: zodResolver(userProfileSchema),
    defaultValues: {
      fullName: profile?.full_name || '',
      username: profile?.username || '',
      zone: profile?.zone || '',
      position: (profile?.preferred_position as ProfilePos) ?? 'CUALQUIERA',
    },
  });

  const selectedZone = watch('zone');
  const selectedPosition = watch('position');

  const onSubmit = async (data: UserProfileFormData) => {
    if (!profile) return;
    setLoading(true);

    try {
      await updateProfile(profile.id, data);

      await refreshProfile();
      showAlert('Éxito', 'Tu perfil se ha actualizado correctamente.');

      // Navigate back after a short delay so user sees the success message
      setTimeout(() => {
        router.back();
      }, 1500);

    } catch (error: unknown) {
      if (typeof error === 'object' && error !== null && 'code' in error && (error as any).code === '23505') {
        showAlert('Error al actualizar', 'Ese nombre de usuario ya está en uso. Por favor, elige otro.');
      } else {
        showAlert('Error al actualizar', getGenericSupabaseErrorMessage(error, 'No pudimos guardar los cambios.'));
      }
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <GlobalLoader label="Guardando cambios..." />;
  }

  return (
    <SafeAreaView className="flex-1 bg-surface-base">
      <KeyboardAvoidingView 
        behavior={Platform.OS === 'ios' ? 'padding' : undefined} 
        className="flex-1"
      >
        <View className="px-4 pb-2 pt-1">
          <TouchableOpacity className="w-10" activeOpacity={0.8} onPress={() => router.back()}>
            <AppIcon family="material-icons" name="arrow-back-ios-new" size={22} color="#BCCBB9" />
          </TouchableOpacity>
        </View>

        <ScrollView 
          className="px-4" 
          contentContainerStyle={{ paddingBottom: 36 }}
          keyboardShouldPersistTaps="handled"
        >
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
                <AppIcon family="material-icons" name="keyboard-arrow-down" size={22} color="#BCCBB9" />
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
      </KeyboardAvoidingView>

      <ZonePickerDialog
        visible={showZonePicker}
        onClose={() => setShowZonePicker(false)}
        selectedZone={selectedZone}
        onSelect={(val) => setValue('zone', val, { shouldValidate: true })}
      />

      {AlertComponent}
    </SafeAreaView>
  );
}