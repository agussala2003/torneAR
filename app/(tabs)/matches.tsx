import { useCallback, useState } from 'react';
import { ScrollView, Text, View, TouchableOpacity } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { GlobalHeader } from '@/components/GlobalHeader';
import { AppIcon } from '@/components/ui/AppIcon';
import { MatchesSkeleton } from '@/components/matches/MatchesSkeleton';
import { useTeamStore } from '@/stores/teamStore';
import { useCustomAlert } from '@/hooks/useCustomAlert';
import { useTeamMatchesRealtime } from '@/hooks/useTeamMatchesRealtime';
import { fetchMatchesViewData } from '@/lib/matches-data';
import { acceptProposal, rejectProposal, cancelProposal, getProposalErrorMessage } from '@/lib/match-actions';
import { isTeamMatchAdmin, isTeamMatchStaff } from '@/lib/match-permissions';
import { Logger } from '@/lib/logger';
import { MatchCard } from '@/components/matches/MatchCard';
import { LiveMatchBanner } from '@/components/matches/LiveMatchBanner';
import { MatchSectionHeader } from '@/components/matches/MatchSectionHeader';
import { GuestJoinModal } from '@/components/matches/GuestJoinModal';
import type { MatchesViewData } from '@/components/matches/types';

export default function MatchesScreen() {
  const { activeTeamId, activeTeamName, myTeams, setActiveTeam } = useTeamStore();
  const { showAlert, AlertComponent } = useCustomAlert();

  // R2: `get_my_matches` no devuelve el rol, así que las tarjetas mostraban
  // acciones de gestión a todo el plantel y el servidor las rechazaba después
  // del tap. El rol ya vive en el store; mismo patrón que `canChallenge` en la
  // pestaña Ranking (app/(tabs)/ranking.tsx).
  const activeRole = myTeams.find((t) => t.id === activeTeamId)?.role;
  // D10: el predicado de rol también se unificó — los mismos que usa la regla
  // de "cargar resultado" en el detalle y en las tarjetas.
  // R6: son DOS. `canManageMatches` coordina el partido (proponer, aceptar,
  // cancelar); `isMatchStaff` carga el resultado e incluye al DIRECTOR_TECNICO.
  const canManageMatches = isTeamMatchAdmin(activeRole);
  const isMatchStaff = isTeamMatchStaff(activeRole);

  const [loading, setLoading] = useState(true);
  const [viewData, setViewData] = useState<MatchesViewData | null>(null);
  const [showGuestModal, setShowGuestModal] = useState(false);

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
      Logger.error('No se pudieron cargar los partidos del equipo', {
        scope: 'matches.loadData',
        teamId: activeTeamId,
        error: err,
      });
      const msg =
        err instanceof Error
          ? err.message
          : typeof err === 'object' && err !== null && 'message' in err
            ? String((err as { message: unknown }).message)
            : 'No se pudieron cargar los partidos.';
      showAlert('Error', msg);
    } finally {
      setLoading(false);
    }
  }, [activeTeamId, showAlert]);

  useFocusEffect(useCallback(() => { void loadData(); }, [loadData]));

  // Realtime: si el rival acepta, hace check-in o carga el resultado mientras
  // el usuario mira la lista, la tarjeta se actualiza sola. Antes eso sólo se
  // veía al cambiar de tab y volver.
  useTeamMatchesRealtime(activeTeamId ?? undefined, useCallback(() => { void loadData(); }, [loadData]));

  function handleCardPress(matchId: string) {
    router.push({ pathname: '/match-detail' as never, params: { matchId } });
  }

  function handleProposePress(matchId: string) {
    router.push({ pathname: '/match-detail' as never, params: { matchId, openProposalModal: 'true' } });
  }

  function handleLoadResult(matchId: string) {
    router.push({ pathname: '/match-detail' as never, params: { matchId, openResultModal: 'true' } });
  }

  // Quita la propuesta activa de una tarjeta sin esperar el round-trip.
  // Rechazar y cancelar son acciones reversibles y de efecto obvio: mostrar la
  // tarjeta ya sin la propuesta es correcto en el 99% de los casos, y el
  // `loadData()` posterior corrige si el servidor dijo otra cosa.
  function clearProposalOptimistically(matchId: string) {
    setViewData((prev) => {
      if (!prev) return prev;
      const strip = (entries: MatchesViewData['upcomingMatches']) =>
        entries.map((entry) => (entry.id === matchId ? { ...entry, activeProposal: null } : entry));
      return { ...prev, upcomingMatches: strip(prev.upcomingMatches) };
    });
  }

  // En los tres handlers el `await loadData()` va antes del alert: con el
  // refetch diferido al callback de cierre, la lista seguía mostrando la
  // propuesta vieja (y sus botones) hasta que el usuario tocaba "OK".
  async function handleAcceptProposal(proposalId: string, matchId: string) {
    try {
      await acceptProposal(proposalId, matchId);
      Logger.info('Propuesta aceptada desde la lista', { scope: 'matches', matchId, proposalId });
      await loadData();
      showAlert('¡Propuesta aceptada!', 'El partido ha sido confirmado.');
    } catch (err) {
      await loadData();
      // Mismo mapper que el detalle: acá se mostraba `err.message` crudo, que
      // ahora expondría el prefijo estable de la RPC (SQUAD_TOO_SMALL: …).
      Logger.error('Fallo la confirmación de una propuesta', {
        scope: 'matches',
        matchId,
        proposalId,
        error: err,
      });
      showAlert('No se pudo confirmar', getProposalErrorMessage(err));
    }
  }

  async function handleRejectProposal(proposalId: string, matchId: string) {
    clearProposalOptimistically(matchId);
    try {
      await rejectProposal(proposalId);
      await loadData();
      showAlert('Propuesta rechazada', 'Se notificará al equipo rival.');
    } catch (err) {
      await loadData();
      // El rechazo se pintó optimista (clearProposalOptimistically): si falla,
      // el usuario ve la propuesta volver sin explicación.
      Logger.error('Fallo el rechazo de una propuesta', {
        scope: 'matches',
        matchId,
        proposalId,
        error: err,
      });
      const msg = err instanceof Error ? err.message : 'No se pudo rechazar la propuesta.';
      showAlert('Error', msg);
    }
  }

  async function handleCancelProposal(proposalId: string, matchId: string) {
    clearProposalOptimistically(matchId);
    try {
      await cancelProposal(proposalId);
      await loadData();
      showAlert('Propuesta cancelada', 'Tu propuesta fue cancelada.');
    } catch (err) {
      await loadData();
      Logger.error('Fallo la cancelación de una propuesta', {
        scope: 'matches',
        matchId,
        proposalId,
        error: err,
      });
      const msg = err instanceof Error ? err.message
        : typeof err === 'object' && err !== null && 'message' in err
          ? String((err as { message: unknown }).message)
          : 'No se pudo cancelar la propuesta.';
      showAlert('Error', msg);
    }
  }

  // Esqueleto solo en la primera carga. Con `if (loading)` a secas, cada regreso
  // a la tab borraba la lista completa y mostraba un loader a pantalla entera.
  const isInitialLoad = loading && !viewData;

  return (
    <View className="flex-1 bg-surface-base">
      <GlobalHeader />

      {/* Guest join banner — always visible */}
      <TouchableOpacity
        onPress={() => setShowGuestModal(true)}
        activeOpacity={0.8}
        className="mx-4 mt-3 flex-row items-center gap-2 rounded-xl border border-brand-primary/20 bg-brand-primary/8 px-4 py-2.5"
      >
        <AppIcon family="material-community" name="ticket-confirmation-outline" size={16} color="#53E076" />
        <Text className="font-uiBold flex-1 text-sm text-brand-primary">
          ¿Te invitaron a un partido? Ingresá el código
        </Text>
        <AppIcon family="material-community" name="chevron-right" size={18} color="#53E076" />
      </TouchableOpacity>

      {/* Carga inicial */}
      {isInitialLoad && <MatchesSkeleton />}

      {/* No team selected */}
      {!isInitialLoad && !activeTeamId && (
        <View className="flex-1 items-center justify-center px-6">
          <Text className="font-displayBlack text-2xl text-neutral-on-surface">Partidos</Text>
          <Text className="font-ui mt-2 text-center text-neutral-on-surface-variant">
            Seleccioná un equipo para ver tus partidos.
          </Text>
        </View>
      )}

      {!isInitialLoad && activeTeamId && (
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
              isStaff={isMatchStaff}
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
              {viewData?.upcomingMatches.map((entry, index) => (
                <MatchCard
                  key={entry.id}
                  entry={entry}
                  index={index}
                  myTeamId={activeTeamId}
                  canManage={canManageMatches}
                  isStaff={isMatchStaff}
                  onPress={handleCardPress}
                  onProposePress={handleProposePress}
                  onAcceptProposal={(pId, mId) => void handleAcceptProposal(pId, mId)}
                  onRejectProposal={(pId, mId) => void handleRejectProposal(pId, mId)}
                  onCancelProposal={(pId, mId) => void handleCancelProposal(pId, mId)}
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
              {viewData?.historyMatches.map((entry, index) => (
                <MatchCard
                  key={entry.id}
                  entry={entry}
                  index={index}
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

      <GuestJoinModal
        visible={showGuestModal}
        onClose={() => setShowGuestModal(false)}
        onJoined={(matchId, myTeamId) =>
          router.push({ pathname: '/match-detail' as never, params: { matchId, myTeamId } })
        }
      />

      {AlertComponent}
    </View>
  );
}
