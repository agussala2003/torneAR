import { useEffect, useState } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ActivityIndicator, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { AppIcon } from '@/components/ui/AppIcon';
import { useAuth } from '@/context/AuthContext';
import { useTeamStore } from '@/stores/teamStore';
import { getGenericSupabaseErrorMessage } from '@/lib/auth-error-messages';
import { TEAM_CATEGORY_OPTIONS, TEAM_FORMAT_OPTIONS, TeamCategory, TeamFormat } from '@/lib/team-options';
import { fetchZones, createTeam } from '@/lib/team-create-data';
import { ZonePickerModal } from '@/components/team-create/ZonePickerModal';
import { useCustomAlert } from '@/hooks/useCustomAlert';

export default function TeamCreateScreen() {
  const router = useRouter();
  const { profile } = useAuth();
  const { fetchMyTeams } = useTeamStore();
  const { showAlert, AlertComponent } = useCustomAlert();

  const [name, setName] = useState('');
  const [zone, setZone] = useState(profile?.zone ?? '');
  const [category, setCategory] = useState<TeamCategory>('MIXTO');
  const [format, setFormat] = useState<TeamFormat>('FUTBOL_7');
  const [zones, setZones] = useState<string[]>([]);
  const [loadingZones, setLoadingZones] = useState(true);
  const [showZonePicker, setShowZonePicker] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    async function loadZones() {
      try {
        setLoadingZones(true);
        const data = await fetchZones();
        setZones(data);
      } catch {
        setZones(profile?.zone ? [profile.zone] : []);
      } finally {
        setLoadingZones(false);
      }
    }
    void loadZones();
  }, [profile?.zone]);

  const handleCreateTeam = async () => {
    if (!profile) {
      showAlert('Perfil no disponible', 'Necesitas completar tu perfil para crear un equipo.');
      return;
    }

    const sanitizedName = name.trim();
    const sanitizedZone = zone.trim();

    if (sanitizedName.length < 3) {
      showAlert('Nombre invalido', 'El nombre del equipo debe tener al menos 3 caracteres.');
      return;
    }
    if (!sanitizedZone) {
      showAlert('Zona requerida', 'Ingresa una zona para el equipo.');
      return;
    }

    try {
      setIsSubmitting(true);
      const teamData = await createTeam(profile.id, sanitizedName, sanitizedZone, category, format);
      
      showAlert('Equipo creado', `Tu equipo ${teamData.name} ya esta listo.`, async () => {
        if (profile?.id) {
          await fetchMyTeams(profile.id);
        }
        router.replace({ pathname: '/team-manage', params: { teamId: teamData.id } });
      });
    } catch (error: unknown) {
      const fallbackMessage = (error as { code?: string }).code === '42501'
        ? 'No tienes permisos para crear equipos. Revisa las politicas de RLS para teams y team_members.'
        : 'No se pudo crear el equipo. Intentalo nuevamente.';
      showAlert('Error al crear equipo', getGenericSupabaseErrorMessage(error, fallbackMessage));
    } finally {
      setIsSubmitting(false);
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
        <Text className="font-displayBlack text-3xl uppercase tracking-tight text-neutral-on-surface">Crear equipo</Text>
        <Text className="font-ui mt-1 text-sm text-neutral-on-surface-variant">Defini la identidad de tu equipo y empeza a competir.</Text>

        <View className="mt-8 gap-5">
          <View>
            <Text className="font-display mb-2 text-xs uppercase tracking-wider text-neutral-on-surface-variant">Nombre del equipo</Text>
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="Ej: Barrio FC"
              placeholderTextColor="#5E5A58"
              className="rounded-xl border border-neutral-outline-variant/15 bg-surface-low px-4 py-4 text-neutral-on-surface"
              maxLength={36}
            />
          </View>

          <View>
            <Text className="font-display mb-2 text-xs uppercase tracking-wider text-neutral-on-surface-variant">Zona</Text>
            <TouchableOpacity
              onPress={() => setShowZonePicker(true)}
              activeOpacity={0.9}
              className="rounded-xl border border-neutral-outline-variant/15 bg-surface-low px-4 py-4"
            >
              <View className="flex-row items-center justify-between">
                <Text className={zone ? 'text-neutral-on-surface' : 'text-surface-bright'}>{zone || 'Selecciona una zona'}</Text>
                {loadingZones ? (
                  <ActivityIndicator size="small" color="#53E076" />
                ) : (
                  <AppIcon family="material-icons" name="keyboard-arrow-down" size={22} color="#BCCBB9" />
                )}
              </View>
            </TouchableOpacity>
          </View>

          <View>
            <Text className="font-display mb-2 text-xs uppercase tracking-wider text-neutral-on-surface-variant">Categoria</Text>
            <View className="flex-row flex-wrap gap-2">
              {TEAM_CATEGORY_OPTIONS.map((option) => {
                const active = category === option.value;
                return (
                  <TouchableOpacity
                    key={option.value}
                    onPress={() => setCategory(option.value)}
                    activeOpacity={0.9}
                    className={`rounded-lg border px-4 py-2 ${active ? 'border-brand-primary bg-brand-primary/20' : 'border-neutral-outline-variant/15 bg-surface-low'}`}
                  >
                    <Text className={`font-display text-xs uppercase tracking-wide ${active ? 'text-brand-primary' : 'text-neutral-on-surface-variant'}`}>{option.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          <View>
            <Text className="font-display mb-2 text-xs uppercase tracking-wider text-neutral-on-surface-variant">Formato principal</Text>
            <View className="flex-row flex-wrap gap-2">
              {TEAM_FORMAT_OPTIONS.map((option) => {
                const active = format === option.value;
                return (
                  <TouchableOpacity
                    key={option.value}
                    onPress={() => setFormat(option.value)}
                    activeOpacity={0.9}
                    className={`rounded-lg border px-4 py-2 ${active ? 'border-info-secondary bg-info-secondary/15' : 'border-neutral-outline-variant/15 bg-surface-low'}`}
                  >
                    <Text className={`font-display text-xs uppercase tracking-wide ${active ? 'text-info-secondary' : 'text-neutral-on-surface-variant'}`}>{option.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        </View>

        <TouchableOpacity
          disabled={isSubmitting}
          onPress={handleCreateTeam}
          activeOpacity={0.9}
          className={`mt-8 flex-row items-center justify-center rounded-xl py-4 ${isSubmitting ? 'bg-brand-primary/45' : 'bg-brand-primary'}`}
        >
          {isSubmitting ? (
            <ActivityIndicator size="small" color="#003914" />
          ) : (
            <>
              <AppIcon family="material-community" name="shield-plus" size={18} color="#003914" />
              <Text className="font-display ml-2 text-base uppercase tracking-wider text-[#003914]">Crear equipo</Text>
            </>
          )}
        </TouchableOpacity>
      </ScrollView>

      <ZonePickerModal
        visible={showZonePicker}
        zones={zones}
        loadingZones={loadingZones}
        selectedZone={zone}
        onSelectZone={(selected) => { setZone(selected); setShowZonePicker(false); }}
        onClose={() => setShowZonePicker(false)}
      />

      {AlertComponent}
    </SafeAreaView>
  );
}