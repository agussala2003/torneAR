import { useState, useCallback, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { useLocalSearchParams, router, useFocusEffect } from 'expo-router';
import * as Location from 'expo-location';
import { useTeamStore } from '@/stores/teamStore';
import { useAuth } from '@/context/AuthContext';
import { useCustomAlert } from '@/hooks/useCustomAlert';
import { getGenericSupabaseErrorMessage } from '@/lib/auth-error-messages';
import { fetchMatchDetailViewData, fetchDisputeState } from '@/lib/match-detail-data';
import type { DisputeState } from '@/lib/match-detail-data';
import * as Clipboard from 'expo-clipboard';
import {
  submitProposal,
  acceptProposal,
  rejectProposal,
  cancelProposal,
  submitMatchResult,
  doCheckin,
  requestCancellation,
  claimWo,
  submitDisputeVote,
  resolveMatchDispute,
} from '@/lib/match-actions';
import { GlobalLoader } from '@/components/GlobalLoader';
import { AppIcon } from '@/components/ui/AppIcon';
import { MatchDetailHero } from '@/components/matches/MatchDetailHero';
import { ProposalSection } from '@/components/matches/ProposalSection';
import { MatchDetailsSection } from '@/components/matches/MatchDetailsSection';
import { CheckinSection } from '@/components/matches/CheckinSection';
import { ResultSection } from '@/components/matches/ResultSection';
import { ProposalModal } from '@/components/matches/ProposalModal';
import { ResultModal } from '@/components/matches/ResultModal';
import { CancellationModal } from '@/components/matches/CancellationModal';
import { WoModal } from '@/components/matches/WoModal';
import { DisputeSection } from '@/components/matches/DisputeSection';
import type { MatchDetailViewData, MatchProposalFormData } from '@/components/matches/types';

export default function MatchDetailScreen() {
  const { matchId, myTeamId: paramTeamId, openProposalModal, openResultModal } = useLocalSearchParams<{
    matchId: string;
    myTeamId?: string;
    openProposalModal?: string;
    openResultModal?: string;
  }>();
  const { activeTeamId } = useTeamStore();
  const myTeamId = paramTeamId ?? activeTeamId ?? '';
  const { profile } = useAuth();

  const { showAlert, AlertComponent } = useCustomAlert();

  const [loading, setLoading] = useState(true);
  const [match, setMatch] = useState<MatchDetailViewData | null>(null);
  const [disputeState, setDisputeState] = useState<DisputeState | null>(null);

  // Modal visibility state
  const [showProposalModal, setShowProposalModal] = useState(false);
  const [showResultModal, setShowResultModal] = useState(false);
  const [showCancellationModal, setShowCancellationModal] = useState(false);
  const [showWoModal, setShowWoModal] = useState(false);

  const loadData = useCallback(async () => {
    if (!matchId || !myTeamId) {
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      const data = await fetchMatchDetailViewData(matchId, myTeamId);
      setMatch(data);
      if (data.status === 'EN_DISPUTA' && profile?.id) {
        const dispute = await fetchDisputeState(matchId, profile.id, data.teamA.id, data.teamB.id);
        setDisputeState(dispute);
      } else {
        setDisputeState(null);
      }
    } catch (err) {
      showAlert('Error', getGenericSupabaseErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [matchId, myTeamId, profile?.id, showAlert]);

  useFocusEffect(useCallback(() => { void loadData(); }, [loadData]));

  // Auto-open modal from navigation params once data loads
  useEffect(() => {
    if (!loading && match) {
      if (openProposalModal === 'true') setShowProposalModal(true);
      if (openResultModal === 'true') setShowResultModal(true);
    }
  }, [loading, match, openProposalModal, openResultModal]);

  async function handleAcceptProposal() {
    if (!match?.activeProposal) return;
    try {
      await acceptProposal(match.activeProposal.id, match.id);
      showAlert('¡Propuesta aceptada!', 'El partido ha sido confirmado.', () => void loadData());
    } catch (err) {
      showAlert('Error', getGenericSupabaseErrorMessage(err));
    }
  }

  async function handleRejectProposal() {
    if (!match?.activeProposal) return;
    try {
      await rejectProposal(match.activeProposal.id);
      showAlert('Propuesta rechazada', 'Se notificará al equipo rival.', () => void loadData());
    } catch (err) {
      showAlert('Error', getGenericSupabaseErrorMessage(err));
    }
  }

  async function handleCancelProposal() {
    if (!match?.activeProposal) return;
    try {
      await cancelProposal(match.activeProposal.id);
      showAlert('Propuesta cancelada', 'Tu propuesta fue cancelada.', () => void loadData());
    } catch (err) {
      showAlert('Error', getGenericSupabaseErrorMessage(err));
    }
  }

  async function handleProposalSubmit(data: MatchProposalFormData) {
    if (!match) return;
    try {
      await submitProposal(match.id, myTeamId, data);
      showAlert('Propuesta enviada', 'El rival recibirá tu propuesta.', () => void loadData());
    } catch (err) {
      showAlert('Error', getGenericSupabaseErrorMessage(err));
    }
  }

  async function handleCheckin() {
    if (!match) return;
    try {
      // Request location permission and get coords for geofence validation
      let coords: { lat: number; lng: number } | undefined;
      if (match.venueId) {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
          showAlert(
            'Permiso requerido',
            'Para hacer check-in necesitamos acceder a tu ubicación y verificar que estás en la cancha.',
          );
          return;
        }
        const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
        coords = { lat: position.coords.latitude, lng: position.coords.longitude };
      }

      await doCheckin(match.id, myTeamId, coords);
      showAlert('¡Check-in realizado!', 'Marcaste tu llegada al partido.', () => void loadData());
    } catch (err) {
      showAlert('Error', getGenericSupabaseErrorMessage(err));
    }
  }

  async function handleVoteSubmit(teamId: string) {
    if (!match) return;
    try {
      await submitDisputeVote(match.id, teamId);
      showAlert('¡Voto registrado!', 'Tu voto fue enviado correctamente.', () => void loadData());
    } catch (err) {
      showAlert('Error', getGenericSupabaseErrorMessage(err));
    }
  }

  async function handleDisputeResolve() {
    if (!match) return;
    try {
      const result = await resolveMatchDispute(match.id);
      const winnerName =
        result.winnerTeamId === match.teamA.id ? match.teamA.name : match.teamB.name;
      const method =
        result.resolutionMethod === 'votes' ? 'por votación' : 'por Fair Play Score';
      showAlert(
        '¡Disputa resuelta!',
        `Ganó ${winnerName} ${method}. El partido pasó a FINALIZADO.`,
        () => void loadData(),
      );
    } catch (err) {
      showAlert('Error', getGenericSupabaseErrorMessage(err));
    }
  }

  function isLateForCancellation(): boolean {
    if (!match?.scheduledAt) return false;
    const diff = new Date(match.scheduledAt).getTime() - Date.now();
    return diff < 24 * 60 * 60 * 1000;
  }

  if (loading) return <GlobalLoader label="Cargando partido..." />;

  if (!match) {
    return (
      <View className="flex-1 items-center justify-center bg-surface-base px-6">
        <Text className="font-uiBold text-lg text-neutral-on-surface">Partido no encontrado</Text>
        <TouchableOpacity onPress={() => router.back()} className="mt-4">
          <Text className="font-ui text-sm text-brand-primary">Volver</Text>
        </TouchableOpacity>
        {AlertComponent}
      </View>
    );
  }

  const { status } = match;
  const isMyTeamA = match.teamA.id === myTeamId;
  const myCheckinAt = isMyTeamA ? match.checkinTeamAAt : match.checkinTeamBAt;
  const myTeamParticipants = match.participants.filter((p) => p.teamId === myTeamId);

  function renderStatusBadge() {
    const colors: Record<string, string> = {
      PENDIENTE: 'bg-neutral-outline/20 text-neutral-on-surface-variant',
      CONFIRMADO: 'bg-info-secondary/20 text-info-secondary',
      EN_VIVO: 'bg-danger-error/20 text-danger-error',
      FINALIZADO: 'bg-brand-primary/20 text-brand-primary',
      EN_DISPUTA: 'bg-warning-tertiary/20 text-warning-tertiary',
      WO_A: 'bg-warning-tertiary/20 text-warning-tertiary',
      WO_B: 'bg-warning-tertiary/20 text-warning-tertiary',
      CANCELADO: 'bg-neutral-outline/20 text-neutral-outline',
    };
    const labels: Record<string, string> = {
      PENDIENTE: 'Pendiente',
      CONFIRMADO: 'Confirmado',
      EN_VIVO: 'En vivo',
      FINALIZADO: 'Finalizado',
      EN_DISPUTA: 'En disputa',
      WO_A: 'WO (Equipo A)',
      WO_B: 'WO (Equipo B)',
      CANCELADO: 'Cancelado',
    };
    const cls = colors[status] ?? 'bg-neutral-outline/20 text-neutral-on-surface-variant';
    return (
      <View className={`rounded-full px-3 py-1 ${cls.split(' ')[0]}`}>
        <Text className={`font-uiBold text-xs uppercase tracking-widest ${cls.split(' ')[1]}`}>
          {labels[status] ?? status}
        </Text>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-surface-base">
      {/* Header */}
      <View className="flex-row items-center gap-3 px-4 pb-3 pt-14">
        <TouchableOpacity onPress={() => router.back()} activeOpacity={0.7} className="p-1">
          <AppIcon family="material-community" name="arrow-left" size={24} color="#E5E2E1" />
        </TouchableOpacity>
        <Text className="font-uiBold flex-1 text-lg text-neutral-on-surface">Detalle del partido</Text>
        {renderStatusBadge()}
      </View>

      <ScrollView
        className="px-4"
        contentContainerStyle={{ paddingBottom: 48 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Hero */}
        <MatchDetailHero match={match} myTeamId={myTeamId} />

        {/* Unique code block — tap to copy */}
        <TouchableOpacity
          onPress={() => void Clipboard.setStringAsync(match.uniqueCode).then(() =>
            showAlert('¡Copiado!', 'El código del partido fue copiado al portapapeles.')
          )}
          activeOpacity={0.8}
          className="mt-3 rounded-xl border border-brand-primary/25 bg-brand-primary/8 px-4 py-3"
        >
          <Text className="font-ui mb-1 text-[10px] uppercase tracking-widest text-brand-primary opacity-70">
            ⚽ Código del partido
          </Text>
          <View className="flex-row items-center justify-between">
            <Text className="font-displayBlack text-xl tracking-[6px] text-brand-primary">
              {match.uniqueCode}
            </Text>
            <View className="rounded-lg border border-brand-primary/40 bg-brand-primary/15 px-2 py-1">
              <Text className="font-uiBold text-[10px] uppercase tracking-wider text-brand-primary">
                Copiar
              </Text>
            </View>
          </View>
        </TouchableOpacity>

        {/* ─── PENDIENTE ─── */}
        {status === 'PENDIENTE' && (
          <>
            {match.activeProposal ? (
              <ProposalSection
                proposal={match.activeProposal}
                myTeamId={myTeamId}
                onAccept={() => void handleAcceptProposal()}
                onReject={() => void handleRejectProposal()}
                onCounterPropose={() => setShowProposalModal(true)}
                onCancelProposal={() => void handleCancelProposal()}
              />
            ) : (
              <View className="mt-4 rounded-2xl bg-surface-container p-4">
                <Text className="font-ui text-center text-sm text-neutral-on-surface-variant">
                  Sin propuesta activa. Enviá una propuesta para coordinar el partido.
                </Text>
                <TouchableOpacity
                  onPress={() => setShowProposalModal(true)}
                  activeOpacity={0.8}
                  className="mt-3 rounded-xl bg-brand-primary py-3"
                >
                  <Text className="font-uiBold text-center text-sm text-[#003914]">
                    Proponer detalles
                  </Text>
                </TouchableOpacity>
              </View>
            )}
            <ActionButtons
              onChat={match.conversationId ? () => router.push({ pathname: '/(modals)/chat' as never, params: { conversationId: match.conversationId!, myTeamId } }) : undefined}
              onCancel={() => setShowCancellationModal(true)}
            />
          </>
        )}

        {/* ─── CONFIRMADO ─── */}
        {status === 'CONFIRMADO' && (
          <>
            <MatchDetailsSection match={match} />
            <CheckinSection match={match} onCheckin={() => void handleCheckin()} />
            <ActionButtons
              onChat={match.conversationId ? () => router.push({ pathname: '/(modals)/chat' as never, params: { conversationId: match.conversationId!, myTeamId } }) : undefined}
              onWo={myCheckinAt !== null ? () => setShowWoModal(true) : undefined}
              onCancel={() => setShowCancellationModal(true)}
            />
          </>
        )}

        {/* ─── EN_VIVO ─── */}
        {status === 'EN_VIVO' && (
          <>
            <MatchDetailsSection match={match} />
            <ResultSection
              match={match}
              onLoadResult={match.isResultLoader ? () => setShowResultModal(true) : undefined}
            />
            <ActionButtons
              onChat={match.conversationId ? () => router.push({ pathname: '/(modals)/chat' as never, params: { conversationId: match.conversationId!, myTeamId } }) : undefined}
              onWo={() => setShowWoModal(true)}
            />
          </>
        )}

        {/* ─── FINALIZADO ─── */}
        {status === 'FINALIZADO' && (
          <>
            <ResultSection match={match} />
            <View className="mt-4 flex-row items-center gap-2 rounded-xl bg-surface-container px-4 py-3">
              <AppIcon family="material-community" name="heart" size={16} color="#53E076" />
              <Text className="font-ui flex-1 text-xs text-neutral-on-surface-variant">
                ¡Buen partido! El Fair Play de ambos equipos ha sido actualizado.
              </Text>
            </View>
          </>
        )}

        {/* ─── EN_DISPUTA ─── */}
        {status === 'EN_DISPUTA' && (
          <>
            <ResultSection match={match} />
            {profile ? (
              <DisputeSection
                match={match}
                profileId={profile.id}
                disputeState={disputeState}
                onVote={(teamId) => void handleVoteSubmit(teamId)}
                onResolve={() => void handleDisputeResolve()}
              />
            ) : null}
            <ActionButtons
              onChat={match.conversationId ? () => router.push({ pathname: '/(modals)/chat' as never, params: { conversationId: match.conversationId!, myTeamId } }) : undefined}
            />
          </>
        )}

        {/* ─── WO_A / WO_B ─── */}
        {(status === 'WO_A' || status === 'WO_B') && (
          <>
            <View className="mt-4 rounded-2xl bg-warning-tertiary/10 p-4">
              <View className="mb-2 flex-row items-center gap-2">
                <AppIcon family="material-community" name="trophy" size={18} color="#FABD32" />
                <Text className="font-uiBold text-sm text-warning-tertiary">Partido ganado por WO</Text>
              </View>
              {match.woClaim && (
                <Text className="font-ui text-sm text-neutral-on-surface-variant">
                  Motivo: {match.woClaim.reason ?? 'No especificado'}
                </Text>
              )}
            </View>
            <ActionButtons
              onChat={match.conversationId ? () => router.push({ pathname: '/(modals)/chat' as never, params: { conversationId: match.conversationId!, myTeamId } }) : undefined}
            />
          </>
        )}

        {/* ─── CANCELADO ─── */}
        {status === 'CANCELADO' && (
          <View className="mt-4 rounded-2xl bg-neutral-outline/10 p-4">
            <Text className="font-uiBold mb-1 text-sm text-neutral-on-surface">
              Partido cancelado
            </Text>
            {match.cancellationRequest && (
              <Text className="font-ui text-sm text-neutral-on-surface-variant">
                Motivo: {match.cancellationRequest.reason}
              </Text>
            )}
          </View>
        )}
      </ScrollView>

      {/* Modals */}
      <ProposalModal
        visible={showProposalModal}
        matchType={match.matchType}
        onClose={() => setShowProposalModal(false)}
        onSubmit={handleProposalSubmit}
      />
      <ResultModal
        visible={showResultModal}
        onClose={() => setShowResultModal(false)}
        onSubmit={async (data) => {
          await submitMatchResult(match.id, myTeamId, data);
          showAlert('Resultado cargado', 'Tu resultado fue enviado.', () => void loadData());
        }}
        myParticipants={myTeamParticipants}
      />
      <CancellationModal
        visible={showCancellationModal}
        onClose={() => setShowCancellationModal(false)}
        isLateWarning={isLateForCancellation()}
        onSubmit={async (data) => {
          await requestCancellation(match.id, myTeamId, data);
          showAlert(
            'Solicitud enviada',
            'Tu solicitud de cancelación fue enviada.',
            () => void loadData(),
          );
        }}
      />
      <WoModal
        visible={showWoModal}
        onClose={() => setShowWoModal(false)}
        onSubmit={async (data) => {
          await claimWo(match.id, myTeamId, data);
          showAlert('Reclamo enviado', 'Tu reclamo WO fue enviado a revisión.', () => void loadData());
        }}
      />

      {AlertComponent}
    </View>
  );
}

// ─── Reusable action buttons row ─────────────────────────────────────────────

interface ActionButtonsProps {
  onChat?: () => void;
  onWo?: () => void;
  onCancel?: () => void;
}

function ActionButtons({ onChat, onWo, onCancel }: ActionButtonsProps) {
  return (
    <View className="mt-4 flex-row flex-wrap gap-2">
      {onChat && (
        <TouchableOpacity
          onPress={onChat}
          activeOpacity={0.8}
          className="flex-1 flex-row items-center justify-center gap-2 rounded-xl border border-info-secondary/30 bg-info-secondary/10 py-3"
        >
          <AppIcon family="material-community" name="chat" size={16} color="#8CCDFF" />
          <Text className="font-uiBold text-sm text-info-secondary">Chat</Text>
        </TouchableOpacity>
      )}
      {onWo && (
        <TouchableOpacity
          onPress={onWo}
          activeOpacity={0.8}
          className="flex-1 flex-row items-center justify-center gap-2 rounded-xl border border-warning-tertiary/30 bg-warning-tertiary/10 py-3"
        >
          <AppIcon family="material-community" name="flag" size={16} color="#FABD32" />
          <Text className="font-uiBold text-sm text-warning-tertiary">WO</Text>
        </TouchableOpacity>
      )}
      {onCancel && (
        <TouchableOpacity
          onPress={onCancel}
          activeOpacity={0.8}
          className="flex-1 flex-row items-center justify-center gap-2 rounded-xl border border-danger-error/30 bg-danger-error/10 py-3"
        >
          <AppIcon family="material-community" name="cancel" size={16} color="#FFB4AB" />
          <Text className="font-uiBold text-sm text-danger-error">Cancelar</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}
