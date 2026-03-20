import { Link } from 'expo-router';
import { View, Text } from 'react-native';

export default function ModalScreen() {
  return (
    <View className="flex-1 items-center justify-center bg-surface-base px-6">
      <Text className="text-3xl font-black text-neutral-on-surface">Modal</Text>
      <Text className="mt-2 text-center text-neutral-on-surface-variant">
        Vista modal con paleta unificada de TorneAR.
      </Text>
      <Link href="/" dismissTo className="mt-6 rounded-xl bg-brand-primary px-5 py-3">
        <Text className="font-extrabold uppercase tracking-wide text-[#003914]">Volver al inicio</Text>
      </Link>
    </View>
  );
}
