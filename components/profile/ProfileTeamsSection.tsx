import { Image, Text, TouchableOpacity, View } from 'react-native';
import { TeamItem } from './types';
import { getSupabaseStorageUrl } from '@/lib/supabase-storage';
import { AppIcon } from '@/components/ui/AppIcon';
import { getTeamRoleLabel } from '@/lib/team-options';

type ProfileTeamsSectionProps = {
  teams: TeamItem[];
  onCreateTeam?: () => void;
  onJoinTeam?: () => void;
  onOpenRequests?: () => void;
  onTeamPress?: (teamId: string) => void;
};

function roleClass(role: TeamItem['role']): string {
  if (role === 'CAPITAN' || role === 'SUBCAPITAN') {
    return 'bg-info-secondary/15 text-info-secondary';
  }
  return 'bg-brand-primary/15 text-brand-primary';
}

export function ProfileTeamsSection({ teams, onCreateTeam, onJoinTeam, onOpenRequests, onTeamPress }: ProfileTeamsSectionProps) {
  // Helper para obtener URL de shield
  const getShieldImageUrl = (team: TeamItem): string => {
    if (!team.shieldUrl) return '';
    if (team.shieldUrl.startsWith('http')) return team.shieldUrl;
    return getSupabaseStorageUrl('shields', team.shieldUrl);
  };

  return (
    <View className="mt-8">
      <View className="mb-4 flex-row items-center justify-between px-1">
        <Text className="font-display text-sm uppercase tracking-wider text-neutral-on-surface-variant">Mis Equipos</Text>
        {teams.length > 0 ? (
          <View className="flex-row items-center gap-2">
            <TouchableOpacity
              onPress={onOpenRequests}
              activeOpacity={0.9}
              className="rounded-md border border-neutral-outline-variant/15 bg-surface-high px-2.5 py-1"
            >
              <Text className="font-display text-[10px] uppercase tracking-wide text-neutral-on-surface-variant">Solicitudes</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={onJoinTeam}
              activeOpacity={0.9}
              className="rounded-md border border-info-secondary/35 bg-info-secondary/10 px-2.5 py-1"
            >
              <Text className="font-display text-[10px] uppercase tracking-wide text-info-secondary">Unirme</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={onCreateTeam}
              activeOpacity={0.9}
              className="rounded-md border border-brand-primary/45 bg-brand-primary/15 px-2.5 py-1"
            >
              <Text className="font-display text-[10px] uppercase tracking-wide text-brand-primary">Crear</Text>
            </TouchableOpacity>
          </View>
        ) : null}
      </View>
      <View className="gap-3">
        {teams.length === 0 ? (
          <View className="rounded-xl bg-surface-low p-4">
            <Text className="font-ui text-sm text-neutral-on-surface-variant">Todavia no estas en equipos.</Text>
            <View className="mt-3 flex-row gap-2">
              <TouchableOpacity onPress={onOpenRequests} activeOpacity={0.9} className="flex-1 flex-row items-center justify-center rounded-lg bg-surface-high py-2.5">
                <AppIcon family="material-community" name="clipboard-text-outline" size={16} color="#BCCBB9" />
                <Text className="font-display ml-1.5 text-[11px] uppercase tracking-wide text-neutral-on-surface-variant">Solicitudes</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={onCreateTeam} activeOpacity={0.9} className="flex-1 flex-row items-center justify-center rounded-lg bg-brand-primary py-2.5">
                <AppIcon family="material-community" name="shield-plus" size={16} color="#003914" />
                <Text className="font-display ml-1.5 text-[11px] uppercase tracking-wide text-[#003914]">Crear</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={onJoinTeam} activeOpacity={0.9} className="flex-1 flex-row items-center justify-center rounded-lg bg-info-secondary/75 py-2.5">
                <AppIcon family="material-community" name="account-plus" size={16} color="#0E2430" />
                <Text className="font-display ml-1.5 text-[11px] uppercase tracking-wide text-[#0E2430]">Unirme</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          teams.map((team) => (
            <TouchableOpacity
              key={team.id}
              onPress={() => onTeamPress?.(team.id)}
              activeOpacity={0.88}
              className="flex-row items-center justify-between rounded-xl bg-surface-low p-3"
            >
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
                  <View className="mt-2 flex-row items-center gap-2">
                    <Text className={`font-uiBold rounded px-2 py-0.5 text-[9px] uppercase ${roleClass(team.role)}`}>
                      {getTeamRoleLabel(team.role)}
                    </Text>
                    <Text className="font-ui text-xs text-neutral-on-surface-variant" style={{ fontVariant: ['tabular-nums'] }}>- PR {team.prRating}</Text>
                  </View>
                </View>
              </View>

              <AppIcon family="material-icons" name="chevron-right" size={20} color="#BCCBB9" />
            </TouchableOpacity>
          ))
        )}
      </View>
    </View>
  );
}
