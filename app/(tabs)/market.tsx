import { View, Text } from 'react-native';
import { GlobalHeader } from '@/components/GlobalHeader';

export default function MarketScreen() {
  return (
    <View className="flex-1 bg-surface-base">
      <GlobalHeader />
      <View className="flex-1 items-center justify-center px-6">
        <Text className="text-2xl font-black text-neutral-on-surface">Mercado</Text>
        <Text className="mt-2 text-neutral-on-surface-variant">Pantalla en construcción con nueva paleta TorneAR.</Text>
      </View>
    </View>
  );
}
