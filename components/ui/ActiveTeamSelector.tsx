import React, { useState } from 'react';
import { View, Text, TouchableOpacity, FlatList } from 'react-native';
import { useTeamStore } from '@/stores/teamStore';
import { AppIcon } from '@/components/ui/AppIcon';
import { SafeAreaBottomSheet } from '@/components/ui/SafeAreaBottomSheet';

export function ActiveTeamSelector() {
  const { activeTeamId, activeTeamName, myTeams, setActiveTeam } = useTeamStore();
  const [modalVisible, setModalVisible] = useState(false);

  if (myTeams.length < 2) {
    return null; // Ocultar si tiene 0 o 1 solo equipo
  }

  const handleSelect = (id: string, name: string) => {
    setActiveTeam(id, name);
    setModalVisible(false);
  };

  return (
    <>
      <TouchableOpacity
        activeOpacity={0.8}
        onPress={() => setModalVisible(true)}
        className="flex-row items-center justify-center px-3 py-1.5 rounded-full bg-surface-high border border-neutral-outline-variant/15 gap-1.5"
      >
        <AppIcon family="material-community" name="shield-half-full" size={14} color="#BCCBB9" />
        <Text className="font-display text-xs uppercase tracking-wider text-neutral-on-surface" numberOfLines={1} style={{ maxWidth: 100 }}>
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
            renderItem={({ item }) => {
              const isActive = item.id === activeTeamId;
              return (
                <TouchableOpacity
                  activeOpacity={0.9}
                  onPress={() => handleSelect(item.id, item.name)}
                  className={`w-full flex-row items-center justify-between px-5 py-4 rounded-xl border ${isActive ? 'border-brand-primary bg-brand-primary/15' : 'border-neutral-outline-variant/15 bg-surface-low'}`}
                >
                  <View className="flex-row items-center gap-3">
                    <AppIcon family="material-community" name="shield" size={24} color={isActive ? '#53E076' : '#BCCBB9'} />
                    <View>
                      <Text className={`font-display text-base uppercase tracking-wider ${isActive ? 'text-brand-primary' : 'text-neutral-on-surface'}`}>
                        {item.name}
                      </Text>
                      <Text className="font-ui text-xs text-neutral-on-surface-variant capitalize">Rol: {item.role.toLowerCase()}</Text>
                    </View>
                  </View>
                  {isActive && <AppIcon family="material-community" name="check-circle" size={20} color="#53E076" />}
                </TouchableOpacity>
              );
            }}
          />
        </View>
      </SafeAreaBottomSheet>
    </>
  );
}
