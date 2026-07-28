import React from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { AppIcon } from '@/components/ui/AppIcon';
import { TeamRequestRow } from './types';
import { getTeamCategoryLabel, getTeamFormatLabel } from '@/lib/team-options';

interface TeamRequestsListProps {
  requests: TeamRequestRow[];
  /** team_ids donde el jugador YA es miembro (para no ofrecer confirmar dos veces). */
  memberTeamIds?: Set<string>;
  /** True si el jugador pertenece hoy a algún equipo (el traspaso cerrará ese ciclo). */
  hasCurrentTeam?: boolean;
  /** id de la solicitud cuyo traspaso se está confirmando (bloquea el botón). */
  confirmingId?: string | null;
  onConfirmTransfer?: (request: TeamRequestRow) => void;
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

export function TeamRequestsList({
  requests,
  memberTeamIds,
  hasCurrentTeam = false,
  confirmingId = null,
  onConfirmTransfer,
}: TeamRequestsListProps) {
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
        const alreadyMember = memberTeamIds?.has(request.team_id) ?? false;
        const isConfirming = confirmingId === request.id;
        // El traspaso se ofrece sólo si la solicitud está ACEPTADA y el jugador
        // todavía no entró (una re-confirmación daría ALREADY_MEMBER).
        const canConfirmTransfer =
          request.status === 'ACEPTADA' && !alreadyMember && !!onConfirmTransfer;

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

            {/* Solicitud ACEPTADA: el jugador confirma el traspaso (dispara
                transfer_to_team). El capitán ya no lo suma al aceptar. */}
            {canConfirmTransfer && (
              <View className="mt-3 border-t border-neutral-outline-variant/10 pt-3">
                <TouchableOpacity
                  onPress={() => onConfirmTransfer?.(request)}
                  disabled={isConfirming}
                  activeOpacity={0.9}
                  className={`flex-row items-center justify-center gap-2 rounded-lg py-3 ${
                    isConfirming ? 'bg-brand-primary/50' : 'bg-brand-primary'
                  }`}
                >
                  {isConfirming ? (
                    <ActivityIndicator size="small" color="#003914" />
                  ) : (
                    <AppIcon family="material-community" name="swap-horizontal-bold" size={16} color="#003914" />
                  )}
                  <Text className="font-display text-[11px] uppercase tracking-wide text-[#003914]">
                    {isConfirming ? 'Confirmando…' : 'Confirmar traspaso'}
                  </Text>
                </TouchableOpacity>
                <Text className="font-ui mt-2 text-center text-[11px] text-neutral-on-surface-variant">
                  {hasCurrentTeam
                    ? 'Vas a poder elegir si dejás alguno de tus equipos o te sumás sin dejar ninguno.'
                    : 'Al confirmar te unirás al equipo.'}
                </Text>
              </View>
            )}

            {/* Ya se unió: la solicitud quedó ACEPTADA pero el jugador ya es
                miembro, así que no se ofrece confirmar de nuevo. */}
            {request.status === 'ACEPTADA' && alreadyMember && (
              <View className="mt-3 flex-row items-center gap-2 border-t border-neutral-outline-variant/10 pt-3">
                <AppIcon family="material-community" name="check-circle" size={16} color="#53E076" />
                <Text className="font-ui text-[11px] text-brand-primary">
                  Ya sos parte de este equipo.
                </Text>
              </View>
            )}
          </View>
        );
      })}
    </>
  );
}
