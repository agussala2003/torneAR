import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  FlatList,
  ActivityIndicator,
  TouchableOpacity,
  RefreshControl,
  Text,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { GlobalHeader } from '@/components/GlobalHeader';
import { AppIcon } from '@/components/ui/AppIcon';
import { MarketTabs } from '../../components/market/MarketTabs';
import { PositionFilterScroll } from '../../components/market/PositionFilterScroll';
import { MarketTeamCard, MarketPlayerCard } from '../../components/market/MarketCards';

import {
  fetchTeamPosts,
  fetchPlayerPosts,
  fetchUserManagedTeams,
  MarketTeamPost,
  MarketPlayerPost,
  ManagedTeam,
} from '../../lib/market-api';
import { getOrCreateMarketChat } from '../../lib/chat-api';
import { useAuth } from '@/context/AuthContext';

type TabType = 'TEAMS_LOOKING' | 'PLAYERS_LOOKING';

export default function MarketScreen() {
  const router = useRouter();
  const { user, profile } = useAuth();

  const [activeTab, setActiveTab] = useState<TabType>('TEAMS_LOOKING');
  const [selectedPosition, setSelectedPosition] = useState<string>('CUALQUIERA');

  const [teamPosts, setTeamPosts] = useState<MarketTeamPost[]>([]);
  const [playerPosts, setPlayerPosts] = useState<MarketPlayerPost[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isContactLoading, setIsContactLoading] = useState(false);

  // Equipos que el usuario actual gestiona (CAPITÁN / SUBCAPITÁN)
  const [managedTeams, setManagedTeams] = useState<ManagedTeam[]>([]);
  // Equipo activo del capitán para contactar jugadores (cuando gestiona varios)
  const [activeCaptainTeamId, setActiveCaptainTeamId] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    fetchUserManagedTeams(user.id).then((teams) => {
      setManagedTeams(teams);
      if (teams.length > 0) setActiveCaptainTeamId(teams[0].id);
    });
  }, [user]);

  const loadPosts = useCallback(async () => {
    try {
      if (activeTab === 'TEAMS_LOOKING') {
        const data = await fetchTeamPosts(selectedPosition);
        setTeamPosts(data);
      } else {
        const data = await fetchPlayerPosts(selectedPosition);
        setPlayerPosts(data);
      }
    } catch (error) {
      console.error('Error al cargar datos del mercado:', error);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [activeTab, selectedPosition]);

  useEffect(() => {
    setIsLoading(true);
    loadPosts();
  }, [loadPosts]);

  const onRefresh = () => {
    setIsRefreshing(true);
    loadPosts();
  };

  const handleCreatePost = () => {
    router.push('/(modals)/market-create');
  };

  /**
   * El jugador (o cualquier usuario) ve una publicación de equipo buscando jugador
   * y quiere contactar a ese equipo. El usuario actúa como JUGADOR.
   */
  const handleContactTeam = async (teamId: string) => {
    if (!profile) return;
    setIsContactLoading(true);
    try {
      const chat = await getOrCreateMarketChat(profile.id, teamId);
      router.push(`/market-chats/${chat.id}` as any);
    } catch (e) {
      Alert.alert('Error', 'No se pudo abrir el chat. Intentá de nuevo.');
    } finally {
      setIsContactLoading(false);
    }
  };

  /**
   * El CAPITÁN / SUBCAPITÁN ve una publicación de jugador buscando equipo
   * y quiere contactarlo en nombre de su equipo.
   */
  const handleContactPlayer = async (playerProfileId: string) => {
    if (!profile) return;

    if (managedTeams.length === 0) {
      Alert.alert(
        'Sin equipos',
        'Debés ser Capitán o Subcapitán de un equipo para contactar jugadores.',
      );
      return;
    }

    const teamId = activeCaptainTeamId ?? managedTeams[0].id;

    setIsContactLoading(true);
    try {
      const chat = await getOrCreateMarketChat(playerProfileId, teamId);
      router.push(`/market-chats/${chat.id}` as any);
    } catch (e) {
      Alert.alert('Error', 'No se pudo abrir el chat. Intentá de nuevo.');
    } finally {
      setIsContactLoading(false);
    }
  };

  const renderItem = ({ item }: { item: MarketTeamPost | MarketPlayerPost }) => {
    if (activeTab === 'TEAMS_LOOKING') {
      const post = item as MarketTeamPost;
      return (
        <MarketTeamCard
          teamName={post.teams?.name ?? 'Equipo'}
          logoUrl={post.teams?.shield_url}
          positionWanted={post.position_wanted}
          description={post.description}
          onPressAction={() => handleContactTeam(post.team_id)}
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
          onPressAction={() => handleContactPlayer(post.profile_id)}
        />
      );
    }
  };

  const posts: (MarketTeamPost | MarketPlayerPost)[] =
    activeTab === 'TEAMS_LOOKING' ? teamPosts : playerPosts;

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top']}>
      <GlobalHeader />

      <View className="pt-4">
        <MarketTabs activeTab={activeTab} onTabChange={setActiveTab} />
        <PositionFilterScroll
          selectedPosition={selectedPosition}
          onPositionSelect={setSelectedPosition}
        />

        {/* Selector de equipo activo para capitanes con múltiples equipos */}
        {activeTab === 'PLAYERS_LOOKING' && managedTeams.length > 1 && (
          <View className="px-4 pt-3">
            <Text className="text-on-surface-variant text-xs font-uiMedium mb-2">
              Contactar como:
            </Text>
            <View className="flex-row gap-2 flex-wrap">
              {managedTeams.map((team) => (
                <TouchableOpacity
                  key={team.id}
                  onPress={() => setActiveCaptainTeamId(team.id)}
                  activeOpacity={0.7}
                  className={`px-3 py-1.5 rounded-full border ${
                    activeCaptainTeamId === team.id
                      ? 'bg-primary border-primary'
                      : 'bg-surface-container-low border-surface-container-high'
                  }`}
                >
                  <Text
                    className={`text-xs font-uiBold ${
                      activeCaptainTeamId === team.id ? 'text-on-primary' : 'text-on-surface-variant'
                    }`}
                  >
                    {team.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        {/* Acceso rápido al inbox de chats */}
        <TouchableOpacity
          className="flex-row items-center px-4 py-3 border-b border-surface-container-high"
          onPress={() => router.push('/market-chats' as any)}
          activeOpacity={0.7}
        >
          <AppIcon family="material-icons" name="chat-bubble-outline" size={18} color="#00E65B" />
          <Text className="text-primary font-uiMedium text-sm ml-2">Mis Chats de Mercado</Text>
          <View className="flex-1" />
          <AppIcon family="material-icons" name="chevron-right" size={18} color="#88998D" />
        </TouchableOpacity>
      </View>

      <View className="flex-1 px-4">
        {isLoading ? (
          <View className="flex-1 justify-center items-center">
            <ActivityIndicator size="large" color="#00E65B" />
          </View>
        ) : (
          <FlatList
            data={posts}
            keyExtractor={(item) => item.id}
            renderItem={renderItem}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingTop: 12, paddingBottom: 100 }}
            refreshControl={
              <RefreshControl
                refreshing={isRefreshing}
                onRefresh={onRefresh}
                tintColor="#00E65B"
                colors={['#00E65B']}
              />
            }
            ListEmptyComponent={
              <View className="flex-1 justify-center items-center py-20">
                <AppIcon family="material-community" name="soccer-field" size={48} color="#3F4943" />
                <Text className="text-on-surface-variant font-uiMedium mt-4 text-center">
                  No se encontraron publicaciones.
                </Text>
              </View>
            }
          />
        )}
      </View>

      {/* FAB: Crear publicación */}
      <TouchableOpacity
        className="absolute bottom-6 right-6 w-14 h-14 bg-primary rounded-full items-center justify-center"
        onPress={handleCreatePost}
        activeOpacity={0.9}
        disabled={isContactLoading}
        style={{
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.3,
          shadowRadius: 5,
          elevation: 5,
        }}
      >
        {isContactLoading ? (
          <ActivityIndicator size="small" color="#003914" />
        ) : (
          <AppIcon family="material-icons" name="add" size={28} color="#003914" />
        )}
      </TouchableOpacity>
    </SafeAreaView>
  );
}
