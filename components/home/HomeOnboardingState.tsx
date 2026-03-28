import { View, Text, TouchableOpacity } from 'react-native';
import { AppIcon } from '@/components/ui/AppIcon';

interface Props {
  onCreateTeam: () => void;
  onJoinTeam: () => void;
  onGoToMarket: () => void;
}

export function HomeOnboardingState({ onCreateTeam, onJoinTeam, onGoToMarket }: Props) {
  return (
    <View className="flex-1 items-center justify-center px-6">
      {/* Ball icon */}
      <View className="mb-6 h-20 w-20 items-center justify-center rounded-full bg-surface-container">
        <AppIcon family="material-community" name="soccer" size={44} color="#53E076" />
      </View>

      <Text className="font-displayBlack text-center text-2xl uppercase text-neutral-on-surface">
        ¡Bienvenido a TorneAR!
      </Text>
      <Text className="font-ui mt-3 text-center text-base text-neutral-on-surface-variant">
        Para empezar a jugar necesitás un equipo. Creá el tuyo, unite con un código o buscá uno en
        el Mercado.
      </Text>

      {/* Primary CTAs */}
      <View className="mt-8 w-full gap-3">
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={onCreateTeam}
          className="flex-row items-center justify-center gap-2 rounded-2xl bg-brand-primary py-4"
        >
          <AppIcon family="material-community" name="shield-plus" size={20} color="#0E0E0E" />
          <Text className="font-uiBold text-base text-surface-lowest">Crear un Equipo Nuevo</Text>
        </TouchableOpacity>

        <TouchableOpacity
          activeOpacity={0.85}
          onPress={onJoinTeam}
          className="flex-row items-center justify-center gap-2 rounded-2xl border border-brand-primary py-4"
        >
          <AppIcon family="material-community" name="key-variant" size={20} color="#53E076" />
          <Text className="font-uiBold text-base text-brand-primary">Unirse con Código</Text>
        </TouchableOpacity>

        <TouchableOpacity
          activeOpacity={0.85}
          onPress={onGoToMarket}
          className="flex-row items-center justify-center gap-2 rounded-2xl bg-surface-container py-4"
        >
          <AppIcon family="material-community" name="store-search" size={20} color="#BCCBB9" />
          <Text className="font-uiBold text-base text-neutral-on-surface-variant">
            Buscar Equipo en el Mercado
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}
