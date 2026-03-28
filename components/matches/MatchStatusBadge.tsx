import { View, Text } from 'react-native';
import type { Database } from '@/types/supabase';

type MatchStatus = Database['public']['Enums']['match_status'];

interface StatusConfig {
  label: string;
  className: string;
  textClassName: string;
}

const CONFIG: Record<MatchStatus, StatusConfig> = {
  PENDIENTE:  { label: 'PENDIENTE',  className: 'bg-warning-tertiary/20', textClassName: 'text-warning-tertiary' },
  CONFIRMADO: { label: 'CONFIRMADO', className: 'bg-info-secondary/20',   textClassName: 'text-info-secondary' },
  EN_VIVO:    { label: 'EN VIVO',    className: 'bg-danger-error/20',      textClassName: 'text-danger-error' },
  FINALIZADO: { label: 'FINALIZADO', className: 'bg-brand-primary/15',     textClassName: 'text-brand-primary' },
  EN_DISPUTA: { label: 'EN DISPUTA', className: 'bg-warning-tertiary/20',  textClassName: 'text-warning-tertiary' },
  WO_A:       { label: 'W.O.',       className: 'bg-neutral-outline/20',   textClassName: 'text-neutral-on-surface-variant' },
  WO_B:       { label: 'W.O.',       className: 'bg-neutral-outline/20',   textClassName: 'text-neutral-on-surface-variant' },
  CANCELADO:  { label: 'CANCELADO',  className: 'bg-danger-error/10',      textClassName: 'text-danger-error/70' },
};

export function MatchStatusBadge({ status }: { status: MatchStatus }) {
  const cfg = CONFIG[status];
  return (
    <View className={`rounded px-2 py-0.5 ${cfg.className}`}>
      <Text className={`font-displayBlack text-[9px] uppercase tracking-wide ${cfg.textClassName}`}>
        {cfg.label}
      </Text>
    </View>
  );
}
