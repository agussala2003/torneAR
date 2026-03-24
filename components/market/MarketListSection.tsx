import React from 'react';
import { View, FlatList, Text, ActivityIndicator, RefreshControl } from 'react-native';
import { AppIcon } from '@/components/ui/AppIcon';
import { MarketTeamCard, MarketPlayerCard } from '@/components/market/MarketCards';
import { MarketTeamPost, MarketPlayerPost } from '@/lib/market-api';
import { TabType } from './types';

interface MarketListSectionProps {
  isLoading: boolean;
  isRefreshing: boolean;
  posts: (MarketTeamPost | MarketPlayerPost)[];
  activeTab: TabType;
  onRefresh: () => void;
  onContactTeam: (teamId: string) => void;
  onContactPlayer: (playerProfileId: string) => void;
}

export function MarketListSection({
  isLoading,
  isRefreshing,
  posts,
  activeTab,
  onRefresh,
  onContactTeam,
  onContactPlayer,
}: MarketListSectionProps) {
  if (isLoading) {
    return (
      <View className="flex-1 items-center justify-center">
        <ActivityIndicator size="large" color="#00E65B" />
      </View>
    );
  }

  const renderItem = ({ item }: { item: MarketTeamPost | MarketPlayerPost }) => {
    if (activeTab === 'TEAMS_LOOKING') {
      const post = item as MarketTeamPost;
      return (
        <MarketTeamCard
          teamName={post.teams?.name ?? 'Equipo'}
          logoUrl={post.teams?.shield_url}
          positionWanted={post.position_wanted}
          description={post.description}
          matchDate={post.match_date}
          matchTime={post.match_time}
          zone={post.zone}
          onPressAction={() => onContactTeam(post.team_id)}
        />
      );
    } else {
      const post = item as MarketPlayerPost;
      return (
        <MarketPlayerCard
          playerName={post.profiles?.full_name ?? 'Jugador'}
          username={post.profiles?.username ?? 'user'}
          avatarUrl={post.profiles?.avatar_url}
          position={post.position}
          postType={post.post_type}
          description={post.description}
          onPressAction={() => onContactPlayer(post.profile_id)}
        />
      );
    }
  };

  return (
    <FlatList
      data={posts}
      keyExtractor={(item) => item.id}
      renderItem={renderItem}
      showsVerticalScrollIndicator={false}
      contentContainerStyle={{ paddingTop: 0, paddingBottom: 100 }}
      refreshControl={
        <RefreshControl
          refreshing={isRefreshing}
          onRefresh={onRefresh}
          tintColor="#00E65B"
          colors={['#00E65B']}
        />
      }
      ListEmptyComponent={
        <View className="flex-1 items-center justify-center py-20">
          <AppIcon family="material-community" name="soccer-field" size={48} color="#3F4943" />
          <Text className="mt-4 text-center font-uiMedium text-neutral-on-surface-variant">
            No se encontraron publicaciones.
          </Text>
        </View>
      }
    />
  );
}
