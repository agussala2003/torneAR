import { View, Text, TouchableOpacity } from 'react-native';
import { AppIcon } from '@/components/ui/AppIcon';
import type { PendingAction, PendingActionType } from './types';

const ACTION_CONFIG: Record<
  PendingActionType,
  { icon: string; color: string; ctaLabel: string }
> = {
  DISPUTE: {
    icon: 'gavel',
    color: '#FABD32',
    ctaLabel: 'Ver partido',
  },
  CHALLENGE_RECEIVED: {
    icon: 'sword-cross',
    color: '#53E076',
    ctaLabel: 'Ver desafíos',
  },
  TEAM_REQUEST: {
    icon: 'account-clock',
    color: '#8CCDFF',
    ctaLabel: 'Ver solicitudes',
  },
};

interface Props {
  actions: PendingAction[];
  onActionPress: (type: PendingActionType) => void;
}

export function PendingActionsCard({ actions, onActionPress }: Props) {
  if (actions.length === 0) return null;

  return (
    <View className="mb-5">
      <Text className="font-displayBlack mb-3 text-xs uppercase tracking-widest text-warning-tertiary">
        Requieren tu atención
      </Text>
      <View className="overflow-hidden rounded-2xl bg-surface-container">
        {actions.map((action, index) => {
          const config = ACTION_CONFIG[action.type];
          const isLast = index === actions.length - 1;
          return (
            <TouchableOpacity
              key={action.type}
              activeOpacity={0.8}
              onPress={() => onActionPress(action.type)}
              className={`flex-row items-center gap-3 px-4 py-3.5 ${!isLast ? 'border-b border-neutral-outline/20' : ''}`}
            >
              {/* Icon badge */}
              <View
                className="h-9 w-9 items-center justify-center rounded-full"
                style={{ backgroundColor: `${config.color}20` }}
              >
                <AppIcon
                  family="material-community"
                  name={config.icon}
                  size={18}
                  color={config.color}
                />
              </View>

              {/* Label */}
              <Text className="font-uiBold flex-1 text-sm text-neutral-on-surface">
                {action.label}
              </Text>

              {/* CTA */}
              <View className="flex-row items-center gap-1">
                <Text className="font-uiBold text-xs" style={{ color: config.color }}>
                  {config.ctaLabel}
                </Text>
                <AppIcon
                  family="material-community"
                  name="chevron-right"
                  size={16}
                  color={config.color}
                />
              </View>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}
