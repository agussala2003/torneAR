import { LinearGradient } from 'expo-linear-gradient';
import React from 'react';
import { Text, TouchableOpacity, TouchableOpacityProps, View } from 'react-native';

interface HeroButtonProps extends TouchableOpacityProps {
  label: string;
  onPress: () => void;
  isLoading?: boolean;
}

export function HeroButton({ label, onPress, isLoading, style, ...props }: HeroButtonProps) {
  return (
    <TouchableOpacity onPress={onPress} disabled={isLoading || props.disabled} activeOpacity={0.8} style={style} {...props}>
      <LinearGradient
        colors={['#53e076', '#1db954']} // primary to primary-container
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{ borderRadius: 12, overflow: 'hidden' }}
      >
        <View className="py-4 items-center justify-center">
          <Text className="font-display text-lg uppercase tracking-widest text-neutral-on-surface" style={{ color: '#003914' }}>
            {isLoading ? 'CARGANDO...' : label}
          </Text>
        </View>
      </LinearGradient>
    </TouchableOpacity>
  );
}
