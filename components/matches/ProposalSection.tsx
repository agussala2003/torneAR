import { View, Text, TouchableOpacity } from 'react-native';
import type { ProposalEntry } from '@/components/matches/types';

interface Props {
  proposal: ProposalEntry;
  myTeamId: string;
  onAccept: () => void;
  onReject: () => void;
  onCounterPropose?: () => void;
  onCancelProposal?: () => void;
}

function DetailTile({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-1 rounded-xl bg-surface-high p-3">
      <Text className="font-ui mb-1 text-[10px] uppercase tracking-widest text-neutral-outline">
        {label}
      </Text>
      <Text className="font-uiBold text-sm text-neutral-on-surface" numberOfLines={2}>
        {value}
      </Text>
    </View>
  );
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('es-AR', { day: '2-digit', month: 'short', year: 'numeric' });
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
}

function formatFormat(fmt: string): string {
  return fmt.replace('FUTBOL_', 'F').replace('_', ' ');
}

export function ProposalSection({ proposal, myTeamId, onAccept, onReject, onCounterPropose, onCancelProposal }: Props) {
  const isFromMe = proposal.fromTeamId === myTeamId;

  return (
    <View className="mt-4 rounded-2xl bg-surface-container p-4">
      <View className="mb-3 flex-row items-center justify-between">
        <Text className="font-uiBold text-base text-neutral-on-surface">Propuesta</Text>
        <Text className="font-ui text-xs text-neutral-on-surface-variant">
          por {proposal.proposedByName}
        </Text>
      </View>

      {/* 2x2 detail grid */}
      <View className="mb-3 gap-2">
        <View className="flex-row gap-2">
          <DetailTile label="Fecha" value={formatDate(proposal.scheduledAt)} />
          <DetailTile label="Hora" value={formatTime(proposal.scheduledAt)} />
        </View>
        <View className="flex-row gap-2">
          <DetailTile
            label="Formato"
            value={`${formatFormat(proposal.format)} · ${proposal.durationMinutes} min`}
          />
          <DetailTile
            label="Lugar"
            value={proposal.venueName ?? proposal.location ?? 'Sin definir'}
          />
        </View>
        {(proposal.signalAmount !== null || proposal.totalCost !== null) && (
          <View className="flex-row gap-2">
            {proposal.signalAmount !== null && (
              <DetailTile label="Seña" value={`$${proposal.signalAmount}`} />
            )}
            {proposal.totalCost !== null && (
              <DetailTile label="Costo total" value={`$${proposal.totalCost}`} />
            )}
          </View>
        )}
      </View>

      {isFromMe ? (
        <View className="gap-2">
          <View className="rounded-xl bg-surface-high px-4 py-3">
            <Text className="font-ui text-center text-sm text-neutral-on-surface-variant">
              Propuesta enviada — esperando respuesta del rival
            </Text>
          </View>
          {onCancelProposal && (
            <TouchableOpacity
              onPress={onCancelProposal}
              activeOpacity={0.8}
              className="rounded-xl border border-danger-error/30 py-2.5"
            >
              <Text className="font-uiBold text-center text-sm text-danger-error">
                Cancelar propuesta
              </Text>
            </TouchableOpacity>
          )}
        </View>
      ) : (
        <View className="flex-row gap-2">
          <TouchableOpacity
            onPress={onReject}
            activeOpacity={0.8}
            className="flex-1 rounded-xl border border-danger-error/40 py-3"
          >
            <Text className="font-uiBold text-center text-sm text-danger-error">Rechazar</Text>
          </TouchableOpacity>

          <TouchableOpacity
            activeOpacity={0.8}
            onPress={onCounterPropose}
            disabled={!onCounterPropose}
            className="flex-1 rounded-xl border border-info-secondary/30 bg-info-secondary/10 py-3"
          >
            <Text className="font-uiBold text-center text-sm text-info-secondary">
              Contra-prop.
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={onAccept}
            activeOpacity={0.8}
            className="flex-1 rounded-xl bg-brand-primary py-3"
          >
            <Text className="font-uiBold text-center text-sm text-[#003914]">Aceptar</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}
