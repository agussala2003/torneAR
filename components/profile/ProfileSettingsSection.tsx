import { ActivityIndicator, Text, TouchableOpacity, View } from 'react-native';
import { AppIcon } from '@/components/ui/AppIcon';

type ProfileSettingsSectionProps = {
  isSigningOut: boolean;
  onSignOut: () => void;
};

function Row({
  icon,
  title,
  family = 'material-community',
}: {
  icon: string;
  title: string;
  family?: 'ionicons' | 'material-community' | 'material-icons';
}) {
  return (
    <TouchableOpacity activeOpacity={0.85} className="w-full flex-row items-center justify-between rounded-xl bg-surface-high px-5 py-4">
      <View className="flex-row items-center gap-4">
        <AppIcon family={family} name={icon} size={18} color="#BCCBB9" />
        <Text className="font-ui text-sm text-neutral-on-surface">{title}</Text>
      </View>
      <AppIcon family="material-icons" name="chevron-right" size={18} color="#BCCBB9" />
    </TouchableOpacity>
  );
}

export function ProfileSettingsSection({ isSigningOut, onSignOut }: ProfileSettingsSectionProps) {
  return (
    <View className="mt-8 pb-16">
      <Text className="font-display mb-4 px-1 text-sm uppercase tracking-wider text-neutral-on-surface-variant">Ajustes de Perfil</Text>
      <View className="gap-2 rounded-2xl bg-surface-low p-2">
        <Row family="material-community" icon="account-edit-outline" title="Editar Perfil" />
        <Row family="material-community" icon="shield-lock-outline" title="Seguridad y Privacidad" />
        <Row family="material-community" icon="cog-outline" title="Preferencias" />

        <TouchableOpacity
          disabled={isSigningOut}
          onPress={onSignOut}
          activeOpacity={0.9}
          className="w-full flex-row items-center justify-between rounded-xl bg-surface-high px-5 py-4"
        >
          <View className="flex-row items-center gap-4">
            <AppIcon family="material-community" name="logout" size={18} color="#FFB4AB" />
            <Text className="font-uiBold text-sm text-danger-error">Cerrar Sesion</Text>
          </View>
          {isSigningOut && <ActivityIndicator color="#FFB4AB" size="small" />}
        </TouchableOpacity>
      </View>
    </View>
  );
}
