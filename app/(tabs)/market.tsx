import React, { useState, useCallback } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator } from 'react-native';
import { router, useFocusEffect } from 'expo-router';

import { GlobalHeader } from '@/components/GlobalHeader';
import { AppIcon } from '@/components/ui/AppIcon';
import { MarketTabs } from '@/components/market/MarketTabs';
import { PositionFilterScroll } from '@/components/market/PositionFilterScroll';
import { MarketListSection } from '@/components/market/MarketListSection';
import { useAuth } from '@/context/AuthContext';
import { useUI } from '@/context/UIContext';
import { fetchMarketViewData } from '@/lib/market-data';
import { MarketViewData, TabType } from '@/components/market/types';
import { getOrCreateMarketChat } from '@/lib/chat-api';

export default function MarketScreen() {
  const { profile } = useAuth();
  const { showAlert, showLoader, hideLoader } = useUI();

  const [activeTab, setActiveTab] = useState<TabType>('TEAMS_LOOKING');
  const [selectedPosition, setSelectedPosition] = useState<string>('CUALQUIERA');

  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [viewData, setViewData] = useState<MarketViewData | null>(null);

  const [activeCaptainTeamId, setActiveCaptainTeamId] = useState<string | null>(null);

  const loadMarketData = useCallback(async (showFullLoader = true) => {
    if (!profile) {
      setLoading(false);
      return;
    }

    try {
      if (showFullLoader) setLoading(true);
      const data = await fetchMarketViewData(profile, selectedPosition);
      setViewData(data);

      if (data.managedTeams.length > 0) {
        setActiveCaptainTeamId((current) => current ?? data.managedTeams[0].id);
      }
    } catch (error) {
      showAlert('Error', 'No se pudo cargar la informacion del mercado.');
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  }, [profile, selectedPosition, showAlert]);

  useFocusEffect(
    useCallback(() => {
      void loadMarketData(true);
    }, [loadMarketData])
  );

  const onRefresh = () => {
    setIsRefreshing(true);
    void loadMarketData(false);
  };

  // CAUSA 1 SOLUCIONADA: Navegamos a la ruta del modal en lugar de renderizar el Modal aquí
  const handleCreatePost = () => {
    router.push('/(modals)/market-create');
  };

  const handleContactTeam = async (teamId: string) => {
    if (!profile) return;
    showLoader('Abriendo chat...');
    try {
      const chat = await getOrCreateMarketChat(profile.id, teamId);
      router.push(`/market-chats/${chat.id}` as any);
    } catch (e) {
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
    } catch (e) {
      showAlert('Error', 'No se pudo abrir el chat. Intenta de nuevo.');
    } finally {
      hideLoader();
    }
  };

  if (!profile && !loading) {
    return (
      <View className="flex-1 items-center justify-center bg-surface-base px-6">
        <Text className="font-display text-xl text-neutral-on-surface">Mercado no disponible</Text>
      </View>
    );
  }

  const posts = viewData
    ? (activeTab === 'TEAMS_LOOKING' ? viewData.teamPosts : viewData.playerPosts)
    : [];

  return (
    <View className="flex-1 bg-surface-base">
      <GlobalHeader isMarketTab />
      <View className="px-4 pt-4 pb-2 z-10">
        <MarketTabs activeTab={activeTab} onTabChange={setActiveTab} />
        <PositionFilterScroll
          selectedPosition={selectedPosition}
          onPositionSelect={setSelectedPosition}
        />
      </View>

      <View className="flex-1 px-4 z-0">
        <MarketListSection
          isLoading={loading && !isRefreshing}
          isRefreshing={isRefreshing}
          posts={posts}
          activeTab={activeTab}
          onRefresh={onRefresh}
          onContactTeam={handleContactTeam}
          onContactPlayer={handleContactPlayer}
        />
      </View>

      <TouchableOpacity
        onPress={handleCreatePost}
        activeOpacity={0.9} // Usamos activeOpacity nativo SIEMPRE en vez de active: de Tailwind
        className="items-center justify-center z-50 bg-brand-primary"
        style={{
          position: 'absolute', bottom: 110, right: 20, height: 56, width: 56,
          borderRadius: 28, shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.3, shadowRadius: 5, elevation: 5,
        }}
      >
        <AppIcon family="material-icons" name="add" size={28} color="#003914" />
      </TouchableOpacity>
    </View>
  );
}