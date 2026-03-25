import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, FlatList, TouchableWithoutFeedback, ActivityIndicator, StyleSheet } from 'react-native';
import { supabase } from '@/lib/supabase';

interface ZonePickerDialogProps {
  visible: boolean;
  onClose: () => void;
  selectedZone: string;
  onSelect: (zone: string) => void;
}

const ZoneSeparator = () => <View className="h-2" />;

export function ZonePickerDialog({ visible, onClose, selectedZone, onSelect }: ZonePickerDialogProps) {
  const [zones, setZones] = useState<string[]>([]);
  const [loadingZones, setLoadingZones] = useState(true);

  useEffect(() => {
    async function fetchZones() {
      if (!visible) return;
      setLoadingZones(true);
      const { data, error } = await supabase.from('zones').select('name').eq('is_active', true);
      if (!error && data) {
        setZones(data.map((z) => z.name));
      } else {
        setZones(['Buenos Aires Centro', 'GBA Norte', 'GBA Sur', 'GBA Oeste']);
      }
      setLoadingZones(false);
    }

    if (visible && zones.length === 0) {
      void fetchZones();
    }
  }, [visible, zones.length]);

  // Si no está visible, retornamos null y no renderizamos nada en el árbol
  if (!visible) return null;

  return (
    <View style={[StyleSheet.absoluteFill, { zIndex: 9999, elevation: 99 }]} className="flex-1">
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
                  ItemSeparatorComponent={ZoneSeparator}
                  renderItem={({ item }) => (
                    <TouchableOpacity
                      activeOpacity={0.9}
                      onPress={() => {
                        onSelect(item);
                        onClose();
                      }}
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
    </View>
  );
}