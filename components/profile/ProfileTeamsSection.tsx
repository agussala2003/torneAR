import { Image, Text, View } from 'react-native';
import { TeamItem } from './types';
import { getSupabaseStorageUrl } from '@/lib/supabase-storage';
import { AppIcon } from '@/components/ui/AppIcon';

type ProfileTeamsSectionProps = {
  teams: TeamItem[];
};

function roleLabel(role: TeamItem['role']): string {
  switch (role) {
    case 'CAPITAN':
      return 'Capitan';
    case 'SUBCAPITAN':
      return 'Subcapitan';
    case 'DIRECTOR_TECNICO':
      return 'DT';
    default:
      return 'Jugador';
  }
}

function roleClass(role: TeamItem['role']): string {
  if (role === 'CAPITAN' || role === 'SUBCAPITAN') {
    return 'bg-info-secondary/15 text-info-secondary';
  }
  return 'bg-brand-primary/15 text-brand-primary';
}

export function ProfileTeamsSection({ teams }: ProfileTeamsSectionProps) {
  // Helper para obtener URL de shield
  const getShieldImageUrl = (team: TeamItem): string => {
    if (!team.shieldUrl) return '';
    if (team.shieldUrl.startsWith('http')) return team.shieldUrl;
    return getSupabaseStorageUrl('shields', team.shieldUrl);
  };

  return (
    <View className="mt-8">
      <Text className="font-display mb-4 px-1 text-sm uppercase tracking-wider text-neutral-on-surface-variant">Mis Equipos</Text>
      <View className="gap-3">
        {teams.length === 0 ? (
          <View className="rounded-xl bg-surface-low p-4">
            <Text className="font-ui text-sm text-neutral-on-surface-variant">Todavia no estas en equipos.</Text>
          </View>
        ) : (
          teams.map((team) => (
            <View key={team.id} className="flex-row items-center justify-between rounded-xl bg-surface-low p-3">
              <View className="flex-row items-center gap-4">
                <View className="h-12 w-12 items-center justify-center rounded-lg bg-surface-variant">
                  {getShieldImageUrl(team) ? (
                    <Image source={{ uri: getShieldImageUrl(team) }} className="h-8 w-8" resizeMode="contain" />
                  ) : (
                    <AppIcon family="material-community" name="shield-outline" size={18} color="#BCCBB9" />
                  )}
                </View>

                <View>
                  <Text className="font-display text-xl text-neutral-on-surface">{team.name}</Text>
                  <View className="mt-1 flex-row items-center gap-2">
                    <Text className={`font-uiBold rounded px-2 py-0.5 text-[9px] uppercase ${roleClass(team.role)}`}>
                      {roleLabel(team.role)}
                    </Text>
                    <Text className="font-ui text-xs text-neutral-on-surface-variant" style={{ fontVariant: ['tabular-nums'] }}>ELO {team.eloRating}</Text>
                  </View>
                </View>
              </View>

              <AppIcon family="material-icons" name="chevron-right" size={20} color="#BCCBB9" />
            </View>
          ))
        )}
      </View>
    </View>
  );
}
