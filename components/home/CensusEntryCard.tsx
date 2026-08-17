import { View, Text, TouchableOpacity } from 'react-native';
import { AppIcon } from '@/components/ui/AppIcon';

interface Props {
  onPress: () => void;
}

/**
 * Entrada al Censo desde el Inicio.
 *
 * Va como tarjeta ancha y no como una cuarta "acción rápida": las tres de esa
 * fila son tareas del usuario (desafiar, buscar, gestionar) y el censo es
 * contenido para mirar. Meterlo ahí lo dejaba además con una etiqueta de dos
 * líneas ilegible en el ancho de un cuarto de pantalla.
 */
export function CensusEntryCard({ onPress }: Props) {
  return (
    <TouchableOpacity
      activeOpacity={0.8}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="Abrir el censo del fútbol argentino"
      className="mb-5 flex-row items-center gap-3 rounded-2xl border border-info-secondary/20 bg-surface-container p-4"
    >
      <View className="h-12 w-12 items-center justify-center rounded-full bg-brand-primary/15">
        <AppIcon family="material-community" name="chart-donut" size={24} color="#53E076" />
      </View>

      <View className="flex-1">
        <Text className="font-displayBlack text-base uppercase tracking-wide text-neutral-on-surface">
          Censo del fútbol argentino
        </Text>
        <Text className="font-ui mt-0.5 text-xs leading-4 text-neutral-on-surface-variant">
          Mirá de qué cuadro es la comunidad de torneAR
        </Text>
      </View>

      <AppIcon family="material-community" name="chevron-right" size={22} color="#8CCDFF" />
    </TouchableOpacity>
  );
}
