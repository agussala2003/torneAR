import LottieView from 'lottie-react-native';
import { View, Text } from 'react-native';

type GlobalLoaderProps = {
  label?: string;
};

export function GlobalLoader({ label = 'Cargando...' }: GlobalLoaderProps) {
  return (
    <View className="absolute inset-0 z-50 items-center justify-center bg-surface-base/95 px-6">
      <View className="h-28 w-28 items-center justify-center">
        <LottieView
          autoPlay
          loop
          style={{ width: '100%', height: '100%' }}
          source={require('../assets/animations/soccer-loader.json')}
        />
      </View>
      <Text className="mt-4 text-sm font-bold uppercase tracking-[0.22em] text-neutral-on-surface-variant">
        {label}
      </Text>
    </View>
  );
}
