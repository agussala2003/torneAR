import React from 'react';
import { View, Text, TouchableOpacity, Image, ActivityIndicator } from 'react-native';
import { AppIcon } from '@/components/ui/AppIcon';
import { getSupabaseStorageUrl } from '@/lib/supabase-storage';
import { getTeamRoleLabel, TeamRole } from '@/lib/team-options';
import { roleAppearance, firstLetterUpper, positionLabel, canManageMember } from '@/lib/team-helpers';

interface TeamMemberRow {
  profile_id: string;
  role: TeamRole;
  joined_at: string;
  profiles: {
    id: string;
    full_name: string | null;
    username: string | null;
    avatar_url: string | null;
    preferred_position: string | null;
  } | null;
}

interface TeamMembersListProps {
  members: TeamMemberRow[];
  myRole: TeamRole | null;
  profileId?: string;
  processingMemberId: string | null;
  openRoleModal: (member: TeamMemberRow, isSelf: boolean) => void;
  askRemoveMember: (member: TeamMemberRow, isSelf: boolean) => void;
}

export function TeamMembersList({
  members,
  myRole,
  profileId,
  processingMemberId,
  openRoleModal,
  askRemoveMember,
}: TeamMembersListProps) {
  return (
    <View className="gap-2">
      {members.map((member) => {
        const avatarUrl = member.profiles?.avatar_url
          ? member.profiles.avatar_url.startsWith('http')
            ? member.profiles.avatar_url
            : getSupabaseStorageUrl('avatars', member.profiles.avatar_url)
          : '';
        const roleVisual = roleAppearance(member.role);

        const isSelf = profileId === member.profile_id;
        const canManageThisMember = canManageMember(myRole, member.role, isSelf);
        const processingThisMember = processingMemberId === member.profile_id;

        return (
          <View
            key={`${member.profile_id}-${member.joined_at}`}
            className="rounded-lg border-l-4 bg-surface-high px-3 py-2.5"
            style={{ borderLeftColor: roleVisual.borderColor }}
          >
            <View className="flex-row items-center justify-between">
              <View className="flex-row items-center gap-3">
                <View className="h-12 w-12 items-center justify-center overflow-hidden rounded-lg bg-surface-variant">
                  {avatarUrl ? (
                    <Image source={{ uri: avatarUrl }} className="h-full w-full" />
                  ) : (
                    <AppIcon family="material-community" name="account" size={18} color="#BCCBB9" />
                  )}
                </View>
                <View>
                  <Text className="font-uiBold text-sm text-neutral-on-surface">
                    {member.profiles?.full_name ?? member.profiles?.username ?? 'Jugador'}
                  </Text>
                  <Text className="font-ui text-xs text-neutral-on-surface-variant">
                    @{member.profiles?.username ?? 'sin_usuario'}{isSelf ? ' (vos)' : ''}
                  </Text>
                  <Text className="font-ui mt-1 text-[11px] tracking-wide text-neutral-on-surface-variant">
                    {firstLetterUpper(positionLabel(member.profiles?.preferred_position ?? 'CUALQUIERA'))}
                  </Text>
                </View>
              </View>

              <Text
                className="font-uiBold rounded px-2 py-1 text-[10px] uppercase tracking-wide"
                style={{ backgroundColor: roleVisual.badgeBackground, color: roleVisual.badgeText }}
              >
                {getTeamRoleLabel(member.role)}
              </Text>
            </View>

            {(myRole === 'CAPITAN' || myRole === 'SUBCAPITAN') && !isSelf ? (
              <View className="mt-3 flex-row gap-2">
                <TouchableOpacity
                  onPress={() => openRoleModal(member, isSelf)}
                  disabled={processingThisMember || !canManageThisMember}
                  activeOpacity={0.9}
                  className={`flex-1 flex-row items-center justify-center rounded-md py-2 ${canManageThisMember ? 'border border-neutral-outline-variant/15' : 'border border-neutral-outline-variant/40 bg-surface-high/40'}`}
                >
                  {processingThisMember ? (
                    <ActivityIndicator color="#BCCBB9" size="small" />
                  ) : (
                    <>
                      <AppIcon family="material-community" name="account-switch-outline" size={16} color={canManageThisMember ? '#BCCBB9' : '#6F6D6C'} />
                      <Text className={`font-display ml-1.5 text-[10px] uppercase tracking-wide ${canManageThisMember ? 'text-neutral-on-surface-variant' : 'text-neutral-on-surface-variant/60'}`}>
                        {canManageThisMember ? 'Cambiar rol' : 'Sin permisos'}
                      </Text>
                    </>
                  )}
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() => askRemoveMember(member, isSelf)}
                  disabled={processingThisMember || !canManageThisMember}
                  activeOpacity={0.9}
                  className={`flex-1 flex-row items-center justify-center rounded-md py-2 ${canManageThisMember ? 'border border-danger-error/35 bg-danger-error/10' : 'border border-neutral-outline-variant/40 bg-surface-high/40'}`}
                >
                  <AppIcon family="material-community" name="account-remove-outline" size={16} color={canManageThisMember ? '#FFB4AB' : '#6F6D6C'} />
                  <Text className={`font-display ml-1.5 text-[10px] uppercase tracking-wide ${canManageThisMember ? 'text-danger-error' : 'text-neutral-on-surface-variant/60'}`}>
                    {canManageThisMember ? 'Remover' : 'Sin permisos'}
                  </Text>
                </TouchableOpacity>
              </View>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}
