// tornear/app/onboarding.tsx
import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useAuth } from '../context/AuthContext';
import { AppIcon } from '@/components/ui/AppIcon';
import { HeroButton } from '@/components/ui/HeroButton';
import { useForm, Controller, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { getGenericSupabaseErrorMessage } from '@/lib/auth-error-messages';
import { PitchSelector } from '@/components/ui/PitchSelector';
import { useCustomAlert } from '@/hooks/useCustomAlert';
import { ZonePickerDialog } from '@/components/ui/ZonePickerDialog';
import { OptionPickerDialog } from '@/components/ui/OptionPickerDialog';
import { ProfileFormFields } from '@/components/profile/ProfileFormFields';
import { FAVORITE_TEAM_OPTIONS } from '@/lib/favorite-teams';
import { userProfileSchema, UserProfileFormData } from '@/lib/schemas/userSchema';
import { saveOnboardingProfile } from '@/lib/onboarding-data';

const STEP_WIDTH = ['w-1/3', 'w-2/3', 'w-full'] as const;

export default function OnboardingScreen() {
  const router = useRouter();
  const { user, refreshProfile } = useAuth();

  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [showZonePicker, setShowZonePicker] = useState(false);
  const [showFavoriteTeamPicker, setShowFavoriteTeamPicker] = useState(false);

  const { showAlert, AlertComponent } = useCustomAlert();

  // Google devuelve el nombre en `user_metadata` (name / full_name). Lo usamos
  // de valor inicial para no pedirle al usuario algo que el proveedor ya dio;
  // sigue siendo editable. En el alta por email no hay metadata y queda vacio.
  const googleFullName =
    typeof user?.user_metadata?.full_name === 'string'
      ? user.user_metadata.full_name
      : typeof user?.user_metadata?.name === 'string'
        ? user.user_metadata.name
        : '';

  const {
    control,
    handleSubmit,
    trigger,
    setValue,
    formState: { errors },
  } = useForm<UserProfileFormData>({
    resolver: zodResolver(userProfileSchema),
    defaultValues: {
      fullName: googleFullName,
      username: '',
      zone: '',
      position: 'CUALQUIERA',
      dateOfBirth: '',
      gender: undefined,
      strongFoot: undefined,
      favoriteTeam: '',
    },
  });

  // useWatch por consistencia con /profile-edit: suscripcion por componente, sin
  // depender del Set global `_names.watch`. Detalle del bug en
  // components/profile/ProfileFormFields.tsx.
  const selectedZone = useWatch({ control, name: 'zone' });
  const selectedPosition = useWatch({ control, name: 'position' });
  const selectedFavoriteTeam = useWatch({ control, name: 'favoriteTeam' });

  const handleNextStep = async () => {
    if (step === 1) {
      const valid = await trigger(['fullName', 'username', 'zone']);
      if (valid) setStep(2);
    } else if (step === 2) {
      // favoriteTeam entra acá: dejó de ser opcional y se elige en este paso,
      // junto al resto de los datos personales (ProfileFormFields).
      const valid = await trigger(['dateOfBirth', 'gender', 'strongFoot', 'favoriteTeam']);
      if (valid) setStep(3);
    }
  };

  const onSubmit = async (data: UserProfileFormData) => {
    if (!user) return;
    setLoading(true);
    try {
      await saveOnboardingProfile(user.id, data);
      await refreshProfile();
    } catch (error: unknown) {
      const err = error as { code?: string; message?: string } | null;
      if (err?.code === '23505' && err?.message?.includes('username')) {
        setStep(1);
        showAlert('Error', 'Ese nombre de usuario ya está en uso. Por favor, elige otro.');
      } else {
        showAlert(
          'Error al guardar',
          getGenericSupabaseErrorMessage(
            error,
            'No se pudo guardar tu perfil. Intentalo nuevamente.',
          ),
        );
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-surface-base">
      {step > 1 && (
        <View className="px-6 pt-4 pb-2">
          <TouchableOpacity
            className="flex-row items-center gap-1 active:opacity-70"
            onPress={() => setStep((s) => s - 1)}
          >
            <AppIcon family="material-icons" name="arrow-back-ios-new" size={20} color="#BCCBB9" />
            <Text className="font-uiBold text-sm text-neutral-on-surface-variant">Atras</Text>
          </TouchableOpacity>
        </View>
      )}

      <ScrollView
        contentContainerStyle={{
          padding: 24,
          paddingBottom: 60,
          paddingTop: step === 1 ? 24 : 8,
        }}
        keyboardShouldPersistTaps="handled"
      >
        {/* Progress bar */}
        <View className="mb-8">
          <View className="flex-row justify-between items-end mb-3">
            <Text className="font-display text-xl uppercase tracking-widest text-brand-primary">
              Paso {step} de 3
            </Text>
            <Text className="font-ui text-sm text-neutral-on-surface-variant">
              {step === 1 ? 'Datos Base' : step === 2 ? 'Datos Personales' : 'Tu Cancha'}
            </Text>
          </View>
          <View className="h-1.5 w-full rounded-full overflow-hidden flex-row bg-surface-high">
            <View
              className={`h-full bg-brand-primary ${STEP_WIDTH[step - 1]}`}
              style={{ shadowColor: '#53E076', shadowOpacity: 0.4, shadowRadius: 12 }}
            />
          </View>
        </View>

        {/* ── PASO 1: Datos Base ─────────────────────────────────── */}
        {step === 1 && (
          <View>
            <View className="mb-6">
              <Text className="font-displayBlack text-3xl text-neutral-on-surface mb-2">
                Datos Personales
              </Text>
              <Text className="font-ui text-neutral-on-surface-variant">
                Cuentanos como te llamas y por donde prefieres jugar.
              </Text>
            </View>

            <View className="gap-4 mb-8">
              {/* FULL NAME */}
              <View>
                <Text className="font-display text-xs uppercase tracking-wider mb-2 text-neutral-on-surface-variant">
                  Nombre Completo
                </Text>
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
                {errors.fullName && (
                  <Text className="text-red-500 text-xs mt-1">{errors.fullName.message}</Text>
                )}
              </View>

              {/* USERNAME */}
              <View>
                <Text className="font-display text-xs uppercase tracking-wider mb-2 text-neutral-on-surface-variant">
                  Nombre de Usuario
                </Text>
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
                {errors.username && (
                  <Text className="text-red-500 text-xs mt-1">{errors.username.message}</Text>
                )}
              </View>

              {/* ZONE */}
              <View>
                <Text className="font-display text-xs uppercase tracking-wider mb-2 text-neutral-on-surface-variant">
                  Zona de Juego Principal
                </Text>
                <TouchableOpacity
                  onPress={() => setShowZonePicker(true)}
                  activeOpacity={0.8}
                  className={`w-full rounded-xl px-4 py-4 flex-row justify-between items-center border ${errors.zone ? 'border-red-500' : 'border-neutral-outline-variant/15'} bg-surface-low`}
                >
                  <Text
                    className={`flex-1 ${selectedZone ? 'text-neutral-on-surface' : 'text-surface-bright'}`}
                    style={{ minWidth: 0 }}
                    numberOfLines={1}
                  >
                    {selectedZone || 'Selecciona una zona'}
                  </Text>
                  <AppIcon
                    family="material-icons"
                    name="keyboard-arrow-down"
                    size={22}
                    color="#BCCBB9"
                  />
                </TouchableOpacity>
                {errors.zone && (
                  <Text className="text-red-500 text-xs mt-1">{errors.zone.message}</Text>
                )}
              </View>
            </View>

            <HeroButton onPress={handleNextStep} label="Siguiente" style={{ width: '100%' }} />
          </View>
        )}

        {/* ── PASO 2: Datos Personales ───────────────────────────── */}
        {step === 2 && (
          <View>
            <View className="mb-6">
              <Text className="font-displayBlack text-3xl text-neutral-on-surface mb-2">
                Datos Personales
              </Text>
              <Text className="font-ui text-neutral-on-surface-variant">
                Estos datos mejoran tu experiencia en el Mercado de Pases.
              </Text>
            </View>

            <View className="mb-8">
              {/* Mismo componente que usa /profile-edit: lo que se pide acá es
                  exactamente lo que después se puede editar (bug 2). */}
              <ProfileFormFields
                control={control}
                errors={errors}
                setValue={setValue}
                onOpenFavoriteTeamPicker={() => setShowFavoriteTeamPicker(true)}
              />
            </View>

            <HeroButton onPress={handleNextStep} label="Siguiente" style={{ width: '100%' }} />
          </View>
        )}

        {/* ── PASO 3: Cancha ─────────────────────────────────────── */}
        {step === 3 && (
          <View>
            <View className="mb-6">
              <Text className="font-displayBlack text-3xl text-neutral-on-surface mb-2">
                Tu Cancha
              </Text>
              <Text className="font-ui text-neutral-on-surface-variant">
                Toca el sector de la cancha donde te destacas.
              </Text>
            </View>

            <PitchSelector
              value={selectedPosition}
              onChange={(val) => setValue('position', val, { shouldValidate: true })}
            />

            <View className="flex-row items-center justify-center mb-8">
              <TouchableOpacity
                activeOpacity={0.9}
                onPress={() => setValue('position', 'CUALQUIERA', { shouldValidate: true })}
                className={`px-8 py-3.5 rounded-full border ${
                  selectedPosition === 'CUALQUIERA'
                    ? 'bg-brand-primary border-[#003914]'
                    : 'bg-surface-low border-neutral-outline-variant/15'
                }`}
              >
                <Text
                  className={`font-display uppercase tracking-widest text-sm ${
                    selectedPosition === 'CUALQUIERA' ? 'text-[#003914]' : 'text-neutral-on-surface-variant'
                  }`}
                >
                  {selectedPosition === 'CUALQUIERA' && (
                    <AppIcon family="material-community" name="check-circle" size={14} color="#003914" />
                  )}{' '}
                  Soy Flexible
                </Text>
              </TouchableOpacity>
            </View>

            <View className="mb-6 flex-row flex-wrap items-center justify-center px-4 mt-8">
              <Text className="font-ui text-xs text-neutral-on-surface-variant text-center">
                Al comenzar aceptas los{' '}
              </Text>
              <TouchableOpacity onPress={() => router.push('/(modals)/terms' as any)}>
                <Text className="font-uiBold text-xs text-brand-primary">Términos</Text>
              </TouchableOpacity>
              <Text className="font-ui text-xs text-neutral-on-surface-variant"> y la </Text>
              <TouchableOpacity onPress={() => router.push('/(modals)/privacy' as any)}>
                <Text className="font-uiBold text-xs text-brand-primary">Privacidad</Text>
              </TouchableOpacity>
              <Text className="font-ui text-xs text-neutral-on-surface-variant">.</Text>
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

      <OptionPickerDialog
        visible={showFavoriteTeamPicker}
        title="Cuadro favorito"
        options={FAVORITE_TEAM_OPTIONS}
        selected={selectedFavoriteTeam}
        onClose={() => setShowFavoriteTeamPicker(false)}
        onSelect={(val) => setValue('favoriteTeam', val, { shouldValidate: true })}
      />

      {AlertComponent}
    </SafeAreaView>
  );
}
