import { Link } from 'expo-router';
import { View, Text } from 'react-native';

export default function ModalScreen() {
  return (
    <View className="flex-1 items-center justify-center bg-surface-base px-6">
      <Text className="font-displayBlack text-3xl text-neutral-on-surface">Modal</Text>
      <Text className="font-ui mt-2 text-center text-neutral-on-surface-variant">
        Vista modal con paleta unificada de TorneAR.
      </Text>
      <Link href="/" dismissTo className="mt-6 rounded-xl bg-brand-primary px-5 py-3">
        <Text className="font-display uppercase tracking-wide text-[#003914]">Volver al inicio</Text>
      </Link>
    </View>
  );
}
