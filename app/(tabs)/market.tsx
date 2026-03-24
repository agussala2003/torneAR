import React, { useState, useCallback } from 'react';
import { View, Text, TouchableOpacity, Modal, ActivityIndicator } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';

import { GlobalHeader } from '@/components/GlobalHeader';
import { AppIcon } from '@/components/ui/AppIcon';
import { MarketTabs } from '@/components/market/MarketTabs';
import { PositionFilterScroll } from '@/components/market/PositionFilterScroll';
import { MarketListSection } from '@/components/market/MarketListSection';
import { MarketCreateContent } from '@/app/(modals)/market-create';
import { useAuth } from '@/context/AuthContext';
import { GlobalLoader } from '@/components/GlobalLoader';
import { useCustomAlert } from '@/hooks/useCustomAlert';
import { fetchMarketViewData } from '@/lib/market-data';
import { MarketViewData, TabType } from '@/components/market/types';
import { getOrCreateMarketChat } from '@/lib/chat-api';

export default function MarketScreen() {
  const router = useRouter();
  const { profile } = useAuth();
  const { showAlert, AlertComponent } = useCustomAlert();

  const [activeTab, setActiveTab] = useState<TabType>('TEAMS_LOOKING');
  const [selectedPosition, setSelectedPosition] = useState<string>('CUALQUIERA');

  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [viewData, setViewData] = useState<MarketViewData | null>(null);

  const [isContactLoading, setIsContactLoading] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
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
      showAlert(
        'Error',
        'No se pudo cargar la informacion del mercado.'
      );
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

  const handleCreatePost = () => {
    setShowCreateModal(true);
  };

  const handleContactTeam = async (teamId: string) => {
    if (!profile) return;
    setIsContactLoading(true);
    try {
      const chat = await getOrCreateMarketChat(profile.id, teamId);
      router.push(`/market-chats/${chat.id}` as any);
    } catch (e) {
      showAlert('Error', 'No se pudo abrir el chat. Intenta de nuevo.');
    } finally {
      setIsContactLoading(false);
    }
  };

  const handleContactPlayer = async (playerProfileId: string) => {
    if (!profile || !viewData) return;

    if (viewData.managedTeams.length === 0) {
      showAlert(
        'Sin equipos',
        'Debes ser Capitan o Subcapitan de un equipo para contactar jugadores.'
      );
      return;
    }

    const teamId = activeCaptainTeamId ?? viewData.managedTeams[0].id;

    setIsContactLoading(true);
    try {
      const chat = await getOrCreateMarketChat(playerProfileId, teamId);
      router.push(`/market-chats/${chat.id}` as any);
    } catch (e) {
      showAlert('Error', 'No se pudo abrir el chat. Intenta de nuevo.');
    } finally {
      setIsContactLoading(false);
    }
  };

  if (!profile && !loading) {
    return (
      <View className="flex-1 items-center justify-center bg-surface-base px-6">
        <Text className="font-display text-xl text-neutral-on-surface">Mercado no disponible</Text>
        {AlertComponent}
      </View>
    );
  }

  const posts = viewData 
    ? (activeTab === 'TEAMS_LOOKING' ? viewData.teamPosts : viewData.playerPosts)
    : [];

  return (
    <View className="flex-1 bg-surface-base">
      <GlobalHeader />

      <View className="pt-4">
        <MarketTabs activeTab={activeTab} onTabChange={setActiveTab} />
        <PositionFilterScroll
          selectedPosition={selectedPosition}
          onPositionSelect={setSelectedPosition}
        />

        {activeTab === 'PLAYERS_LOOKING' && viewData && viewData.managedTeams.length > 1 && (
          <View className="px-4 pt-3">
            <Text className="mb-2 font-uiMedium text-xs text-neutral-on-surface-variant">
              Contactar como:
            </Text>
            <View className="flex-row flex-wrap gap-2">
              {viewData.managedTeams.map((team) => (
                <TouchableOpacity
                  key={team.id}
                  onPress={() => setActiveCaptainTeamId(team.id)}
                  activeOpacity={0.7}
                  className={`rounded-full border px-3 py-1.5 ${
                    activeCaptainTeamId === team.id
                      ? 'border-brand-primary bg-brand-primary'
                      : 'border-surface-high bg-surface-low'
                  }`}
                >
                  <Text
                    className={`font-uiBold text-xs ${
                      activeCaptainTeamId === team.id ? 'text-[#003914]' : 'text-neutral-on-surface-variant'
                    }`}
                  >
                    {team.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        <TouchableOpacity
          className="flex-row items-center border-b border-surface-high px-4 py-3"
          onPress={() => router.push('/market-chats' as any)}
          activeOpacity={0.7}
        >
          <AppIcon family="material-icons" name="chat-bubble-outline" size={18} color="#00E65B" />
          <Text className="ml-2 font-uiMedium text-sm text-brand-primary">Mis Chats de Mercado</Text>
          <View className="flex-1" />
          <AppIcon family="material-icons" name="chevron-right" size={18} color="#88998D" />
        </TouchableOpacity>
      </View>

      <View className="flex-1 px-4">
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
        className="absolute bottom-6 right-6 h-14 w-14 items-center justify-center rounded-full bg-brand-primary"
        onPress={handleCreatePost}
        activeOpacity={0.9}
        style={{
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.3,
          shadowRadius: 5,
          elevation: 5,
        }}
      >
        <AppIcon family="material-icons" name="add" size={28} color="#003914" />
      </TouchableOpacity>

      <Modal
        visible={showCreateModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowCreateModal(false)}
      >
        <MarketCreateContent onClose={() => setShowCreateModal(false)} />
      </Modal>

      {isContactLoading && <GlobalLoader label="Abriendo chat..." />}

      {AlertComponent}
    </View>
  );
}
