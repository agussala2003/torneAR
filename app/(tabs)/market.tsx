import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { View, Text, TouchableOpacity, Modal } from 'react-native';
import { router, useFocusEffect } from 'expo-router';

import { GlobalHeader } from '@/components/GlobalHeader';
import { AppIcon } from '@/components/ui/AppIcon';
import { MarketTabs } from '@/components/market/MarketTabs';
import { MarketListSection } from '@/components/market/MarketListSection';
import { FilterModal } from '@/components/market/FilterModal';
import { useAuth } from '@/context/AuthContext';
import { useUI } from '@/context/UIContext';
import { useTeamStore } from '@/stores/teamStore';
import { fetchMarketViewData } from '@/lib/market-data';
import { togglePostStatus } from '@/lib/market-api';
import { filterPostsByDay } from '@/lib/market-utils';
import { MarketViewData, TabType } from '@/components/market/types';
import { getOrCreateMarketChat } from '@/lib/chat-api';

export default function MarketScreen() {
  const { profile } = useAuth();
  const { showAlert, showLoader, hideLoader } = useUI();
  const { fetchMyTeams } = useTeamStore();

  const [activeTab, setActiveTab] = useState<TabType>('TEAMS_LOOKING');
  const [selectedPosition] = useState<string>('CUALQUIERA');

  const [filterZone, setFilterZone] = useState<string | null>(null);
  const [filterDays, setFilterDays] = useState<string[]>([]);
  const [filterSort, setFilterSort] = useState<'nearest' | 'recent'>('recent');
  const [showFilterModal, setShowFilterModal] = useState(false);

  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [viewData, setViewData] = useState<MarketViewData | null>(null);

  const [activeCaptainTeamId, setActiveCaptainTeamId] = useState<string | null>(null);
  const [postPendingDelete, setPostPendingDelete] = useState<{ id: string; isTeamPost: boolean } | null>(null);

  const loadMarketData = useCallback(async (showFullLoader = true) => {
    if (!profile) {
      setLoading(false);
      return;
    }

    try {
      if (showFullLoader) setLoading(true);
      const data = await fetchMarketViewData(profile, selectedPosition, { zone: filterZone, sortBy: filterSort });
      setViewData(data);

      if (data.managedTeams.length > 0) {
        setActiveCaptainTeamId((current) => current ?? data.managedTeams[0].id);
      }
    } catch {
      showAlert('Error', 'No se pudo cargar la informacion del mercado.');
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  }, [profile, selectedPosition, filterZone, filterSort, showAlert]);

  useFocusEffect(
    useCallback(() => {
      void loadMarketData(true);
      if (profile?.id) void fetchMyTeams(profile.id);
    }, [loadMarketData, profile?.id, fetchMyTeams])
  );

  useEffect(() => {
    if (profile) void loadMarketData(false);
  }, [profile, filterZone, filterSort, loadMarketData]);

  const onRefresh = () => {
    setIsRefreshing(true);
    void loadMarketData(false);
  };

  const handleCreatePost = () => {
    const isTeamCreationFlow = activeTab === 'TEAMS_LOOKING';
    const canCreateTeamPost = (viewData?.managedTeams?.length ?? 0) > 0;

    if (isTeamCreationFlow && !canCreateTeamPost) {
      showAlert('Acceso restringido', 'Debes ser Capitan o Subcapitan de un equipo para crear esta publicacion.');
      return;
    }

    const typeToCreate = activeTab === 'TEAMS_LOOKING' ? 'TEAM' : 'PLAYER';
    router.push({
      pathname: '/(modals)/market-create',
      params: { type: typeToCreate }
    });
  };

  const handleContactTeam = async (teamId: string) => {
    if (!profile) return;
    showLoader('Abriendo chat...');
    try {
      const chat = await getOrCreateMarketChat(profile.id, teamId);
      router.push(`/market-chats/${chat.id}` as any);
    } catch {
      showAlert('Error', 'No se pudo abrir el chat. Intenta de nuevo.');
    } finally {
      hideLoader();
    }
  };

   const handleContactPlayer = async (playerProfileId: string) => {
    if (!profile || !viewData) return;

    if (viewData.managedTeams.length === 0) {
      showAlert('Sin equipos', 'Debes ser Capitan o Subcapitan de un equipo para contactar jugadores.');
      return;
    }

    const teamId = activeCaptainTeamId ?? viewData.managedTeams[0].id;

    showLoader('Abriendo chat...');
    try {
      const chat = await getOrCreateMarketChat(playerProfileId, teamId);
      router.push(`/market-chats/${chat.id}` as any);
    } catch {
      showAlert('Error', 'No se pudo abrir el chat. Intenta de nuevo.');
    } finally {
      hideLoader();
    }
  };

  const handleViewTeamStats = (teamId: string) => {
    router.push({
      pathname: '/team-stats',
      params: { teamId }
    });
  };

  const handleViewPlayerStats = (playerProfileId: string) => {
    router.push({
      pathname: '/profile-stats',
      params: { profileId: playerProfileId }
    });
  };

  const handleDeletePost = (postId: string, isTeamPost: boolean) => {
    setPostPendingDelete({ id: postId, isTeamPost });
  };

  const confirmDeletePost = async () => {
    if (!postPendingDelete) return;
    showLoader('Cancelando publicación...');
    try {
      await togglePostStatus(postPendingDelete.id, postPendingDelete.isTeamPost, false);
      setViewData((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          teamPosts: prev.teamPosts.filter((p) => p.id !== postPendingDelete.id),
          playerPosts: prev.playerPosts.filter((p) => p.id !== postPendingDelete.id),
        };
      });
      setPostPendingDelete(null);
    } catch {
      showAlert('Error', 'No se pudo cancelar la publicación.');
    } finally {
      hideLoader();
    }
  };

  const memberStatusMap = useMemo(() => {
    const map: Record<string, 'own_team' | 'own_player'> = {};
    if (!viewData) return map;

    if (activeTab === 'TEAMS_LOOKING') {
      for (const post of viewData.teamPosts) {
        if (viewData.myTeamIds.includes(post.team_id)) {
          map[post.id] = 'own_team';
        }
      }
    } else {
      for (const post of viewData.playerPosts) {
        if (viewData.myManagedTeamsMemberProfileIds.includes(post.profile_id)) {
          map[post.id] = 'own_player';
        }
      }
    }
    return map;
  }, [viewData, activeTab]);

  if (!profile && !loading) {
    return (
      <View className="flex-1 items-center justify-center bg-surface-base px-6">
        <Text className="font-display text-xl text-neutral-on-surface">Mercado no disponible</Text>
      </View>
    );
  }

  const rawTeamPosts = viewData?.teamPosts ?? [];
  const teamPosts = filterDays.length > 0 ? filterPostsByDay(rawTeamPosts, filterDays) : rawTeamPosts;
  const posts = activeTab === 'TEAMS_LOOKING' ? teamPosts : (viewData?.playerPosts ?? []);
  const canCreateTeamPost = (viewData?.managedTeams?.length ?? 0) > 0;
  const showCreateButton = activeTab === 'TEAMS_LOOKING' ? canCreateTeamPost : true;

  const hasActiveFilters = filterZone !== null || filterDays.length > 0 || filterSort !== 'recent';

  return (
    <View className="flex-1 bg-surface-base">
      <GlobalHeader isMarketTab />
      <View className="px-4 pt-4 pb-2 z-10">
        <View className="flex-row items-center gap-2 mb-6">
          <View className="flex-1">
            <MarketTabs activeTab={activeTab} onTabChange={setActiveTab} />
          </View>
          <TouchableOpacity
            onPress={() => setShowFilterModal(true)}
            activeOpacity={0.8}
            className="h-12 w-12 rounded-xl items-center justify-center border"
            style={{
              borderColor: hasActiveFilters ? '#53E076' : 'rgba(188,203,185,0.25)',
              backgroundColor: hasActiveFilters ? 'rgba(83,224,118,0.12)' : '#1A1F1A',
            }}
          >
            <AppIcon family="material-community" name="filter-variant" size={21} color={hasActiveFilters ? '#53E076' : '#BCCBB9'} />
            {hasActiveFilters && (
              <View className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-[#53E076]" />
            )}
          </TouchableOpacity>
        </View>
      </View>

      <View className="flex-1 px-4 z-0">
        <MarketListSection
          isLoading={loading && !isRefreshing}
          isRefreshing={isRefreshing}
          posts={posts}
          activeTab={activeTab}
          currentProfileId={profile?.id ?? ''}
           onRefresh={onRefresh}
          onContactTeam={handleContactTeam}
          onContactPlayer={handleContactPlayer}
          onViewTeamStats={handleViewTeamStats}
          onViewPlayerStats={handleViewPlayerStats}
          onDeletePost={handleDeletePost}
          memberStatusMap={memberStatusMap}
        />
      </View>

      {showCreateButton ? (
        <TouchableOpacity
          onPress={handleCreatePost}
          activeOpacity={0.9}
          className="items-center justify-center z-50 bg-brand-primary"
          style={{
            position: 'absolute', bottom: 110, right: 20, height: 56, width: 56,
            borderRadius: 28, shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.3, shadowRadius: 5, elevation: 5,
          }}
        >
          <AppIcon family="material-icons" name="add" size={28} color="#003914" />
        </TouchableOpacity>
      ) : null}

      <FilterModal
        visible={showFilterModal}
        activeTab={activeTab}
        zone={filterZone}
        selectedDays={filterDays}
        sortBy={filterSort}
        onApply={(zone, days, sortBy) => {
          setFilterZone(zone);
          setFilterDays(days);
          setFilterSort(sortBy);
        }}
        onClose={() => setShowFilterModal(false)}
      />

      <Modal
        visible={!!postPendingDelete}
        transparent
        animationType="fade"
        onRequestClose={() => setPostPendingDelete(null)}
      >
        <View className="flex-1 bg-black/65 items-center justify-center px-6">
          <View className="w-full rounded-2xl border border-surface-high bg-surface-container p-5">
            <Text className="text-neutral-on-surface font-displayBlack text-lg mb-2">Cancelar publicación</Text>
            <Text className="text-neutral-on-surface-variant font-ui text-sm mb-5">
              ¿Seguro que querés cancelar tu publicación? Esta acción la va a sacar del mercado.
            </Text>
            <View className="flex-row gap-3">
              <TouchableOpacity
                onPress={() => setPostPendingDelete(null)}
                activeOpacity={0.8}
                className="flex-1 py-3 rounded-xl bg-surface-high items-center"
              >
                <Text className="text-neutral-on-surface font-uiBold">Volver</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={confirmDeletePost}
                activeOpacity={0.8}
                className="flex-1 py-3 rounded-xl items-center"
                style={{ backgroundColor: 'rgba(255,84,73,0.2)', borderWidth: 1, borderColor: 'rgba(255,84,73,0.5)' }}
              >
                <Text className="text-[#FF8A80] font-uiBold">Sí, cancelar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}
