import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../context/AuthContext';
import { AppIcon } from '@/components/ui/AppIcon';
import { HeroButton } from '@/components/ui/HeroButton';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { getGenericSupabaseErrorMessage } from '@/lib/auth-error-messages';
import { PitchSelector } from '@/components/ui/PitchSelector';
import { useCustomAlert } from '@/hooks/useCustomAlert';
import { ZonePickerDialog } from '@/components/ui/ZonePickerDialog';
import { userProfileSchema, UserProfileFormData } from '@/lib/schemas/userSchema';
import { saveOnboardingProfile } from '@/lib/onboarding-data';

export default function OnboardingScreen() {
  const { user, refreshProfile } = useAuth();

  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [showZonePicker, setShowZonePicker] = useState(false);

  const { showAlert, AlertComponent } = useCustomAlert();

  const { control, handleSubmit, trigger, watch, setValue, formState: { errors } } = useForm<UserProfileFormData>({
    resolver: zodResolver(userProfileSchema),
    defaultValues: {
      fullName: '',
      username: '',
      zone: '',
      position: 'CUALQUIERA',
    },
  });

  const selectedZone = watch('zone');
  const selectedPosition = watch('position');

  const handleNextStep = async () => {
    const isStep1Valid = await trigger(['fullName', 'username', 'zone']);
    if (isStep1Valid) {
      setStep(2);
    }
  };

  const onSubmit = async (data: UserProfileFormData) => {
    if (!user) return;
    setLoading(true);
    try {
      await saveOnboardingProfile(user.id, data);
      await refreshProfile();
    } catch (error: any) {
      if (error?.code === '23505' && error?.message?.includes('username')) {
        setStep(1);
        showAlert('Error', 'Ese nombre de usuario ya está en uso. Por favor, elige otro.');
      } else {
        showAlert('Error al guardar', getGenericSupabaseErrorMessage(error, 'No se pudo guardar tu perfil. Intentalo nuevamente.'));
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-surface-base">
      {step === 2 && (
        <View className="px-6 pt-4 pb-2">
          <TouchableOpacity className="flex-row items-center gap-1 active:opacity-70" onPress={() => setStep(1)}>
            <AppIcon family="material-icons" name="arrow-back-ios-new" size={20} color="#BCCBB9" />
            <Text className="font-uiBold text-sm text-neutral-on-surface-variant">Atras</Text>
          </TouchableOpacity>
        </View>
      )}

      <ScrollView contentContainerStyle={{ padding: 24, paddingBottom: 60, paddingTop: step === 1 ? 24 : 8 }}>
        <View className="mb-8">
          <View className="flex-row justify-between items-end mb-3">
            <Text className="font-display text-xl uppercase tracking-widest text-brand-primary">Paso {step} de 2</Text>
            <Text className="font-ui text-sm text-neutral-on-surface-variant">{step === 1 ? 'Datos Base' : 'Finalizando Perfil'}</Text>
          </View>
          <View className="h-1.5 w-full rounded-full overflow-hidden flex-row bg-surface-high">
            <View className={`h-full bg-brand-primary ${step === 1 ? 'w-1/2' : 'w-full'}`} style={{ shadowColor: '#53E076', shadowOpacity: 0.4, shadowRadius: 12 }} />
          </View>
        </View>

        {step === 1 ? (
          <View>
            <View className="mb-6">
              <Text className="font-displayBlack text-3xl text-neutral-on-surface mb-2">Datos Personales</Text>
              <Text className="font-ui text-neutral-on-surface-variant">Cuentanos como te llamas y por donde prefieres jugar.</Text>
            </View>

            <View className="space-y-4 mb-8 gap-4">
              <View>
                <Text className="font-display text-xs uppercase tracking-wider mb-2 text-neutral-on-surface-variant">Nombre Completo</Text>
                <Controller
                  control={control}
                  name="fullName"
                  render={({ field: { onChange, onBlur, value } }) => (
                    <TextInput
                      className={`w-full rounded-xl border px-4 py-4 text-neutral-on-surface ${errors.fullName ? 'border-red-500' : 'border-neutral-outline-variant/15'} bg-surface-low`}
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
                <Text className="font-display text-xs uppercase tracking-wider mb-2 text-neutral-on-surface-variant">Nombre de Usuario</Text>
                <Controller
                  control={control}
                  name="username"
                  render={({ field: { onChange, onBlur, value } }) => (
                    <TextInput
                      className={`w-full rounded-xl border px-4 py-4 text-neutral-on-surface ${errors.username ? 'border-red-500' : 'border-neutral-outline-variant/15'} bg-surface-low`}
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
            </View>

            <HeroButton
              onPress={handleNextStep}
              label="Siguiente"
              style={{ width: '100%' }}
            />
          </View>
        ) : (
          <View>
            <View className="mb-6">
              <Text className="font-displayBlack text-3xl text-neutral-on-surface mb-2">Perfil Tecnico</Text>
              <Text className="font-ui text-neutral-on-surface-variant">Toca el sector de la cancha donde te destacas.</Text>
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
                className={`px-8 py-3.5 rounded-full border ${selectedPosition === 'CUALQUIERA' ? 'bg-brand-primary border-[#003914]' : 'bg-surface-low border-neutral-outline-variant/15'}`}
              >
                <Text className={`font-display uppercase tracking-widest text-sm ${selectedPosition === 'CUALQUIERA' ? 'text-[#003914]' : 'text-neutral-on-surface-variant'}`}>
                  {selectedPosition === 'CUALQUIERA' && <AppIcon family="material-community" name="check-circle" size={14} color="#003914" />} Soy Flexible
                </Text>
              </TouchableOpacity>
            </View>

            <HeroButton
              onPress={handleSubmit(onSubmit)}
              isLoading={loading}
              label="Comenzar"
              style={{ width: '100%' }}
            />
          </View>
        )}
      </ScrollView>

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