import { useCallback, useState } from 'react';
import { ScrollView, Text, View, TouchableOpacity } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useAuth } from '@/context/AuthContext';
import { useTeamStore } from '@/stores/teamStore';
import { GlobalHeader } from '@/components/GlobalHeader';
import { AppIcon } from '@/components/ui/AppIcon';
import { useCustomAlert } from '@/hooks/useCustomAlert';
import { supabase } from '@/lib/supabase';
import { fetchRankingWithFilters, searchRivalTeams, fetchPlayerLeaderboard } from '@/lib/ranking-data';
import type { RankingFiltersState, RankingMode, LeaderboardStat, RankingTeamEntry, RivalTeamEntry, PlayerLeaderboardEntry } from '@/components/ranking/types';

import { RankingFilterModal } from '@/components/ranking/RankingFilterModal';
import { RankingTable } from '@/components/ranking/RankingTable';
import { RankingRowSkeleton } from '@/components/ranking/RankingRowSkeleton';
import { RivalSearchBar } from '@/components/ranking/RivalSearchBar';
import { RivalTeamCard } from '@/components/ranking/RivalTeamCard';
import { PlayerLeaderboard } from '@/components/ranking/PlayerLeaderboard';

// Helper para parsear la categoría para el texto
const getCategoryLabel = (cat: string | null) => {
  if (!cat) return 'Todas las categorías';
  return cat.charAt(0) + cat.slice(1).toLowerCase();
};

