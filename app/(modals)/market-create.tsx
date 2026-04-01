import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, TextInput, ScrollView, ActivityIndicator } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import DateTimePicker from '@react-native-community/datetimepicker';

import { AppIcon } from '@/components/ui/AppIcon';
import { HeroButton } from '@/components/ui/HeroButton';
import { PitchSelector } from '@/components/ui/PitchSelector';
import { ZonePickerDialog } from '@/components/ui/ZonePickerDialog';
import { ActiveTeamSelector } from '@/components/ui/ActiveTeamSelector';
import { useAuth } from '@/context/AuthContext';
import { useUI } from '@/context/UIContext';
import { useTeamStore } from '@/stores/teamStore';

import { createTeamPost, createPlayerPost, fetchUserManagedTeams, ManagedTeam } from '@/lib/market-api';
import { TEAM_FORMAT_OPTIONS, TeamFormat } from '@/lib/team-options';
import { fetchVenuesByZoneName, VenueEntry } from '@/lib/venue-data';

type PostType = 'BUSCA_EQUIPO' | 'BUSCA_PARTIDO';

export default function MarketCreateModal() {
  const { type } = useLocalSearchParams<{ type: string }>();
  const creationType = type === 'PLAYER' ? 'PLAYER' : 'TEAM';

  const { user, profile } = useAuth();
  const { showAlert, showLoader, hideLoader } = useUI();
  const { activeTeamId, fetchMyTeams } = useTeamStore();

  const [managedTeams, setManagedTeams] = useState<ManagedTeam[]>([]);
  const [isLoadingTeams, setIsLoadingTeams] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Compartidos
  const [position, setPosition] = useState<string>('CUALQUIERA');
  const [description, setDescription] = useState('');

  // Específicos de Equipo
  const [matchDate, setMatchDate] = useState<Date | null>(null);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [matchTime, setMatchTime] = useState<Date | null>(null);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [zone, setZone] = useState('');
  const [showZonePicker, setShowZonePicker] = useState(false);
  const [complex, setComplex] = useState('');
  const [venues, setVenues] = useState<VenueEntry[]>([]);
  const [selectedVenue, setSelectedVenue] = useState<VenueEntry | null>(null);
  const [loadingVenues, setLoadingVenues] = useState(false);
  const [pitchType, setPitchType] = useState<TeamFormat | null>(null);

  // Específicos de Jugador
  const [playerPostType, setPlayerPostType] = useState<PostType>('BUSCA_EQUIPO');

  useEffect(() => {
    if (!user) return;
    fetchUserManagedTeams(user.id)
      .then((teams) => {
        setManagedTeams(teams);
      })
      .catch((err) => console.error('Error fetching managed teams', err))
      .finally(() => setIsLoadingTeams(false));
  }, [user]);

  useEffect(() => {
    if (profile?.id) {
      void fetchMyTeams(profile.id);
    }
  }, [profile?.id, fetchMyTeams]);

  // Fetch venues when zone changes
  useEffect(() => {
    if (!zone) {
      setVenues([]);
      setSelectedVenue(null);
      setComplex('');
      return;
    }
    setLoadingVenues(true);
    setSelectedVenue(null);
    setComplex('');
    fetchVenuesByZoneName(zone)
      .then(setVenues)
      .catch(() => setVenues([]))
      .finally(() => setLoadingVenues(false));
  }, [zone]);

  // Keep `complex` string in sync with the selected venue (used by createTeamPost)
  useEffect(() => {
    if (selectedVenue) setComplex(selectedVenue.name);
  }, [selectedVenue]);

  const formatDate = (date: Date): string => {
    const dd = String(date.getDate()).padStart(2, '0');
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const yyyy = date.getFullYear();
    return `${dd}/${mm}/${yyyy}`;
  };

  const formatLocalIsoDate = (date: Date): string => {
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  };

  const handleSubmit = async () => {
    if (isSubmitting) return;

    setIsSubmitting(true);
    showLoader('Creando publicación...');
    try {
      if (creationType === 'TEAM') {
        const selectedTeamId = activeTeamId ?? managedTeams[0]?.id;
        const canPostWithSelectedTeam = !!selectedTeamId && managedTeams.some((team) => team.id === selectedTeamId);

        if (!canPostWithSelectedTeam || !selectedTeamId) {
          showAlert('Error', 'Seleccioná en el header un equipo donde seas Capitán o Subcapitán.');
          setIsSubmitting(false);
          hideLoader();
          return;
        }
        await createTeamPost({
          teamId: selectedTeamId,
          positionWanted: position as any,
          pitchType: pitchType ?? undefined,
          matchDate: matchDate ? formatLocalIsoDate(matchDate) : '',
          matchTime: matchTime ? matchTime.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false }) : '',
          zone,
          complex,
          description,
        });
        showAlert('¡Éxito!', 'La publicación del equipo ha sido creada.');
        router.back();
      } else {
        await createPlayerPost({
          postType: playerPostType,
          position: position as any,
          description
        });
        showAlert('¡Éxito!', 'Has publicado tu búsqueda correctamente.');
        router.back();
      }

    } catch {
      showAlert('Error', 'Hubo un problema al crear la publicación.');
    } finally {
      setIsSubmitting(false);
      hideLoader();
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-surface-base" edges={['top']}>
      {/* Header Dinámico */}
      <View className="px-6 py-4 flex-row items-center border-b border-surface-high bg-surface-base">
        <TouchableOpacity
          onPress={() => router.back()}
          className="mr-4"
          activeOpacity={0.7}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <AppIcon family="material-icons" name="arrow-back" size={24} color="#00E65B" />
        </TouchableOpacity>
        <View className="flex-1 flex-row items-center justify-between gap-2">
          <Text className="text-neutral-on-surface font-displayBlack text-xl tracking-wider">
            {creationType === 'TEAM' ? 'Buscar Jugador' : 'Buscar Equipo / Partido'}
          </Text>
          {creationType === 'TEAM' ? <ActiveTeamSelector /> : null}
        </View>
      </View>

      <ScrollView className="flex-1 px-6 pt-6" contentContainerStyle={{ paddingBottom: 100 }} showsVerticalScrollIndicator={false}>

        {/* --- CAMPOS EXCLUSIVOS DE EQUIPO --- */}
        {creationType === 'TEAM' && (
          <View>
            {isLoadingTeams ? (
              <ActivityIndicator size="large" color="#00E65B" className="mb-6" />
            ) : managedTeams.length === 0 ? (
              <View className="bg-surface-high p-6 rounded-xl mb-6 border border-error/20">
                <Text className="text-error font-uiBold text-base mb-2 text-center">Acceso Restringido</Text>
                <Text className="text-neutral-on-surface-variant text-sm text-center">
                  Debés ser Capitán o Subcapitán de un equipo para crear esta publicación.
                </Text>
              </View>
            ) : null}

            <View className="mb-6 p-4 bg-surface-low rounded-xl border border-surface-high">
              <Text className="text-neutral-on-surface font-uiBold mb-1">¿Es para un partido específico?</Text>
              <Text className="text-neutral-on-surface-variant font-ui text-xs mb-4">Completá estos datos si les falta 1 para jugar pronto. Dejalo en blanco si buscan fijo.</Text>

              <View className="mb-4">
                <Text className="text-neutral-on-surface font-uiMedium text-xs mb-1">Día</Text>
                <View className="flex-row items-center bg-surface-high rounded-lg overflow-hidden">
                  <TouchableOpacity
                    onPress={() => setShowDatePicker(true)}
                    activeOpacity={0.7}
                    className="flex-1 p-3"
                  >
                    <Text className={`font-ui ${matchDate ? 'text-neutral-on-surface' : 'text-[#88998D]'}`}>
                      {matchDate ? formatDate(matchDate) : 'Seleccionar fecha'}
                    </Text>
                  </TouchableOpacity>
                  {matchDate && (
                    <TouchableOpacity
                      onPress={() => setMatchDate(null)}
                      activeOpacity={0.7}
                      className="px-3 py-3"
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <AppIcon family="material-icons" name="close" size={16} color="#88998D" />
                    </TouchableOpacity>
                  )}
                </View>
              </View>

              <View className="mb-4">
                <Text className="text-neutral-on-surface font-uiMedium text-xs mb-1">Hora</Text>
                <View className="flex-row items-center bg-surface-high rounded-lg overflow-hidden">
                  <TouchableOpacity
                    onPress={() => setShowTimePicker(true)}
                    activeOpacity={0.7}
                    className="flex-1 p-3"
                  >
                    <Text className={`font-ui ${matchTime ? 'text-neutral-on-surface' : 'text-[#88998D]'}`}>
                      {matchTime
                        ? `${matchTime.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false })} hs`
                        : 'Seleccionar hora'}
                    </Text>
                  </TouchableOpacity>
                  {matchTime && (
                    <TouchableOpacity
                      onPress={() => setMatchTime(null)}
                      activeOpacity={0.7}
                      className="px-3 py-3"
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <AppIcon family="material-icons" name="close" size={16} color="#88998D" />
                    </TouchableOpacity>
                  )}
                </View>
              </View>

              <View>
                <Text className="text-neutral-on-surface font-uiMedium text-xs mb-1">Zona</Text>
                <TouchableOpacity
                  onPress={() => setShowZonePicker(true)}
                  activeOpacity={0.7}
                  className="flex-row items-center justify-between bg-surface-high p-3 rounded-lg"
                >
                  <Text className={`font-ui ${zone ? 'text-neutral-on-surface' : 'text-[#88998D]'}`}>
                    {zone || 'Seleccionar zona'}
                  </Text>
                  <AppIcon family="material-icons" name="arrow-drop-down" size={20} color="#88998D" />
                </TouchableOpacity>
              </View>

              <View className="mt-4">
                <Text className="text-neutral-on-surface font-uiMedium text-xs mb-1">Complejo (opcional)</Text>
                {zone ? (
                  loadingVenues ? (
                    <ActivityIndicator size="small" color="#53E076" style={{ alignSelf: 'flex-start', marginTop: 4 }} />
                  ) : venues.length === 0 ? (
                    <View className="bg-surface-high p-3 rounded-lg">
                      <Text className="font-ui text-sm text-[#88998D]">Sin complejos registrados en esta zona</Text>
                    </View>
                  ) : (
                    <View className="gap-2">
                      {venues.map((v) => (
                        <TouchableOpacity
                          key={v.id}
                          onPress={() => setSelectedVenue(selectedVenue?.id === v.id ? null : v)}
                          activeOpacity={0.8}
                          className={`rounded-xl p-3 ${selectedVenue?.id === v.id ? 'border border-brand-primary/40 bg-brand-primary/10' : 'bg-surface-high'}`}
                        >
                          <View className="flex-row items-center gap-3">
                            <View className={`h-5 w-5 items-center justify-center rounded-full border-2 ${selectedVenue?.id === v.id ? 'border-brand-primary' : 'border-neutral-outline'}`}>
                              {selectedVenue?.id === v.id && (
                                <View className="h-2.5 w-2.5 rounded-full bg-brand-primary" />
                              )}
                            </View>
                            <View className="flex-1">
                              <Text className="font-uiBold text-sm text-neutral-on-surface">{v.name}</Text>
                              {v.address && (
                                <Text className="font-ui text-xs text-neutral-on-surface-variant">{v.address}</Text>
                              )}
                            </View>
                          </View>
                        </TouchableOpacity>
                      ))}
                    </View>
                  )
                ) : (
                  <TextInput
                    value={complex}
                    onChangeText={setComplex}
                    placeholder="Ej: Complejo El Potrero"
                    placeholderTextColor="#88998D"
                    className="bg-surface-high p-3 rounded-lg text-neutral-on-surface font-ui"
                  />
                )}
              </View>

              <View className="mt-4">
                <Text className="text-neutral-on-surface font-uiMedium text-xs mb-2">Tipo de cancha (opcional)</Text>
                <View className="flex-row flex-wrap gap-2">
                  {TEAM_FORMAT_OPTIONS.map((item) => {
                    const active = pitchType === item.value;
                    return (
                      <TouchableOpacity
                        key={item.value}
                        onPress={() => setPitchType(active ? null : item.value)}
                        activeOpacity={0.75}
                        className={`px-4 py-2 rounded-full border ${active ? 'border-brand-primary bg-brand-primary/10' : 'border-surface-high bg-surface-high'}`}
                      >
                        <Text className={`font-uiBold text-xs ${active ? 'text-brand-primary' : 'text-neutral-on-surface-variant'}`}>
                          {item.label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            </View>
          </View>
        )}

        {/* --- CAMPOS EXCLUSIVOS DE JUGADOR --- */}
        {creationType === 'PLAYER' && (
          <View className="mb-6">
            <Text className="text-neutral-on-surface font-uiBold mb-2">¿Qué estás buscando?</Text>
            <View className="flex-row gap-2">
              <TouchableOpacity
                onPress={() => setPlayerPostType('BUSCA_EQUIPO')}
                activeOpacity={0.8}
                className={`flex-1 p-4 rounded-xl border items-center ${playerPostType === 'BUSCA_EQUIPO' ? 'bg-brand-primary/10 border-brand-primary' : 'bg-surface-low border-transparent'}`}
              >
                <Text className={`font-uiMedium text-center ${playerPostType === 'BUSCA_EQUIPO' ? 'text-brand-primary' : 'text-neutral-on-surface'}`}>
                  Unirme a Equipo
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setPlayerPostType('BUSCA_PARTIDO')}
                activeOpacity={0.8}
                className={`flex-1 p-4 rounded-xl border items-center ${playerPostType === 'BUSCA_PARTIDO' ? 'bg-brand-primary/10 border-brand-primary' : 'bg-surface-low border-transparent'}`}
              >
                <Text className={`font-uiMedium text-center ${playerPostType === 'BUSCA_PARTIDO' ? 'text-brand-primary' : 'text-neutral-on-surface'}`}>
                  Jugar un Partido
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* --- CAMPOS COMPARTIDOS --- */}
        <View className="mb-6">
          <Text className="text-neutral-on-surface font-uiBold mb-2">
            {creationType === 'TEAM' ? 'Posición Buscada' : 'Mi Posición'}
          </Text>
          {/* @ts-ignore */}
          <PitchSelector value={position} onChange={(val) => setPosition(val)} />
          <TouchableOpacity
            className="mt-4 p-3 border border-brand-primary/30 rounded-lg items-center bg-surface-low"
            onPress={() => setPosition('CUALQUIERA')}
            activeOpacity={0.7}
          >
            <Text className="text-brand-primary font-uiMedium text-sm">
              {creationType === 'TEAM' ? 'Cualquier posición / Flexible' : 'Soy Flexible / Cualquier posición'}
            </Text>
          </TouchableOpacity>
        </View>

        <View className="mb-8">
          <Text className="text-neutral-on-surface font-uiBold mb-2">Descripción (Opcional)</Text>
          <TextInput
            value={description}
            onChangeText={setDescription}
            multiline
            numberOfLines={4}
            placeholder={creationType === 'TEAM' ? "Ej: Buscamos arquero con experiencia para torneo los sábados..." : "Ej: Juego de 5, tengo disponibilidad por la noche..."}
            placeholderTextColor="#88998D"
            className="bg-surface-low p-4 rounded-xl text-neutral-on-surface font-ui min-h-[100px]"
            textAlignVertical="top"
          />
        </View>

        <HeroButton
          label="Crear Publicación"
          onPress={handleSubmit}
          disabled={isSubmitting || (creationType === 'TEAM' && managedTeams.length === 0)}
        />

      </ScrollView>

      <ZonePickerDialog
        visible={showZonePicker}
        onClose={() => setShowZonePicker(false)}
        selectedZone={zone}
        onSelect={(val) => setZone(val)}
      />

      {showDatePicker && (
        <DateTimePicker
          value={matchDate ?? new Date()}
          mode="date"
          display="default"
          minimumDate={new Date()}
          locale="es-AR"
          onChange={(event, date) => {
            setShowDatePicker(false);
            if (event.type !== 'dismissed' && date) setMatchDate(date);
          }}
        />
      )}

      {showTimePicker && (
        <DateTimePicker
          value={matchTime ?? new Date()}
          mode="time"
          display="default"
          onChange={(event, date) => {
            setShowTimePicker(false);
            if (event.type !== 'dismissed' && date) setMatchTime(date);
          }}
        />
      )}
    </SafeAreaView>
  );
}
