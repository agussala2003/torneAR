import LottieView from 'lottie-react-native';
import { View, Text } from 'react-native';

export function AppIntroSplash() {
  return (
    <View className="flex-1 items-center justify-center bg-surface-base px-6">
      <View className="h-48 w-48 items-center justify-center">
        <LottieView
          autoPlay
          loop={false}
          style={{ width: '100%', height: '100%' }}
          source={require('../assets/animations/trophy.json')}
        />
      </View>

      <Text className="mt-4 text-4xl font-black italic tracking-tighter text-brand-primary">TorneAR</Text>
      <Text className="mt-2 text-sm uppercase tracking-[0.25em] text-neutral-on-surface-variant">
        Cargando experiencia
      </Text>
    </View>
  );
}
