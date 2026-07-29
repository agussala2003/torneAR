import { Text, TouchableOpacity, View } from 'react-native';
import { router } from 'expo-router';
import { useAuth } from '@/context/AuthContext';
import { AppIcon } from '@/components/ui/AppIcon';

interface AdminEntry {
  route: string;
  icon: string;
  color: string;
  title: string;
  subtitle: string;
}

const ENTRIES: AdminEntry[] = [
  {
    route: '/admin/wo-review',
    icon: 'whistle-outline',
    color: '#FABD32',
    title: 'Reclamos de WO',
    subtitle: 'Aprobar o rechazar walkovers pendientes de revisión',
  },
  {
    route: '/admin/dispute-review',
    icon: 'scale-balance',
    color: '#FFB4AB',
    title: 'Disputas',
    subtitle: 'Resolver partidos trabados por empate de votos y Fair Play',
  },
  {
    route: '/admin/season',
    icon: 'calendar-refresh-outline',
    color: '#8CCDFF',
    title: 'Temporadas',
    subtitle: 'Cerrar la temporada activa y abrir la siguiente',
  },
  {
    route: '/admin/logs',
    icon: 'text-box-search-outline',
    color: '#53E076',
    title: 'Logs de la app',
    subtitle: 'Telemetría de errores silenciosos reportados por los clientes',
  },
];

export default function AdminIndexScreen() {
  const { profile } = useAuth();
  const isAdmin = profile?.is_admin === true;

  // ─── Gating ───────────────────────────────────────────────────────────────
  if (!isAdmin) {
    return (
      <View className="flex-1 items-center justify-center bg-surface-base px-6">
        <AppIcon family="material-community" name="lock-outline" size={44} color="#869585" />
        <Text className="font-display mt-3 text-xl text-neutral-on-surface">Acceso denegado</Text>
        <Text className="font-ui mt-2 text-center text-neutral-on-surface-variant">
          Esta sección es solo para administradores de la liga.
        </Text>
        <TouchableOpacity
          onPress={() => router.back()}
          activeOpacity={0.8}
          className="mt-5 rounded-xl bg-surface-high px-5 py-2.5"
        >
          <Text className="font-uiBold text-sm text-neutral-on-surface">Volver</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-surface-base">
      {/* Header */}
      <View className="flex-row items-center gap-3 px-4 pb-3 pt-14">
        <TouchableOpacity onPress={() => router.back()} activeOpacity={0.7}>
          <AppIcon family="material-community" name="chevron-left" size={26} color="#E5E2E1" />
        </TouchableOpacity>
        <Text className="font-displayBlack text-xl text-neutral-on-surface">Panel de administración</Text>
      </View>

      <View className="px-4 pt-2">
        {ENTRIES.map((entry) => (
          <TouchableOpacity
            key={entry.route}
            onPress={() => router.push(entry.route as never)}
            activeOpacity={0.8}
            className="mb-3 flex-row items-center gap-3 rounded-2xl bg-surface-container p-4"
          >
            <View className="h-11 w-11 items-center justify-center rounded-xl bg-surface-high">
              <AppIcon family="material-community" name={entry.icon} size={22} color={entry.color} />
            </View>
            <View className="flex-1">
              <Text className="font-uiBold text-sm text-neutral-on-surface">{entry.title}</Text>
              <Text className="font-ui mt-0.5 text-xs text-neutral-on-surface-variant">{entry.subtitle}</Text>
            </View>
            <AppIcon family="material-community" name="chevron-right" size={22} color="#869585" />
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}
