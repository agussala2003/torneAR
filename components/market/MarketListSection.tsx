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
  currentProfileId: string;
  onRefresh: () => void;
   onContactTeam: (teamId: string) => void;
  onContactPlayer: (playerProfileId: string) => void;
  onViewTeamStats: (teamId: string) => void;
  onViewPlayerStats: (profileId: string) => void;
  onDeletePost: (postId: string, isTeamPost: boolean) => void;
  memberStatusMap?: Record<string, 'own_team' | 'own_player'>;
}

export function MarketListSection({
  isLoading,
  isRefreshing,
  posts,
  activeTab,
  currentProfileId,
  onRefresh,
   onContactTeam,
  onContactPlayer,
  onViewTeamStats,
  onViewPlayerStats,
  onDeletePost,
  memberStatusMap,
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
      const isOwner = post.created_by === currentProfileId;
      const memberStatus = memberStatusMap?.[post.id];
      return (
        <MarketTeamCard
          postId={post.id}
          teamName={post.teams?.name ?? 'Equipo'}
          teamZone={post.teams?.zone}
          matchZone={post.zone}
          logoUrl={post.teams?.shield_url}
          positionWanted={post.position_wanted}
          pitchType={post.pitch_type}
          description={post.description}
          matchDate={post.match_date}
          matchTime={post.match_time}
          complex={post.complex}
           isOwner={isOwner}
          memberStatus={memberStatus}
          onPressAction={() => onContactTeam(post.team_id)}
          onPressStats={() => onViewTeamStats(post.team_id)}
          onDelete={() => onDeletePost(post.id, true)}
        />
      );
    } else {
      const post = item as MarketPlayerPost;
      const isOwner = post.profile_id === currentProfileId;
      const memberStatus = memberStatusMap?.[post.id];
      return (
        <MarketPlayerCard
          postId={post.id}
          playerName={post.profiles?.full_name ?? 'Jugador'}
          username={post.profiles?.username ?? 'user'}
          avatarUrl={post.profiles?.avatar_url}
          position={post.position}
          postType={post.post_type}
          description={post.description}
           isOwner={isOwner}
          memberStatus={memberStatus}
          onPressAction={() => onContactPlayer(post.profile_id)}
          onPressStats={() => onViewPlayerStats(post.profile_id)}
          onDelete={() => onDeletePost(post.id, false)}
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