export default function RankingScreen() {
  const { profile } = useAuth();
  const { activeTeamId, myTeams } = useTeamStore();
  const { showAlert, AlertComponent } = useCustomAlert();

  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<RankingMode>('RANKING');

  const [filters, setFilters] = useState<RankingFiltersState>({
    zone: null, category: null, format: null, rivalesIdeales: false,
  });
  const [isFilterModalVisible, setFilterModalVisible] = useState(false);

  const [rankingEntries, setRankingEntries] = useState<RankingTeamEntry[]>([]);
  const [activeTeamElo, setActiveTeamElo] = useState<number | null>(null);
  const [activeSeason, setActiveSeason] = useState<{ id: string; name: string } | null>(null);

  // NUEVO: Estado para guardar las zonas de la BD
  const [availableZones, setAvailableZones] = useState<string[]>([]);

  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<RivalTeamEntry[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);

  const [leaderboardStat, setLeaderboardStat] = useState<LeaderboardStat>('goals');
  const [leaderboardEntries, setLeaderboardEntries] = useState<PlayerLeaderboardEntry[]>([]);
  const [leaderboardLoading, setLeaderboardLoading] = useState(false);

  const userTeamIds = myTeams.map(t => t.id);
  const activeRole = myTeams.find(t => t.id === activeTeamId)?.role;
  const canChallenge = activeRole === 'CAPITAN' || activeRole === 'SUBCAPITAN';

  const loadInitialData = useCallback(async () => {
    if (!profile) return;
    try {
      setLoading(true);

      // Cargamos la temporada activa y las zonas activas en paralelo
      const [seasonRes, zonesRes] = await Promise.all([
        supabase.from('seasons').select('id, name').eq('is_active', true).maybeSingle(),
        supabase.from('zones').select('name').eq('is_active', true).order('name')
      ]);

      setActiveSeason(seasonRes.data);
      if (zonesRes.data) {
        setAvailableZones(zonesRes.data.map(z => z.name));
      }

      // Compute teamIds here to avoid a stale-closure / unstable-array dep
      const teamIds = myTeams.map(t => t.id);

      let elo = null;
      let initialFilters: RankingFiltersState = { zone: null, category: null, format: null, rivalesIdeales: false };
      if (activeTeamId) {
        const { data: team } = await supabase.from('teams').select('elo_rating, zone, category, preferred_format').eq('id', activeTeamId).single();
        if (team) {
          elo = team.elo_rating;
          setActiveTeamElo(elo);
          initialFilters = { zone: team.zone, category: team.category as any, format: team.preferred_format as any, rivalesIdeales: false };
          setFilters(initialFilters);
        }
      }

      const activeTeamName = myTeams.find(t => t.id === activeTeamId)?.name ?? null;
      const [ranking, players] = await Promise.all([
        fetchRankingWithFilters(initialFilters, teamIds, elo),
        fetchPlayerLeaderboard('goals', initialFilters.zone, seasonRes.data?.id || null, {
          profileId: profile.id, fullName: profile.full_name, avatarUrl: profile.avatar_url ?? null,
          teamId: activeTeamId ?? null, teamName: activeTeamName,
        })
      ]);
      setRankingEntries(ranking);
      setLeaderboardEntries(players);

    } catch (error: any) {
      showAlert('Error', error.message || 'No se pudo cargar el ranking.');
    } finally {
      setLoading(false);
    }
  }, [profile, activeTeamId, showAlert, myTeams]);

  useFocusEffect(useCallback(() => { loadInitialData(); }, [loadInitialData]));

  async function handleApplyFilters(newFilters: RankingFiltersState) {
    setFilters(newFilters);
    if (mode === 'RANKING') {
      try {
        setLoading(true);
        const ranking = await fetchRankingWithFilters(newFilters, userTeamIds, activeTeamElo);
        setRankingEntries(ranking);

        setLeaderboardLoading(true);
        const activeTeamName = myTeams.find(t => t.id === activeTeamId)?.name ?? null;
        const players = await fetchPlayerLeaderboard(leaderboardStat, newFilters.zone, activeSeason?.id || null, profile ? { profileId: profile.id, fullName: profile.full_name, avatarUrl: profile.avatar_url ?? null, teamId: activeTeamId ?? null, teamName: activeTeamName } : undefined);
        setLeaderboardEntries(players);
      } catch (error: any) {
        showAlert('Error', error.message || 'Error al aplicar filtros.');
      } finally {
        setLoading(false);
        setLeaderboardLoading(false);
      }
    } else {
      handleSearch(searchQuery, newFilters);
    }
  }

  async function handleSearch(query: string, currentFilters = filters) {
    setSearchQuery(query);
    try {
      setSearchLoading(true);
      const results = await searchRivalTeams(query, currentFilters, userTeamIds, activeTeamElo);
      setSearchResults(results);
    } catch (error: any) {
      showAlert('Error', error.message || 'Error en la búsqueda.');
    } finally {
      setSearchLoading(false);
    }
  }

  async function handleStatChange(stat: LeaderboardStat) {
    setLeaderboardStat(stat);
    try {
      setLeaderboardLoading(true);
      const activeTeamName = myTeams.find(t => t.id === activeTeamId)?.name ?? null;
      const players = await fetchPlayerLeaderboard(stat, filters.zone, activeSeason?.id || null, profile ? { profileId: profile.id, fullName: profile.full_name, avatarUrl: profile.avatar_url ?? null, teamId: activeTeamId ?? null, teamName: activeTeamName } : undefined);
      setLeaderboardEntries(players);
    } catch (error: any) {
      showAlert('Error', error.message || 'Error al cargar jugadores.');
    } finally {
      setLeaderboardLoading(false);
    }
  }

  // Saber si hay filtros activos para prender el icono
  const hasActiveFilters = Boolean(filters.zone || filters.category || filters.format || filters.rivalesIdeales);

  // Chips de contexto activo
  const contextChips = [
    activeSeason?.name ? { label: activeSeason.name, accent: false } : null,
    filters.zone ? { label: filters.zone, accent: true } : { label: 'Global', accent: false },
    filters.format ? { label: filters.format.replace('FUTBOL_', 'F'), accent: true } : null,
    filters.category ? { label: getCategoryLabel(filters.category), accent: true } : null,
    filters.rivalesIdeales ? { label: '🎯 Ideales', accent: true } : null,
  ].filter(Boolean) as { label: string; accent: boolean }[];


  return (
    <View className="flex-1 bg-surface-base">
      <GlobalHeader isRankingTab={true} />

      <ScrollView className="px-4 pt-4" contentContainerStyle={{ paddingBottom: 120 }} keyboardShouldPersistTaps="handled">

        {/* Nueva cabecera: Tabs + Botón Filtro + Texto */}
        <View className="mb-3">
          <View className="flex-row items-center gap-2">

            {/* Tabs (Mismo diseño que Market) */}
            <View className="flex-1 flex-row gap-2 rounded-xl bg-surface-low p-1">
              <TouchableOpacity
                className="flex-1 items-center rounded-lg py-3"
                style={mode === 'RANKING' ? { backgroundColor: '#53E076' } : undefined}
                onPress={() => setMode('RANKING')}
                activeOpacity={0.8}
              >
                <Text className="font-uiBold text-sm" style={{ color: mode === 'RANKING' ? '#003914' : '#BCCBB9' }}>
                  Ranking
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                className="flex-1 items-center rounded-lg py-3"
                style={mode === 'RIVALES' ? { backgroundColor: '#53E076' } : undefined}
                onPress={() => setMode('RIVALES')}
                activeOpacity={0.8}
              >
                <Text className="font-uiBold text-sm" style={{ color: mode === 'RIVALES' ? '#003914' : '#BCCBB9' }}>
                  Buscar Rival
                </Text>
              </TouchableOpacity>
            </View>

            {/* Botón Filtro Cuadrado */}
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={() => setFilterModalVisible(true)}
              className={`h-[48px] w-[48px] items-center justify-center rounded-xl border ${hasActiveFilters ? 'border-brand-primary/30 bg-brand-primary/10' : 'border-transparent bg-surface-low'
                }`}
            >
              <AppIcon family="material-community" name="tune" size={20} color={hasActiveFilters ? '#53E076' : '#BCCBB9'} />
            </TouchableOpacity>

          </View>

          {/* Chips de contexto */}
          <View className="mt-2.5 flex-row flex-wrap gap-1.5 px-0.5">
            {contextChips.map((chip) => (
              <View
                key={chip.label}
                className={`rounded-full px-2.5 py-1 ${chip.accent ? 'bg-brand-primary/15' : 'bg-surface-high'}`}
              >
                <Text className={`font-uiBold text-[10px] ${chip.accent ? 'text-brand-primary' : 'text-neutral-on-surface-variant'}`}>
                  {chip.label}
                </Text>
              </View>
            ))}
          </View>
        </View>

        {/* MODO RANKING */}
        {mode === 'RANKING' && (
          <>
            {loading ? (
              Array.from({ length: 6 }).map((_, i) => <RankingRowSkeleton key={i} />)
            ) : (
              <>
                <RankingTable entries={rankingEntries} onTeamPress={(id: string) => router.push({ pathname: '/team-stats', params: { teamId: id, viewerTeamId: activeTeamId || '' } })} />
                <PlayerLeaderboard entries={leaderboardEntries} activeStat={leaderboardStat} onStatChange={handleStatChange} loading={leaderboardLoading} />
              </>
            )}
          </>
        )}

        {/* MODO RIVALES */}
        {mode === 'RIVALES' && (
          <>
            <RivalSearchBar value={searchQuery} onChangeText={(q) => handleSearch(q, filters)} />

            {searchLoading ? (
              <View className="mt-2">
                {Array.from({ length: 5 }).map((_, i) => <RankingRowSkeleton key={i} />)}
              </View>
            ) : searchResults.length === 0 ? (
              <Text className="mt-8 text-center font-ui text-sm text-neutral-on-surface-variant">
                {searchQuery ? 'No se encontraron equipos con ese nombre o filtros.' : 'Escribí el nombre de un equipo para buscar.'}
              </Text>
            ) : (
              <View className="mt-2">
                {searchResults.map(entry => (
                  <RivalTeamCard
                    key={entry.teamId}
                    entry={entry}
                    canChallenge={canChallenge}
                    onPress={(id) => router.push({ pathname: '/team-stats', params: { teamId: id, viewerTeamId: activeTeamId || '' } })}
                  />
                ))}
              </View>
            )}
          </>
        )}
      </ScrollView>

      <RankingFilterModal
        visible={isFilterModalVisible}
        onClose={() => setFilterModalVisible(false)}
        filters={filters}
        onApply={handleApplyFilters}
        availableZones={availableZones}
      />
      {AlertComponent}
    </View>
  );
}