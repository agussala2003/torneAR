import { View, Text } from 'react-native';
import { GlobalHeader } from '@/components/GlobalHeader';

export default function MarketScreen() {
  return (
    <View className="flex-1 bg-surface-base">
      <GlobalHeader />
      <View className="flex-1 items-center justify-center px-6">
        <Text className="font-displayBlack text-2xl text-neutral-on-surface">Mercado</Text>
        <Text className="font-ui mt-2 text-neutral-on-surface-variant">Pantalla en construccion con nueva paleta TorneAR.</Text>
      </View>
    </View>
  );
}
