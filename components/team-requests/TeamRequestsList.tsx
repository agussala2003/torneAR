import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { AppIcon } from '@/components/ui/AppIcon';
import { TeamRequestRow } from './types';
import { getTeamCategoryLabel, getTeamFormatLabel } from '@/lib/team-options';

interface TeamRequestsListProps {
  requests: TeamRequestRow[];
}

function statusStyle(status: TeamRequestRow['status']): { label: string; className: string } {
  if (status === 'ACEPTADA') {
    return { label: 'Aceptada', className: 'bg-brand-primary/15 text-brand-primary' };
  }

  if (status === 'RECHAZADA') {
    return { label: 'Rechazada', className: 'bg-danger-error/15 text-danger-error' };
  }

  return { label: 'Pendiente', className: 'bg-info-secondary/15 text-info-secondary' };
}

export function TeamRequestsList({ requests }: TeamRequestsListProps) {
  const router = useRouter();

  if (requests.length === 0) {
    return (
      <View className="rounded-xl bg-surface-low p-4">
        <Text className="font-ui text-sm text-neutral-on-surface-variant">
          No hay solicitudes para mostrar.
        </Text>
        <TouchableOpacity
          onPress={() => router.push('/team-join')}
          activeOpacity={0.9}
          className="mt-3 flex-row items-center justify-center rounded-lg bg-brand-primary py-2.5"
        >
          <AppIcon family="material-community" name="account-plus" size={16} color="#003914" />
          <Text className="font-display ml-1.5 text-[11px] uppercase tracking-wide text-[#003914]">Nueva solicitud</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <>
      {requests.map((request) => {
        const status = statusStyle(request.status);

        return (
          <View key={request.id} className="rounded-xl bg-surface-low p-4">
            <View className="flex-row items-start justify-between gap-3">
              <View className="flex-1">
                <Text className="font-display text-xl text-neutral-on-surface">{request.teams?.name ?? 'Equipo'}</Text>
                <Text className="font-ui mt-1 text-xs text-neutral-on-surface-variant">{request.teams?.zone ?? 'Zona no definida'}</Text>
              </View>

              <Text className={`font-uiBold rounded px-2 py-1 text-[10px] uppercase tracking-wide ${status.className}`}>
                {status.label}
              </Text>
            </View>

            <View className="mt-3 flex-row flex-wrap items-center gap-2">
              {request.teams ? (
                <>
                  <Text className="font-uiBold rounded bg-brand-primary/15 px-2 py-1 text-[10px] uppercase tracking-wide text-brand-primary">
                    {getTeamCategoryLabel(request.teams.category)}
                  </Text>
                  <Text className="font-uiBold rounded bg-info-secondary/15 px-2 py-1 text-[10px] uppercase tracking-wide text-info-secondary">
                    {getTeamFormatLabel(request.teams.preferred_format)}
                  </Text>
                </>
              ) : null}
            </View>

            <View className="mt-3 flex-row items-center justify-between">
              <Text className="font-ui text-[11px] text-neutral-on-surface-variant">
                Enviada: {new Date(request.created_at).toLocaleDateString('es-AR')}
              </Text>
            </View>
          </View>
        );
      })}
    </>
  );
}
