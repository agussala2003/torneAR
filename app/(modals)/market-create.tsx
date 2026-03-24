import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, TextInput, ScrollView, ActivityIndicator } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';

import { AppIcon } from '@/components/ui/AppIcon';
import { HeroButton } from '@/components/ui/HeroButton';
import { PitchSelector } from '@/components/ui/PitchSelector';
import { ZonePickerDialog } from '@/components/ui/ZonePickerDialog';
import { useAuth } from '@/context/AuthContext';
import { useUI } from '@/context/UIContext';

import {
  createTeamPostSchema,
  createPlayerPostSchema,
  CreateTeamPostInput,
  CreatePlayerPostInput,
} from '@/lib/schemas/marketSchema';
import { createTeamPost, createPlayerPost, fetchUserManagedTeams, ManagedTeam } from '@/lib/market-api';

type CreationType = 'TEAM' | 'PLAYER';

export function MarketCreateContent({ onClose }: { onClose: () => void }) {
  const { user } = useAuth();
  const { showAlert } = useUI();

  const [creationType, setCreationType] = useState<CreationType>('TEAM');
  const [managedTeams, setManagedTeams] = useState<ManagedTeam[]>([]);
  const [isLoadingTeams, setIsLoadingTeams] = useState(true);

  useEffect(() => {
    if (!user) return;
    fetchUserManagedTeams(user.id)
      .then((teams) => setManagedTeams(teams))
      .catch((err) => console.error('Error fetching managed teams', err))
      .finally(() => setIsLoadingTeams(false));
  }, [user]);

  return (
    <SafeAreaView className="flex-1 bg-surface-base" edges={['top']}>
      <View className="px-6 py-4 flex-row items-center border-b border-surface-high bg-surface-base">
        <TouchableOpacity
          onPress={onClose}
          className="mr-4"
          activeOpacity={0.7} // IMPORTANTE: SIN CLASES ACTIVE: DE TAILWIND
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <AppIcon family="material-icons" name="arrow-back" size={24} color="#00E65B" />
        </TouchableOpacity>
        <Text className="text-neutral-on-surface font-displayBlack text-xl tracking-wider">
          Nueva Publicación
        </Text>
      </View>

      <View className="flex-row mx-6 mt-4 p-1 bg-surface-low rounded-xl">
        <TouchableOpacity
          className={`flex-1 py-3 items-center rounded-lg ${creationType === 'TEAM' ? 'bg-brand-primary shadow-lg' : ''}`}
          onPress={() => setCreationType('TEAM')}
          activeOpacity={0.8} // IMPORTANTE
        >
          <Text className={`font-uiBold text-xs ${creationType === 'TEAM' ? 'text-[#003914]' : 'text-neutral-on-surface-variant'}`}>
            Busco Jugador
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          className={`flex-1 py-3 items-center rounded-lg ${creationType === 'PLAYER' ? 'bg-brand-primary shadow-lg' : ''}`}
          onPress={() => setCreationType('PLAYER')}
          activeOpacity={0.8} // IMPORTANTE
        >
          <Text className={`font-uiBold text-xs ${creationType === 'PLAYER' ? 'text-[#003914]' : 'text-neutral-on-surface-variant'}`}>
            Busco Equipo / Partido
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView className="flex-1 px-6 pt-6" contentContainerStyle={{ paddingBottom: 100 }} showsVerticalScrollIndicator={false}>
        {creationType === 'TEAM' ? (
          <TeamPostForm managedTeams={managedTeams} isLoadingTeams={isLoadingTeams} onSuccess={onClose} showAlert={showAlert} />
        ) : (
          <PlayerPostForm onSuccess={onClose} showAlert={showAlert} />
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

// ESTE ES EL COMPONENTE QUE EXPO ROUTER LLAMA AUTOMÁTICAMENTE
export default function MarketCreateModal() {
  return <MarketCreateContent onClose={() => router.back()} />;
}

// ... EL RESTO DEL CÓDIGO (TeamPostForm y PlayerPostForm) QUEDA IGUAL AL QUE TENÍAMOS ...
function TeamPostForm({
  managedTeams,
  isLoadingTeams,
  onSuccess,
  showAlert,
}: {
  managedTeams: ManagedTeam[];
  isLoadingTeams: boolean;
  onSuccess: () => void;
  showAlert: (title: string, message: string) => void;
}) {
  const {
    control,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<CreateTeamPostInput>({
    resolver: zodResolver(createTeamPostSchema),
    defaultValues: { positionWanted: 'CUALQUIERA', description: '', teamId: undefined, matchDate: '', matchTime: '', zone: '' },
  });

  const [showZonePicker, setShowZonePicker] = useState(false);
  const currentZone = watch('zone');

  useEffect(() => {
    if (managedTeams.length === 1) {
      setValue('teamId', managedTeams[0].id);
    }
  }, [managedTeams, setValue]);

  const onSubmit = async (data: CreateTeamPostInput) => {
    try {
      await createTeamPost(data);
      showAlert('¡Éxito!', 'La publicación del equipo ha sido creada.');
      setTimeout(() => onSuccess(), 1500);
    } catch {
      showAlert('Error', 'Hubo un problema al crear la publicación.');
    }
  };

  if (isLoadingTeams) {
    return <ActivityIndicator size="large" color="#00E65B" className="mt-10" />;
  }

  if (managedTeams.length === 0) {
    return (
      <View className="bg-surface-high p-6 rounded-xl mt-4 border border-error/20">
        <Text className="text-error font-uiBold text-base mb-2 text-center">
          Acceso Restringido
        </Text>
        <Text className="text-neutral-on-surface-variant text-sm text-center">
          Debés ser Capitán o Subcapitán de un equipo para crear esta publicación.
        </Text>
      </View>
    );
  }

  return (
    <View>
      <View className="mb-6">
        <Text className="text-neutral-on-surface font-uiBold mb-2">Equipo</Text>
        {managedTeams.length === 1 ? (
          <View className="bg-surface-low p-4 rounded-xl border border-brand-primary/20">
            <Text className="text-neutral-on-surface font-uiMedium">{managedTeams[0].name}</Text>
          </View>
        ) : (
          <Controller
            control={control}
            name="teamId"
            render={({ field: { onChange, value } }) => (
              <View className="gap-2">
                {managedTeams.map((team) => (
                  <TouchableOpacity
                    key={team.id}
                    onPress={() => onChange(team.id)}
                    className={`p-4 rounded-xl border ${value === team.id ? 'bg-brand-primary/10 border-brand-primary' : 'bg-surface-low border-transparent'}`}
                    activeOpacity={0.7}
                  >
                    <Text
                      className={`font-uiMedium ${value === team.id ? 'text-brand-primary' : 'text-neutral-on-surface'}`}
                    >
                      {team.name}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          />
        )}
        {errors.teamId && (
          <Text className="text-error text-xs mt-1">{errors.teamId.message}</Text>
        )}
      </View>

      <View className="mb-6">
        <Text className="text-neutral-on-surface font-uiBold mb-2">Posición Buscada</Text>
        <Controller
          control={control}
          name="positionWanted"
          render={({ field: { onChange, value } }) => (
            <View>
              {/* @ts-ignore */}
              <PitchSelector value={value} onChange={onChange} />
              <TouchableOpacity
                className="mt-4 p-3 border border-brand-primary/30 rounded-lg items-center bg-surface-low"
                onPress={() => onChange('CUALQUIERA')}
                activeOpacity={0.7}
              >
                <Text className="text-brand-primary font-uiMedium text-sm">
                  Cualquier posición / Flexible
                </Text>
              </TouchableOpacity>
            </View>
          )}
        />
        {errors.positionWanted && (
          <Text className="text-error text-xs mt-1">{errors.positionWanted.message}</Text>
        )}
      </View>

      <View className="mb-6 p-4 bg-surface-low rounded-xl border border-surface-high">
        <Text className="text-neutral-on-surface font-uiBold mb-1">¿Es para un partido específico?</Text>
        <Text className="text-neutral-on-surface-variant font-ui text-xs mb-4">Completá estos datos si les falta 1 para jugar pronto. Dejalo en blanco si buscan fijo.</Text>

        <View className="flex-row gap-4 mb-4">
          <View className="flex-1">
            <Text className="text-neutral-on-surface font-uiMedium text-xs mb-1">Día (Ej: Hoy, Jueves)</Text>
            <Controller
              control={control}
              name="matchDate"
              render={({ field: { onChange, value } }) => (
                <TextInput
                  value={value}
                  onChangeText={onChange}
                  placeholder="Viernes"
                  placeholderTextColor="#88998D"
                  className="bg-surface-high p-3 rounded-lg text-neutral-on-surface font-ui"
                />
              )}
            />
          </View>
          <View className="flex-1">
            <Text className="text-neutral-on-surface font-uiMedium text-xs mb-1">Hora (Ej: 21:00)</Text>
            <Controller
              control={control}
              name="matchTime"
              render={({ field: { onChange, value } }) => (
                <TextInput
                  value={value}
                  onChangeText={onChange}
                  placeholder="20:30 hs"
                  placeholderTextColor="#88998D"
                  className="bg-surface-high p-3 rounded-lg text-neutral-on-surface font-ui"
                />
              )}
            />
          </View>
        </View>

        <View>
          <Text className="text-neutral-on-surface font-uiMedium text-xs mb-1">Zona</Text>
          <TouchableOpacity
            onPress={() => setShowZonePicker(true)}
            activeOpacity={0.7}
            className="flex-row items-center justify-between bg-surface-high p-3 rounded-lg"
          >
            <Text className={`font-ui ${currentZone ? 'text-neutral-on-surface' : 'text-[#88998D]'}`}>
              {currentZone || 'Seleccionar zona'}
            </Text>
            <AppIcon family="material-icons" name="arrow-drop-down" size={20} color="#88998D" />
          </TouchableOpacity>
        </View>
      </View>

      <View className="mb-8">
        <Text className="text-neutral-on-surface font-uiBold mb-2">Descripción (Opcional)</Text>
        <Controller
          control={control}
          name="description"
          render={({ field: { onChange, value } }) => (
            <TextInput
              value={value}
              onChangeText={onChange}
              multiline
              numberOfLines={4}
              placeholder="Ej: Buscamos arquero con experiencia para torneo los sábados..."
              placeholderTextColor="#88998D"
              className="bg-surface-low p-4 rounded-xl text-neutral-on-surface font-ui min-h-[100px]"
              textAlignVertical="top"
            />
          )}
        />
      </View>

      <HeroButton
        label="Crear Publicación"
        onPress={handleSubmit(onSubmit)}
        disabled={isSubmitting}
      />

      <ZonePickerDialog
        visible={showZonePicker}
        onClose={() => setShowZonePicker(false)}
        selectedZone={currentZone || ''}
        onSelect={(val) => setValue('zone', val)}
      />
    </View>
  );
}

function PlayerPostForm({
  onSuccess,
  showAlert,
}: {
  onSuccess: () => void;
  showAlert: (title: string, message: string) => void;
}) {
  const {
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<CreatePlayerPostInput>({
    resolver: zodResolver(createPlayerPostSchema),
    defaultValues: { postType: 'BUSCA_EQUIPO', position: 'CUALQUIERA', description: '' },
  });

  const onSubmit = async (data: CreatePlayerPostInput) => {
    try {
      await createPlayerPost(data);
      showAlert('¡Éxito!', 'Has publicado tu búsqueda correctamente.');
      setTimeout(() => onSuccess(), 1500);
    } catch {
      showAlert('Error', 'Hubo un problema al crear la publicación.');
    }
  };

  return (
    <View>
      <View className="mb-6">
        <Text className="text-neutral-on-surface font-uiBold mb-2">¿Qué estás buscando?</Text>
        <Controller
          control={control}
          name="postType"
          render={({ field: { onChange, value } }) => (
            <View className="flex-row gap-2">
              <TouchableOpacity
                onPress={() => onChange('BUSCA_EQUIPO')}
                activeOpacity={0.8}
                className={`flex-1 p-4 rounded-xl border items-center ${value === 'BUSCA_EQUIPO' ? 'bg-brand-primary/10 border-brand-primary' : 'bg-surface-low border-transparent'}`}
              >
                <Text
                  className={`font-uiMedium text-center ${value === 'BUSCA_EQUIPO' ? 'text-brand-primary' : 'text-neutral-on-surface'}`}
                >
                  Unirme a Equipo
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => onChange('BUSCA_PARTIDO')}
                activeOpacity={0.8}
                className={`flex-1 p-4 rounded-xl border items-center ${value === 'BUSCA_PARTIDO' ? 'bg-brand-primary/10 border-brand-primary' : 'bg-surface-low border-transparent'}`}
              >
                <Text
                  className={`font-uiMedium text-center ${value === 'BUSCA_PARTIDO' ? 'text-brand-primary' : 'text-neutral-on-surface'}`}
                >
                  Jugar un Partido
                </Text>
              </TouchableOpacity>
            </View>
          )}
        />
        {errors.postType && (
          <Text className="text-error text-xs mt-1">{errors.postType.message}</Text>
        )}
      </View>

      <View className="mb-6">
        <Text className="text-neutral-on-surface font-uiBold mb-2">Mi Posición</Text>
        <Controller
          control={control}
          name="position"
          render={({ field: { onChange, value } }) => (
            <View>
              {/* @ts-ignore */}
              <PitchSelector value={value} onChange={onChange} />
              <TouchableOpacity
                className="mt-4 p-3 border border-brand-primary/30 rounded-lg items-center bg-surface-low"
                onPress={() => onChange('CUALQUIERA')}
                activeOpacity={0.7}
              >
                <Text className="text-brand-primary font-uiMedium text-sm">
                  Soy Flexible / Cualquier posición
                </Text>
              </TouchableOpacity>
            </View>
          )}
        />
        {errors.position && (
          <Text className="text-error text-xs mt-1">{errors.position.message}</Text>
        )}
      </View>

      <View className="mb-8">
        <Text className="text-neutral-on-surface font-uiBold mb-2">Descripción (Opcional)</Text>
        <Controller
          control={control}
          name="description"
          render={({ field: { onChange, value } }) => (
            <TextInput
              value={value}
              onChangeText={onChange}
              multiline
              numberOfLines={4}
              placeholder="Ej: Juego de 5, tengo disponibilidad por la noche..."
              placeholderTextColor="#88998D"
              className="bg-surface-low p-4 rounded-xl text-neutral-on-surface font-ui min-h-[100px]"
              textAlignVertical="top"
            />
          )}
        />
      </View>

      <HeroButton
        label="Crear Publicación"
        onPress={handleSubmit(onSubmit)}
        disabled={isSubmitting}
      />
    </View>
  );
}