import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { AppIcon } from '@/components/ui/AppIcon';

type Position = 'CUALQUIERA' | 'ARQUERO' | 'DEFENSOR' | 'MEDIOCAMPISTA' | 'DELANTERO';

interface PitchSelectorProps {
  value: string;
  onChange: (val: Position) => void;
}

export const PitchSelector = ({ value, onChange }: PitchSelectorProps) => {
  const positions: { id: Position; label: string }[] = [
    { id: 'DELANTERO', label: 'DELANTERO' },
    { id: 'MEDIOCAMPISTA', label: 'MEDIOCAMPISTA' },
    { id: 'DEFENSOR', label: 'DEFENSOR' },
    { id: 'ARQUERO', label: 'ARQUERO' },
  ];

  return (
    <View className="w-full aspect-[2/3.2] max-w-[340px] mx-auto bg-surface-lowest border-2 border-neutral-outline-variant/15 rounded-2xl relative overflow-hidden flex-col mb-6 shadow-xl">
      {/* Líneas de la cancha (Fondo) */}
      <View className="absolute inset-0 z-0 pointer-events-none">
        {/* Línea central */}
        <View className="absolute top-1/2 left-0 right-0 h-[2px] bg-neutral-outline-variant/15 -translate-y-1/2" />
        {/* Círculo central */}
        <View className="absolute top-1/2 left-1/2 w-24 h-24 rounded-full border-[2px] border-neutral-outline-variant/15 -translate-x-1/2 -translate-y-1/2" />
        {/* Punto central */}
        <View className="absolute top-1/2 left-1/2 w-1.5 h-1.5 rounded-full bg-neutral-outline-variant/15 -translate-x-1/2 -translate-y-1/2" />

        {/* Área superior */}
        <View className="absolute top-0 left-1/2 w-40 h-16 border-b-[2px] border-x-[2px] border-neutral-outline-variant/15 -translate-x-1/2" />
        <View className="absolute top-0 left-1/2 w-16 h-6 border-b-[2px] border-x-[2px] border-neutral-outline-variant/15 -translate-x-1/2" />
        {/* Luna superior */}
        <View className="absolute top-16 left-1/2 w-16 h-6 border-b-[2px] border-x-[2px] border-t-0 border-neutral-outline-variant/15 rounded-bl-full rounded-br-full -translate-x-1/2" />

        {/* Área inferior */}
        <View className="absolute bottom-0 left-1/2 w-40 h-16 border-t-[2px] border-x-[2px] border-neutral-outline-variant/15 -translate-x-1/2" />
        <View className="absolute bottom-0 left-1/2 w-16 h-6 border-t-[2px] border-x-[2px] border-neutral-outline-variant/15 -translate-x-1/2" />
        {/* Luna inferior */}
        <View className="absolute bottom-16 left-1/2 w-16 h-6 border-t-[2px] border-x-[2px] border-b-0 border-neutral-outline-variant/15 rounded-tl-full rounded-tr-full -translate-x-1/2" />
      </View>

      {/* Zonas Clickables */}
      {positions.map((pos) => {
        const isSelected = value === pos.id;
        return (
          <TouchableOpacity
            key={pos.id}
            activeOpacity={0.9}
            onPress={() => onChange(pos.id)}
            className="flex-1 justify-center items-center z-10 border-b border-neutral-outline-variant/30 last:border-b-0"
          >
            {/* Fondo Verde si está seleccionado */}
            {isSelected && (
              <View className="absolute inset-0 bg-brand-primary/95" />
            )}

            {/* Pill de Texto */}
            <View className={`flex-row items-center justify-center px-6 py-2.5 rounded-full border ${isSelected ? 'bg-brand-primary border-[#003914]' : 'bg-surface-base/90 border-neutral-outline-variant/15'}`}>
              {isSelected && <AppIcon family="material-community" name="check" size={18} color="#003914" />}
              <Text className={`font-displayBlack text-sm uppercase tracking-widest ${isSelected ? 'text-[#003914]' : 'text-neutral-on-surface-variant'}`}>
                {pos.label}
              </Text>
            </View>
          </TouchableOpacity>
        );
      })}
    </View>
  );
};
