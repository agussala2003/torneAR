import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  RefreshControl,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { AppIcon } from '@/components/ui/AppIcon';
import { GlobalLoader } from '@/components/GlobalLoader';
import { useCustomAlert } from '@/hooks/useCustomAlert';
import { useAuth } from '@/context/AuthContext';
import { fetchInbox, MarketConversation } from '@/lib/chat-api';
import { fetchUserManagedTeams, ManagedTeam } from '@/lib/market-api';

export default function MarketInboxScreen() {
  const router = useRouter();
  const { user, profile } = useAuth();

  const [chats, setChats] = useState<MarketConversation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  
  const { showAlert, AlertComponent } = useCustomAlert();

  const [managedTeams, setManagedTeams] = useState<ManagedTeam[]>([]);
  const [filterTeamId, setFilterTeamId] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    try {
      const [inbox, teams] = await Promise.all([
        fetchInbox(),
        user ? fetchUserManagedTeams(user.id) : Promise.resolve([]),
      ]);
      setChats(inbox);
      setManagedTeams(teams);
    } catch (error) {
      showAlert('Error', 'No se pudieron cargar los chats.');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [user, showAlert]);

  useEffect(() => {
    if (user) loadData();
  }, [user, loadData]);

  const onRefresh = () => {
    setIsRefreshing(true);
    loadData();
  };

  const displayedChats = filterTeamId
    ? chats.filter((c) => c.team_id === filterTeamId)
    : chats;

  const isActingAsCaptain = (chat: MarketConversation) =>
    profile ? chat.player_id !== profile.id : false;

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
    if (diffDays === 0) return 'Hoy';
    if (diffDays === 1) return 'Ayer';
    return date.toLocaleDateString('es-AR', { day: 'numeric', month: 'short' });
  };

  const renderItem = ({ item }: { item: MarketConversation }) => {
    const asCaptain = isActingAsCaptain(item);

    const title = asCaptain
      ? (item.player?.full_name ?? 'Jugador')
      : (item.team?.name ?? 'Equipo');

    const subtitle = asCaptain ? (item.team?.name ?? '') : '';

    const avatar = asCaptain ? item.player?.avatar_url : item.team?.shield_url;

    return (
      <TouchableOpacity
        className="flex-row items-center px-4 py-4 border-b border-surface-high"
        onPress={() => router.push(`/market-chats/${item.id}` as any)}
        activeOpacity={0.7}
      >
        {avatar ? (
          <Image
            source={{ uri: avatar }}
            className="w-12 h-12 rounded-full bg-surface-high"
            contentFit="cover"
          />
        ) : (
          <View className="w-12 h-12 rounded-full bg-surface-high items-center justify-center">
            <AppIcon
              family="material-community"
              name={asCaptain ? 'account' : 'shield-account'}
              size={24}
              color="#88998D"
            />
          </View>
        )}

        <View className="ml-4 flex-1">
          <Text className="text-neutral-on-surface font-uiBold text-base" numberOfLines={1}>
            {title}
          </Text>
          {subtitle ? (
            <Text className="text-neutral-on-surface-variant text-xs font-ui" numberOfLines={1}>
              via {subtitle}
            </Text>
          ) : null}
        </View>

        <Text className="text-neutral-on-surface-variant text-xs font-ui ml-2">
          {formatDate(item.created_at)}
        </Text>
      </TouchableOpacity>
    );
  };

  return (
    <View className="flex-1 bg-surface-base">
      {/* Header */}
      <View className="px-6 py-4 flex-row items-center border-b border-surface-high bg-surface-base">
        <TouchableOpacity
          onPress={() => router.back()}
          className="mr-4"
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <AppIcon family="material-icons" name="arrow-back" size={24} color="#00E65B" />
        </TouchableOpacity>
        <Text className="text-neutral-on-surface font-displayBlack text-xl tracking-wider">
          Mis Chats de Mercado
        </Text>
      </View>

      {/* Filtro por equipo */}
      {managedTeams.length > 1 && (
        <View className="border-b border-surface-high">
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 10, gap: 8 }}
          >
            <TouchableOpacity
              onPress={() => setFilterTeamId(null)}
              activeOpacity={0.7}
              className={`px-4 py-1.5 rounded-full border ${
                filterTeamId === null
                  ? 'bg-brand-primary border-brand-primary'
                  : 'bg-surface-low border-surface-high'
              }`}
            >
              <Text
                className={`text-xs font-uiBold ${filterTeamId === null ? 'text-[#003914]' : 'text-neutral-on-surface-variant'}`}
              >
                Todos
              </Text>
            </TouchableOpacity>
            {managedTeams.map((team) => (
              <TouchableOpacity
                key={team.id}
                onPress={() => setFilterTeamId(team.id)}
                activeOpacity={0.7}
                className={`px-4 py-1.5 rounded-full border ${
                  filterTeamId === team.id
                    ? 'bg-brand-primary border-brand-primary'
                    : 'bg-surface-low border-surface-high'
                }`}
              >
                <Text
                  className={`text-xs font-uiBold ${filterTeamId === team.id ? 'text-[#003914]' : 'text-neutral-on-surface-variant'}`}
                >
                  {team.name}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}

      {isLoading ? (
        <View className="flex-1 mt-10">
          <GlobalLoader label="Cargando chats" />
        </View>
      ) : displayedChats.length === 0 ? (
        <View className="flex-1 justify-center items-center px-6">
          <AppIcon family="material-community" name="chat-outline" size={48} color="#3F4943" />
          <Text className="text-neutral-on-surface-variant font-uiMedium text-base text-center mt-4">
            No tenés chats activos.
          </Text>
        </View>
      ) : (
        <FlatList
          data={displayedChats}
          renderItem={renderItem}
          keyExtractor={(item) => item.id}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={onRefresh}
              tintColor="#00E65B"
              colors={['#00E65B']}
            />
          }
        />
      )}

      {AlertComponent}
    </View>
  );
}
