import React from 'react';
import { View, Text, ScrollView } from 'react-native';
import { TeamJoinRequestRow } from './types';
import { requestStatusChip } from '@/lib/team-helpers';

interface TeamManageHistoryRequestsProps {
  requests: TeamJoinRequestRow[];
}

export function TeamManageHistoryRequests({ requests }: TeamManageHistoryRequestsProps) {
  if (requests.length === 0) {
    return (
      <View className="mt-4 rounded-xl bg-surface-low p-4">
        <View className="mb-3 flex-row items-center justify-between">
          <Text className="font-display text-xs uppercase tracking-wider text-neutral-on-surface-variant">Historial de solicitudes</Text>
          <Text className="font-ui text-xs text-neutral-on-surface-variant" style={{ fontVariant: ['tabular-nums'] }}>0</Text>
        </View>
        <Text className="font-ui text-sm text-neutral-on-surface-variant">Todavia no hay historial.</Text>
      </View>
    );
  }

  return (
    <View className="mt-4 rounded-xl bg-surface-low p-4">
      <View className="mb-3 flex-row items-center justify-between">
        <Text className="font-display text-xs uppercase tracking-wider text-neutral-on-surface-variant">Historial de solicitudes</Text>
        <Text className="font-ui text-xs text-neutral-on-surface-variant" style={{ fontVariant: ['tabular-nums'] }}>{requests.length}</Text>
      </View>

      {requests.length > 1 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12 }}>
          {requests.map((request) => (
            <HistoryCard key={request.id} request={request} isWide />
          ))}
        </ScrollView>
      ) : (
        <View className="gap-2">
          {requests.map((request) => (
            <HistoryCard key={request.id} request={request} isWide={false} />
          ))}
        </View>
      )}
    </View>
  );
}

function HistoryCard({ request, isWide }: { request: TeamJoinRequestRow; isWide: boolean }) {
  const chip = requestStatusChip(request.status);

  return (
    <View className={`${isWide ? 'w-[280px]' : ''} rounded-lg bg-surface-high px-3 py-3`}>
      <Text className="font-uiBold text-sm text-neutral-on-surface">
        {request.profiles?.full_name ?? request.profiles?.username ?? 'Jugador'}
      </Text>
      <Text className="font-ui mt-1 text-xs text-neutral-on-surface-variant">
        @{request.profiles?.username ?? 'sin_usuario'}
      </Text>
      <View className="mt-2 flex-row items-center justify-between">
        <Text className="font-ui text-[11px] text-neutral-on-surface-variant">
          {new Date(request.created_at).toLocaleDateString('es-AR')}
        </Text>
        <Text className={`font-uiBold rounded px-2 py-1 text-[10px] uppercase tracking-wide ${chip.className}`}>
          {chip.label}
        </Text>
      </View>
    </View>
  );
}
