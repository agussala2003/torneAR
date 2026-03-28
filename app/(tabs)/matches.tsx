import { useCallback, useState } from 'react';
import { ScrollView, Text, View, TouchableOpacity } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { GlobalHeader } from '@/components/GlobalHeader';
import { GlobalLoader } from '@/components/GlobalLoader';
import { useTeamStore } from '@/stores/teamStore';
import { useCustomAlert } from '@/hooks/useCustomAlert';
import { fetchMatchesViewData } from '@/lib/matches-data';
import { acceptProposal, rejectProposal } from '@/lib/match-actions';
import { MatchCard } from '@/components/matches/MatchCard';
import { LiveMatchBanner } from '@/components/matches/LiveMatchBanner';
import { MatchSectionHeader } from '@/components/matches/MatchSectionHeader';
import type { MatchesViewData } from '@/components/matches/types';

export default function MatchesScreen() {
  const { activeTeamId, activeTeamName, myTeams, setActiveTeam } = useTeamStore();
  const { showAlert, AlertComponent } = useCustomAlert();

  const [loading, setLoading] = useState(true);
  const [viewData, setViewData] = useState<MatchesViewData | null>(null);

  const loadData = useCallback(async () => {
    if (!activeTeamId) {
      setLoading(false);
      setViewData(null);
      return;
    }
    try {
      setLoading(true);
      const data = await fetchMatchesViewData(activeTeamId);
      setViewData(data);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'No se pudieron cargar los partidos.';
      showAlert('Error', msg);
    } finally {
      setLoading(false);
    }
  }, [activeTeamId, showAlert]);

  useFocusEffect(useCallback(() => { void loadData(); }, [loadData]));

  function handleCardPress(matchId: string) {
    router.push({ pathname: '/match-detail' as never, params: { matchId } });
  }

  function handleProposePress(matchId: string) {
    router.push({ pathname: '/match-detail' as never, params: { matchId, openProposalModal: 'true' } });
  }

  function handleLoadResult(matchId: string) {
    router.push({ pathname: '/match-detail' as never, params: { matchId, openResultModal: 'true' } });
  }

  async function handleAcceptProposal(proposalId: string, matchId: string) {
    try {
      await acceptProposal(proposalId, matchId);
      showAlert('¡Propuesta aceptada!', 'El partido ha sido confirmado.', () => void loadData());
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'No se pudo aceptar la propuesta.';
      showAlert('Error', msg);
    }
  }

  async function handleRejectProposal(proposalId: string, _matchId: string) {
    try {
      await rejectProposal(proposalId);
      showAlert('Propuesta rechazada', 'Se notificará al equipo rival.', () => void loadData());
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'No se pudo rechazar la propuesta.';
      showAlert('Error', msg);
    }
  }

  if (loading) return <GlobalLoader label="Cargando partidos..." />;

  return (
    <View className="flex-1 bg-surface-base">
      <GlobalHeader />

      {/* No team selected */}
      {!activeTeamId && (
        <View className="flex-1 items-center justify-center px-6">
          <Text className="font-displayBlack text-2xl text-neutral-on-surface">Partidos</Text>
          <Text className="font-ui mt-2 text-center text-neutral-on-surface-variant">
            Seleccioná un equipo para ver tus partidos.
          </Text>
        </View>
      )}

      {activeTeamId && (
        <ScrollView
          className="px-4"
          contentContainerStyle={{ paddingTop: 18, paddingBottom: 114 }}
          showsVerticalScrollIndicator={false}
        >
          {/* Team selector banner */}
          <View className="mb-4 flex-row items-center justify-between rounded-2xl bg-surface-container px-4 py-3">
            <View>
              <Text className="font-ui text-[10px] uppercase tracking-widest text-neutral-outline">
                Equipo activo
              </Text>
              <Text className="font-uiBold text-[14px] text-neutral-on-surface">
                {activeTeamName ?? '—'}
              </Text>
            </View>
            {myTeams.length > 1 && (
              <View className="flex-row gap-2">
                {myTeams.map((t) => (
                  t.id !== activeTeamId ? (
                    <TouchableOpacity
                      key={t.id}
                      activeOpacity={0.8}
                      onPress={() => setActiveTeam(t.id, t.name)}
                      className="rounded-xl border border-neutral-outline/30 px-3 py-1.5"
                    >
                      <Text className="font-uiBold text-[11px] text-neutral-on-surface-variant">
                        {t.name}
                      </Text>
                    </TouchableOpacity>
                  ) : null
                ))}
              </View>
            )}
          </View>

          {/* Live match banner */}
          {viewData?.liveMatch && (
            <LiveMatchBanner
              match={viewData.liveMatch}
              myTeamId={activeTeamId}
              onPress={handleCardPress}
              onLoadResult={handleLoadResult}
            />
          )}

          {/* Upcoming matches */}
          {(viewData?.upcomingMatches.length ?? 0) > 0 && (
            <>
              <MatchSectionHeader
                title="Próximos"
                count={viewData?.upcomingMatches.length}
              />
              {viewData?.upcomingMatches.map((entry) => (
                <MatchCard
                  key={entry.id}
                  entry={entry}
                  myTeamId={activeTeamId}
                  onPress={handleCardPress}
                  onProposePress={handleProposePress}
                  onAcceptProposal={(pId, mId) => void handleAcceptProposal(pId, mId)}
                  onRejectProposal={(pId, mId) => void handleRejectProposal(pId, mId)}
                  onLoadResult={handleLoadResult}
                />
              ))}
            </>
          )}

          {/* History */}
          {(viewData?.historyMatches.length ?? 0) > 0 && (
            <>
              <MatchSectionHeader
                title="Historial"
                count={viewData?.historyMatches.length}
              />
              {viewData?.historyMatches.map((entry) => (
                <MatchCard
                  key={entry.id}
                  entry={entry}
                  myTeamId={activeTeamId}
                  onPress={handleCardPress}
                />
              ))}
            </>
          )}

          {/* Empty state */}
          {!viewData?.liveMatch &&
            (viewData?.upcomingMatches.length ?? 0) === 0 &&
            (viewData?.historyMatches.length ?? 0) === 0 && (
              <View className="mt-16 items-center px-6">
                <Text className="font-displayBlack text-[18px] text-neutral-on-surface">
                  Sin partidos
                </Text>
                <Text className="font-ui mt-2 text-center text-[13px] text-neutral-on-surface-variant">
                  Aceptá un desafío en el Ranking para crear tu primer partido.
                </Text>
              </View>
            )}
        </ScrollView>
      )}

      {AlertComponent}
    </View>
  );
}
