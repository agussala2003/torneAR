import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import React from 'react';
import { Text, TouchableOpacity, TouchableOpacityProps, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';

interface HeroButtonProps extends TouchableOpacityProps {
  label: string;
  onPress: () => void;
  isLoading?: boolean;
}

export function HeroButton({ label, onPress, isLoading, style, ...props }: HeroButtonProps) {
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePressIn = () => {
    scale.value = withSpring(0.96, { damping: 15, stiffness: 300 });
  };

  const handlePressOut = () => {
    scale.value = withSpring(1, { damping: 15, stiffness: 300 });
  };

  const handlePress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onPress();
  };

  return (
    <Animated.View style={[animatedStyle, style]}>
      <TouchableOpacity
        onPress={handlePress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        disabled={isLoading || props.disabled}
        activeOpacity={1}
        {...props}
      >
        <LinearGradient
          colors={['#53e076', '#1db954']}
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
    </Animated.View>
  );
}
