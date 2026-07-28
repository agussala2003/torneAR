import React from 'react';
import { View, Text, ScrollView } from 'react-native';
import { TeamJoinRequestRow } from './types';
import { requestStatusChip } from '@/lib/team-helpers';

interface TeamManageHistoryRequestsProps {
  requests: TeamJoinRequestRow[];
  /**
   * Profile ids que YA son del plantel. Una solicitud ACEPTADA no significa que
   * el jugador entró: el alta la confirma él desde "Mis solicitudes". Sin este
   * dato, el capitán ve "Aceptada" y da por hecho que ya está adentro.
   */
  memberProfileIds?: Set<string>;
}

export function TeamManageHistoryRequests({ requests, memberProfileIds }: TeamManageHistoryRequestsProps) {
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
            <HistoryCard
              key={request.id}
              request={request}
              isWide
              isMember={memberProfileIds?.has(request.profile_id) ?? true}
            />
          ))}
        </ScrollView>
      ) : (
        <View className="gap-2">
          {requests.map((request) => (
            <HistoryCard
              key={request.id}
              request={request}
              isWide={false}
              isMember={memberProfileIds?.has(request.profile_id) ?? true}
            />
          ))}
        </View>
      )}
    </View>
  );
}

function HistoryCard({
  request,
  isWide,
  isMember,
}: {
  request: TeamJoinRequestRow;
  isWide: boolean;
  isMember: boolean;
}) {
  // Aceptada pero todavía sin entrar: falta que el jugador confirme el traspaso.
  const esperandoConfirmacion = request.status === 'ACEPTADA' && !isMember;

  const chip = esperandoConfirmacion
    ? { label: 'Esperando al jugador', className: 'bg-warning-tertiary/15 text-warning-tertiary' }
    : requestStatusChip(request.status);

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

      {esperandoConfirmacion && (
        <Text className="font-ui mt-2 text-[11px] leading-4 text-neutral-on-surface-variant">
          Ya lo aprobaste. Entra al plantel cuando confirme el traspaso desde su app.
        </Text>
      )}
    </View>
  );
}
