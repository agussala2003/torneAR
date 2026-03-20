import { Feather } from '@expo/vector-icons';
import { ActivityIndicator, Text, TouchableOpacity, View } from 'react-native';

type ProfileSettingsSectionProps = {
  isSigningOut: boolean;
  onSignOut: () => void;
};

function Row({ icon, title }: { icon: keyof typeof Feather.glyphMap; title: string }) {
  return (
    <TouchableOpacity activeOpacity={0.85} className="w-full flex-row items-center justify-between border-b border-neutral-outline-variant/10 px-5 py-4">
      <View className="flex-row items-center gap-4">
        <Feather name={icon} size={18} color="#BCCBB9" />
        <Text className="text-sm font-medium text-neutral-on-surface">{title}</Text>
      </View>
      <Feather name="chevron-right" size={15} color="#BCCBB9" />
    </TouchableOpacity>
  );
}

export function ProfileSettingsSection({ isSigningOut, onSignOut }: ProfileSettingsSectionProps) {
  return (
    <View className="mt-8 pb-16">
      <Text className="mb-4 px-1 text-sm font-bold uppercase tracking-wider text-neutral-on-surface-variant">Ajustes de Perfil</Text>
      <View className="overflow-hidden rounded-2xl border border-neutral-outline-variant/10 bg-surface-low">
        <Row icon="edit-2" title="Editar Perfil" />
        <Row icon="lock" title="Seguridad y Privacidad" />
        <Row icon="settings" title="Preferencias" />

        <TouchableOpacity
          disabled={isSigningOut}
          onPress={onSignOut}
          activeOpacity={0.9}
          className="w-full flex-row items-center justify-between px-5 py-4"
        >
          <View className="flex-row items-center gap-4">
            <Feather name="log-out" size={18} color="#FFB4AB" />
            <Text className="text-sm font-bold text-danger-error">Cerrar Sesion</Text>
          </View>
          {isSigningOut && <ActivityIndicator color="#FFB4AB" size="small" />}
        </TouchableOpacity>
      </View>
    </View>
  );
}
