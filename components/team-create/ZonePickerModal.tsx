import React from 'react';
import { View, Text, TouchableOpacity, TouchableWithoutFeedback, Modal, FlatList, ActivityIndicator } from 'react-native';

interface ZonePickerModalProps {
  visible: boolean;
  zones: string[];
  loadingZones: boolean;
  selectedZone: string;
  onSelectZone: (zone: string) => void;
  onClose: () => void;
}

export function ZonePickerModal({
  visible,
  zones,
  loadingZones,
  selectedZone,
  onSelectZone,
  onClose,
}: ZonePickerModalProps) {
  return (
    <Modal
      transparent
      animationType="fade"
      visible={visible}
      onRequestClose={onClose}
    >
      <TouchableWithoutFeedback onPress={onClose}>
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
                      onPress={() => onSelectZone(item)}
                      className={`rounded-lg border px-3 py-3 ${selectedZone === item ? 'border-brand-primary bg-brand-primary/15' : 'border-neutral-outline-variant/15 bg-surface-low'}`}
                    >
                      <Text className={`font-ui ${selectedZone === item ? 'text-brand-primary' : 'text-neutral-on-surface'}`}>{item}</Text>
                    </TouchableOpacity>
                  )}
                  ListEmptyComponent={() => (
                    <Text className="py-2 text-sm text-neutral-on-surface-variant">No hay zonas activas disponibles.</Text>
                  )}
                />
              )}

              <TouchableOpacity
                onPress={onClose}
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
  );
}
