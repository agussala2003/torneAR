import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  TouchableWithoutFeedback,
  StyleSheet,
} from 'react-native';

interface OptionPickerDialogProps {
  visible: boolean;
  title: string;
  options: readonly string[];
  selected?: string;
  onClose: () => void;
  onSelect: (value: string) => void;
  emptyLabel?: string;
}

const OptionSeparator = () => <View className="h-2" />;

/**
 * Select generico sobre un catalogo estatico de strings.
 *
 * Comparte el lenguaje visual de ZonePickerDialog (overlay absoluto, card
 * centrada, item seleccionado en verde), pero sin acoplarse a una fuente de
 * datos: ZonePickerDialog hace fetch de zonas, este recibe las opciones por
 * prop. Se usa para el cuadro favorito y sirve para cualquier catalogo cerrado
 * que venga despues.
 */
export function OptionPickerDialog({
  visible,
  title,
  options,
  selected,
  onClose,
  onSelect,
  emptyLabel = 'No hay opciones disponibles.',
}: OptionPickerDialogProps) {
  // Igual que ZonePickerDialog: no montamos nada en el arbol si esta cerrado.
  if (!visible) return null;

  return (
    <View style={[StyleSheet.absoluteFill, { zIndex: 9999, elevation: 99 }]} className="flex-1">
      <TouchableWithoutFeedback onPress={onClose}>
        <View className="flex-1 items-center justify-center bg-black/80 px-6">
          <TouchableWithoutFeedback>
            <View className="w-full max-w-sm rounded-2xl border border-neutral-outline-variant/15 bg-surface-high p-4">
              <Text className="font-display mb-3 text-lg text-neutral-on-surface">{title}</Text>

              <FlatList
                data={options as string[]}
                keyExtractor={(item) => item}
                style={{ maxHeight: 320 }}
                ItemSeparatorComponent={OptionSeparator}
                keyboardShouldPersistTaps="handled"
                renderItem={({ item }) => (
                  <TouchableOpacity
                    activeOpacity={0.9}
                    onPress={() => {
                      onSelect(item);
                      onClose();
                    }}
                    className={`rounded-lg border px-3 py-3 ${
                      selected === item
                        ? 'border-brand-primary bg-brand-primary/15'
                        : 'border-neutral-outline-variant/15 bg-surface-low'
                    }`}
                  >
                    <Text
                      className={`font-ui ${
                        selected === item ? 'text-brand-primary' : 'text-neutral-on-surface'
                      }`}
                      numberOfLines={1}
                      ellipsizeMode="tail"
                    >
                      {item}
                    </Text>
                  </TouchableOpacity>
                )}
                ListEmptyComponent={() => (
                  <Text className="py-2 text-sm text-neutral-on-surface-variant">{emptyLabel}</Text>
                )}
              />

              <TouchableOpacity
                onPress={onClose}
                activeOpacity={0.9}
                className="mt-4 items-center rounded-lg bg-surface-low py-3"
              >
                <Text className="font-display text-xs uppercase tracking-wider text-neutral-on-surface-variant">
                  Cerrar
                </Text>
              </TouchableOpacity>
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </View>
  );
}
