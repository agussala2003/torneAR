import { useEffect, useState } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ActivityIndicator, FlatList, Modal, ScrollView, Text, TextInput, TouchableOpacity, TouchableWithoutFeedback, View } from 'react-native';
import { useRouter } from 'expo-router';
import CustomAlert from '@/components/ui/CustomAlert';
import { AppIcon } from '@/components/ui/AppIcon';
import { useAuth } from '@/context/AuthContext';
import { getGenericSupabaseErrorMessage } from '@/lib/auth-error-messages';
import { supabase } from '@/lib/supabase';
import { TEAM_CATEGORY_OPTIONS, TEAM_FORMAT_OPTIONS, TeamCategory, TeamFormat } from '@/lib/team-options';

export default function TeamCreateScreen() {
  const router = useRouter();
  const { profile } = useAuth();

  const [name, setName] = useState('');
  const [zone, setZone] = useState(profile?.zone ?? '');
  const [category, setCategory] = useState<TeamCategory>('MIXTO');
  const [format, setFormat] = useState<TeamFormat>('FUTBOL_7');
  const [zones, setZones] = useState<string[]>([]);
  const [loadingZones, setLoadingZones] = useState(true);
  const [showZonePicker, setShowZonePicker] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [createdTeamId, setCreatedTeamId] = useState<string | null>(null);

  const [alertVisible, setAlertVisible] = useState(false);
  const [alertTitle, setAlertTitle] = useState('');
  const [alertMessage, setAlertMessage] = useState('');

  const showAlert = (title: string, message: string) => {
    setAlertTitle(title);
    setAlertMessage(message);
    setAlertVisible(true);
  };

  useEffect(() => {
    async function fetchZones() {
      try {
        setLoadingZones(true);

        const { data, error } = await supabase
          .from('zones')
          .select('name')
          .eq('is_active', true)
          .order('name', { ascending: true });

        if (error) {
          throw error;
        }

        setZones((data ?? []).map((zoneRow) => zoneRow.name));
      } catch {
        // Si falla la consulta, permitimos continuar con zona de perfil o ingreso manual no editable.
        setZones(profile?.zone ? [profile.zone] : []);
      } finally {
        setLoadingZones(false);
      }
    }

    void fetchZones();
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

      const { data: teamData, error: teamError } = await supabase
        .from('teams')
        .insert({
          name: sanitizedName,
          zone: sanitizedZone,
          category,
          preferred_format: format,
        })
        .select('id, name')
        .single();

      if (teamError) {
        throw teamError;
      }

      const { error: memberError } = await supabase
        .from('team_members')
        .insert({
          team_id: teamData.id,
          profile_id: profile.id,
          role: 'CAPITAN',
        });

      if (memberError) {
        throw memberError;
      }

      setCreatedTeamId(teamData.id);
      showAlert('Equipo creado', `Tu equipo ${teamData.name} ya esta listo.`);
    } catch (error: unknown) {
      const fallbackMessage =
        (error as { code?: string }).code === '42501'
          ? 'No tienes permisos para crear equipos. Revisa las politicas de RLS para teams y team_members.'
          : 'No se pudo crear el equipo. Intentalo nuevamente.';

      showAlert('Error al crear equipo', getGenericSupabaseErrorMessage(error, fallbackMessage));
    } finally {
      setIsSubmitting(false);
    }
  };

  const onCloseAlert = () => {
    setAlertVisible(false);
    if (createdTeamId) {
      router.replace({ pathname: '/team-manage', params: { teamId: createdTeamId } });
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
                    <Text className={`font-display text-xs uppercase tracking-wide ${active ? 'text-brand-primary' : 'text-neutral-on-surface-variant'}`}>
                      {option.label}
                    </Text>
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
                    <Text className={`font-display text-xs uppercase tracking-wide ${active ? 'text-info-secondary' : 'text-neutral-on-surface-variant'}`}>
                      {option.label}
                    </Text>
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

      <Modal
        transparent
        animationType="fade"
        visible={showZonePicker}
        onRequestClose={() => setShowZonePicker(false)}
      >
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
                          setZone(item);
                          setShowZonePicker(false);
                        }}
                        className={`rounded-lg border px-3 py-3 ${zone === item ? 'border-brand-primary bg-brand-primary/15' : 'border-neutral-outline-variant/15 bg-surface-low'}`}
                      >
                        <Text className={`font-ui ${zone === item ? 'text-brand-primary' : 'text-neutral-on-surface'}`}>{item}</Text>
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

      <CustomAlert visible={alertVisible} title={alertTitle} message={alertMessage} onClose={onCloseAlert} />
    </SafeAreaView>
  );
}