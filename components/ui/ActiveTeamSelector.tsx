import React, { useState } from 'react';
import { View, Text, TouchableOpacity, FlatList } from 'react-native';
import { useTeamStore } from '@/stores/teamStore';
import { useAuth } from '@/context/AuthContext';
import { AppIcon } from '@/components/ui/AppIcon';
import { SafeAreaBottomSheet } from '@/components/ui/SafeAreaBottomSheet';
import { TeamShield } from '@/components/ui/TeamShield';

export function ActiveTeamSelector() {
  const { activeTeamId, activeTeamName, myTeams, setActiveTeam, fetchMyTeams } = useTeamStore();
  const { profile } = useAuth();
  const [modalVisible, setModalVisible] = useState(false);

  if (myTeams.length < 2) {
    return null; // Ocultar si tiene 0 o 1 solo equipo
  }

  /*
   * Revalidar al ABRIR es lo que cierra el caso exacto del reporte: al usuario
   * lo echaron de un equipo y el selector se lo seguía ofreciendo una y otra vez
   * (auditoría E2E, módulo 4.3). Acá el gesto del usuario es la señal.
   *
   * Es barato: `fetchMyTeams` conserva el array anterior si nada cambió, así que
   * abrir el selector cien veces no publica un solo estado nuevo. Y si el equipo
   * expulsado era el activo, el propio store pivotea al primero disponible —o a
   * vacío si se quedó sin club— antes de que la lista se pinte.
   */
  const handleOpen = () => {
    setModalVisible(true);
    if (profile?.id) void fetchMyTeams(profile.id);
  };

  const handleSelect = (id: string, name: string) => {
    setActiveTeam(id, name);
    setModalVisible(false);
  };

  return (
    <>
      {/* `shrink` en el chip y en el texto: en React Native `flexShrink` es 0 por
          defecto (al revés que en la web), así que sin esto el chip conserva su
          ancho de contenido y DESBORDA el header en vez de ceder. Se nota desde
          que el logo y los íconos crecieron: en una pantalla de 360dp, sobre la
          tab Ranking (dos íconos) y con un nombre de equipo largo, el sobrante
          empujaba a la campana fuera de la pantalla. Ahora el nombre se trunca,
          que es la degradación correcta. */}
      <TouchableOpacity
        activeOpacity={0.8}
        onPress={handleOpen}
        className="shrink flex-row items-center justify-center px-3 py-1.5 rounded-full bg-surface-high border border-neutral-outline-variant/15 gap-1.5"
      >
        <AppIcon family="material-community" name="shield-half-full" size={14} color="#BCCBB9" />
        <Text className="shrink font-display text-xs uppercase tracking-wider text-neutral-on-surface" numberOfLines={1} style={{ maxWidth: 100 }}>
          {activeTeamName || 'SELECCIONAR'}
        </Text>
        <AppIcon family="material-icons" name="keyboard-arrow-down" size={16} color="#BCCBB9" />
      </TouchableOpacity>

      {/* El `pb-12` fijo dejaba el último equipo de la lista pisado por la barra
          de navegación, y sin tope de alto la lista crecía sin poder scrollear. */}
      <SafeAreaBottomSheet
        visible={modalVisible}
        onClose={() => setModalVisible(false)}
        animationType="fade"
        maxHeight="80%"
        dismissOnBackdropPress
        surfaceClassName="border-t border-neutral-outline-variant/15 bg-surface-base"
      >
        {/* flexShrink explícito: en RN es 0 por defecto, así que sin esto el
            contenedor ignora el `maxHeight` del sheet y la lista se corta en
            vez de scrollear. */}
        <View className="px-6 pt-6" style={{ flexShrink: 1 }}>
          <View className="flex-row justify-between items-center mb-6">
            <Text className="font-displayBlack text-2xl uppercase tracking-tight text-neutral-on-surface">Cambiar Equipo</Text>
            <TouchableOpacity onPress={() => setModalVisible(false)} className="p-2">
              <AppIcon family="material-community" name="close" size={24} color="#BCCBB9" />
            </TouchableOpacity>
          </View>

          <FlatList
            data={myTeams}
            keyExtractor={item => item.id}
            ItemSeparatorComponent={() => <View className="h-3" />}
            showsVerticalScrollIndicator={false}
            /* El sheet aporta el inset del dispositivo, pero eso solo separa la
               superficie de la barra del sistema: con la lista scrolleada al
               fondo, la ultima tarjeta seguia quedando pegada al borde del
               sheet. Estos 16 son el aire DENTRO de la lista. */
            contentContainerStyle={{ paddingBottom: 16 }}
            renderItem={({ item }) => {
              const isActive = item.id === activeTeamId;
              return (
                <TouchableOpacity
                  activeOpacity={0.9}
                  onPress={() => handleSelect(item.id, item.name)}
                  className={`w-full flex-row items-center justify-between px-5 py-4 rounded-xl border ${isActive ? 'border-brand-primary bg-brand-primary/15' : 'border-neutral-outline-variant/15 bg-surface-low'}`}
                >
                  {/* `flex-1` + `min-w-0`: sin esto un nombre largo empuja al
                      check de la derecha fuera de la fila en vez de truncarse. */}
                  <View className="flex-1 min-w-0 flex-row items-center gap-3">
                    {/* Con `name`, los equipos sin escudo caen en sus iniciales
                        y no en un ícono genérico repetido fila por fila. */}
                    <TeamShield
                      shieldUrl={item.shieldUrl}
                      size={40}
                      isMyTeam={isActive}
                      name={item.name}
                    />
                    <View className="flex-1">
                      <Text
                        className={`font-display text-base uppercase tracking-wider ${isActive ? 'text-brand-primary' : 'text-neutral-on-surface'}`}
                        numberOfLines={1}
                      >
                        {item.name}
                      </Text>
                      <Text className="font-ui text-xs text-neutral-on-surface-variant capitalize">Rol: {item.role.toLowerCase()}</Text>
                    </View>
                  </View>
                  {isActive && (
                    <AppIcon family="material-community" name="check-circle" size={20} color="#53E076" />
                  )}
                </TouchableOpacity>
              );
            }}
          />
        </View>
      </SafeAreaBottomSheet>
    </>
  );
}
