import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Image } from 'expo-image';
import { AppIcon } from '@/components/ui/AppIcon';

interface MarketTeamCardProps {
  teamName: string;
  logoUrl?: string | null;
  positionWanted: string;
  description?: string | null;
  onPressAction: () => void;
}

export function MarketTeamCard({ teamName, logoUrl, positionWanted, description, onPressAction }: MarketTeamCardProps) {
  return (
    <View className="bg-surface-low rounded-xl overflow-hidden mb-4">
      <View className="p-4">
        <View className="flex-row items-center gap-3 mb-3">
          {logoUrl ? (
            <Image
              source={{ uri: logoUrl }}
              className="w-12 h-12 rounded-full bg-surface-high"
              contentFit="cover"
              transition={200}
            />
          ) : (
            <View className="w-12 h-12 rounded-full bg-surface-high items-center justify-center">
              <AppIcon family="material-community" name="shield-account" size={24} color="#88998D" />
            </View>
          )}
          <View className="flex-1">
            <Text className="text-neutral-on-surface font-uiBold text-base" numberOfLines={1}>
              {teamName}
            </Text>
          </View>
        </View>

        <View className="bg-surface-variant/40 p-3 rounded-lg flex-row justify-between items-center mb-3">
          <Text className="text-neutral-on-surface-variant text-xs font-uiMedium">
            Buscamos:
          </Text>
          <View className="bg-brand-primary px-3 py-1 rounded">
            <Text className="text-[#003914] text-[10px] font-displayBlack uppercase">
              {positionWanted}
            </Text>
          </View>
        </View>

        {description ? (
          <Text className="text-neutral-on-surface-variant text-sm italic mb-1" numberOfLines={3}>
            "{description}"
          </Text>
        ) : null}

        <TouchableOpacity
          className="w-full py-3 bg-brand-primary/10 border border-brand-primary/20 rounded-lg items-center mt-4"
          activeOpacity={0.7}
          onPress={onPressAction}
        >
          <Text className="text-brand-primary font-display uppercase tracking-widest text-xs">
            Contactar
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

interface MarketPlayerCardProps {
  playerName: string;
  avatarUrl?: string | null;
  username: string;
  position: string;
  postType: string;
  description?: string | null;
  onPressAction: () => void;
}

export function MarketPlayerCard({
  playerName,
  avatarUrl,
  username,
  position,
  postType,
  description,
  onPressAction
}: MarketPlayerCardProps) {
  const isLookingForTeam = postType === 'BUSCA_EQUIPO';

  return (
    <View className="bg-surface-low rounded-xl overflow-hidden mb-4">
      <View className="p-4">
        <View className="flex-row items-center gap-3 mb-3">
          {avatarUrl ? (
            <Image
              source={{ uri: avatarUrl }}
              className="w-12 h-12 rounded-full bg-surface-high"
              contentFit="cover"
              transition={200}
            />
          ) : (
            <View className="w-12 h-12 rounded-full bg-surface-high items-center justify-center">
              <AppIcon family="material-community" name="account" size={24} color="#88998D" />
            </View>
          )}
          <View className="flex-1">
            <Text className="text-neutral-on-surface font-uiBold text-base" numberOfLines={1}>
              {playerName}
            </Text>
            <Text className="text-neutral-on-surface-variant font-ui text-xs">
              @{username}
            </Text>
          </View>
        </View>

        <View className="bg-surface-variant/40 p-3 rounded-lg flex-row justify-between items-center mb-3">
          <Text className="text-neutral-on-surface-variant text-xs font-uiMedium">
            {isLookingForTeam ? 'Busco unirme como:' : 'Para jugar de:'}
          </Text>
          <View className="bg-brand-primary px-3 py-1 rounded">
            <Text className="text-[#003914] text-[10px] font-displayBlack uppercase">
              {position}
            </Text>
          </View>
        </View>

        {description ? (
          <Text className="text-neutral-on-surface-variant text-sm italic mb-1" numberOfLines={3}>
            "{description}"
          </Text>
        ) : null}

        <TouchableOpacity
          className="w-full py-3 bg-brand-primary/10 border border-brand-primary/20 rounded-lg items-center mt-4"
          activeOpacity={0.7}
          onPress={onPressAction}
        >
          <Text className="text-brand-primary font-display uppercase tracking-widest text-xs">
            Ver Perfil
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}
