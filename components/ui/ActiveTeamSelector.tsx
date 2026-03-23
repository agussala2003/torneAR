import React, { useState } from 'react';
import { View, Text, TouchableOpacity, Modal, FlatList, TouchableWithoutFeedback } from 'react-native';
import { useTeamStore } from '@/stores/teamStore';
import { AppIcon } from '@/components/ui/AppIcon';

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

      <Modal visible={modalVisible} transparent animationType="fade" onRequestClose={() => setModalVisible(false)}>
        <TouchableWithoutFeedback onPress={() => setModalVisible(false)}>
          <View className="flex-1 items-center justify-end bg-black/80">
            <TouchableWithoutFeedback>
              <View className="w-full rounded-t-3xl border-t border-neutral-outline-variant/15 bg-surface-base p-6 pb-12">
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
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
    </>
  );
}
