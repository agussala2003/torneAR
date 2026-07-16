import { useState, useCallback, useMemo } from 'react';
import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { useLocalSearchParams, router, useFocusEffect } from 'expo-router';
import * as Location from 'expo-location';
import { useCustomAlert } from '@/hooks/useCustomAlert';
import { fetchCheckinViewData, submitTeamCheckin, getCheckinErrorMessage } from '@/lib/checkin-data';
import { GlobalLoader } from '@/components/GlobalLoader';
import { AppIcon } from '@/components/ui/AppIcon';
import { CheckinSquadCounters } from '@/components/matches/CheckinSquadCounters';
import { CheckinRosterItem } from '@/components/matches/CheckinRosterItem';
import type { CheckinViewData, CheckinLineupState } from '@/components/matches/types';

// Orden de la lista: cuerpo de capitanía primero, invitados al final.
const ROLE_ORDER: Record<string, number> = {
  CAPITAN: 0,
  SUBCAPITAN: 1,
  DIRECTOR_TECNICO: 2,
  JUGADOR: 3,
};

// Ciclo de estados de cada jugador: Afuera → Titular → Suplente → Afuera.
const NEXT_STATE: Record<CheckinLineupState, CheckinLineupState> = {
  AFUERA: 'TITULAR',
  TITULAR: 'SUPLENTE',
  SUPLENTE: 'AFUERA',
};

export default function MatchCheckinScreen() {
  const { matchId, myTeamId } = useLocalSearchParams<{ matchId: string; myTeamId: string }>();
  const { showAlert, AlertComponent } = useCustomAlert();

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [viewData, setViewData] = useState<CheckinViewData | null>(null);
  const [lineup, setLineup] = useState<Record<string, CheckinLineupState>>({});

  const loadData = useCallback(async () => {
    if (!matchId || !myTeamId) {
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      const data = await fetchCheckinViewData(matchId, myTeamId);
      setViewData(data);
      // Estado inicial: lo ya persistido si el equipo re-presenta la lista
      const initial: Record<string, CheckinLineupState> = {};
      for (const player of data.roster) {
        initial[player.profileId] = player.currentLineupRole ?? 'AFUERA';
      }
      setLineup(initial);
    } catch (err) {
      showAlert('Error', getCheckinErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [matchId, myTeamId, showAlert]);

  useFocusEffect(useCallback(() => { void loadData(); }, [loadData]));

  const roster = useMemo(
    () =>
      (viewData?.roster ?? []).slice().sort((a, b) => {
        const orderA = a.isGuest ? 9 : ROLE_ORDER[a.teamRole ?? 'JUGADOR'] ?? 3;
        const orderB = b.isGuest ? 9 : ROLE_ORDER[b.teamRole ?? 'JUGADOR'] ?? 3;
        return orderA - orderB || a.fullName.localeCompare(b.fullName);
      }),
    [viewData?.roster],
  );

  const starters = Object.values(lineup).filter((s) => s === 'TITULAR').length;
  const substitutes = Object.values(lineup).filter((s) => s === 'SUPLENTE').length;
  const total = starters + substitutes;

  // Validación UX espejo de la RPC: el botón se habilita solo con cupos válidos.
  const blockReason = useMemo(() => {
    if (!viewData) return null;
    const { rules } = viewData;
    if (viewData.matchStatus !== 'CONFIRMADO') {
      return 'La lista solo se puede presentar con el partido confirmado.';
    }
    if (starters < rules.minPlayersToStart) {
      return `Te faltan titulares: marcá al menos ${rules.minPlayersToStart} (tenés ${starters}).`;
    }
    if (starters > rules.playersOnField) {
      return `Demasiados titulares: en ${viewData.format.replace('FUTBOL_', 'F')} juegan ${rules.playersOnField}.`;
    }
    if (total > rules.maxSquadSize) {
      return `Superaste el máximo de convocados (${rules.maxSquadSize}). Sacá ${total - rules.maxSquadSize}.`;
    }
    return null;
  }, [viewData, starters, total]);

  function cyclePlayer(profileId: string) {
    setLineup((prev) => ({ ...prev, [profileId]: NEXT_STATE[prev[profileId] ?? 'AFUERA'] }));
  }

  async function handleSubmit() {
    if (!viewData || blockReason || submitting) return;
    try {
      setSubmitting(true);

      // Geofence: misma exigencia que el check-in simple si hay cancha del catálogo
      let coords: { lat: number; lng: number } | undefined;
      if (viewData.venueId) {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
          showAlert(
            'Permiso requerido',
            'Para presentar la lista necesitamos tu ubicación y verificar que estás en la cancha.',
          );
          return;
        }
        const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
        coords = { lat: position.coords.latitude, lng: position.coords.longitude };
      }

      const players = Object.entries(lineup)
        .filter(([, state]) => state !== 'AFUERA')
        .map(([profileId, state]) => ({ profileId, lineupRole: state as 'TITULAR' | 'SUPLENTE' }));

      const summary = await submitTeamCheckin(viewData.matchId, myTeamId, players, coords);
      showAlert(
        '¡Lista presentada!',
        summary.matchStatus === 'EN_VIVO'
          ? `${summary.starters} titulares y ${summary.substitutes} suplentes. ¡Ambos equipos listos: el partido está EN VIVO!`
          : `${summary.starters} titulares y ${summary.substitutes} suplentes. Falta que el rival presente la suya.`,
        () => router.back(),
        'success',
      );
    } catch (err) {
      showAlert('Error', getCheckinErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return <GlobalLoader label="Cargando plantel..." />;

  if (!viewData) {
    return (
      <View className="flex-1 items-center justify-center bg-surface-base px-6">
        <Text className="font-uiBold text-lg text-neutral-on-surface">Convocatoria no disponible</Text>
        <TouchableOpacity onPress={() => router.back()} className="mt-4">
          <Text className="font-ui text-sm text-brand-primary">Volver</Text>
        </TouchableOpacity>
        {AlertComponent}
      </View>
    );
  }

  const alreadySubmitted = viewData.myTeamCheckinAt !== null;

  return (
    <View className="flex-1 bg-surface-base">
      {/* Header */}
      <View className="flex-row items-center gap-3 px-4 pb-3 pt-14">
        <TouchableOpacity onPress={() => router.back()} activeOpacity={0.7} className="p-1">
          <AppIcon family="material-community" name="arrow-left" size={24} color="#E5E2E1" />
        </TouchableOpacity>
        <View className="flex-1">
          <Text className="font-uiBold text-lg text-neutral-on-surface">Armar convocatoria</Text>
          <Text className="font-ui text-xs text-neutral-on-surface-variant">
            Tocá a cada jugador para ciclar: Afuera → Titular → Suplente
          </Text>
        </View>
      </View>

      <ScrollView
        className="px-4"
        stickyHeaderIndices={[0]}
        contentContainerStyle={{ paddingBottom: 140 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Contadores en vivo — pegadizos al hacer scroll */}
        <CheckinSquadCounters
          rules={viewData.rules}
          starters={starters}
          substitutes={substitutes}
        />

        {alreadySubmitted && (
          <View className="mb-3 flex-row items-center gap-2 rounded-xl bg-info-secondary/10 px-4 py-3">
            <AppIcon family="material-community" name="information" size={16} color="#8CCDFF" />
            <Text className="font-ui flex-1 text-xs text-info-secondary">
              Tu equipo ya presentó una lista. Podés ajustarla y volver a confirmarla mientras el
              partido no arranque.
            </Text>
          </View>
        )}

        {roster.map((player) => (
          <CheckinRosterItem
            key={player.profileId}
            player={player}
            state={lineup[player.profileId] ?? 'AFUERA'}
            onCycle={cyclePlayer}
            disabled={submitting}
          />
        ))}

        {roster.length === 0 && (
          <View className="rounded-2xl bg-surface-container p-4">
            <Text className="font-ui text-center text-sm text-neutral-on-surface-variant">
              Tu equipo todavía no tiene jugadores. Sumalos desde la gestión del equipo o
              compartí el código del partido para invitar.
            </Text>
          </View>
        )}
      </ScrollView>

      {/* Confirmación fija abajo con motivo inline si los cupos no dan */}
      <View className="absolute inset-x-0 bottom-0 bg-surface-base px-4 pb-8 pt-3 shadow-ambient-lg">
        {blockReason && (
          <View className="mb-2 flex-row items-center gap-2 rounded-xl bg-warning-tertiary/10 px-3 py-2">
            <AppIcon family="material-community" name="alert-circle-outline" size={14} color="#FABD32" />
            <Text className="font-ui flex-1 text-xs text-warning-tertiary">{blockReason}</Text>
          </View>
        )}
        <TouchableOpacity
          onPress={() => void handleSubmit()}
          activeOpacity={0.8}
          disabled={blockReason !== null || submitting}
          className={`rounded-xl py-3.5 ${
            blockReason !== null || submitting ? 'bg-surface-high' : 'bg-brand-primary'
          }`}
        >
          <Text
            className={`font-uiBold text-center text-sm ${
              blockReason !== null || submitting ? 'text-neutral-outline' : 'text-[#003914]'
            }`}
          >
            {submitting
              ? 'Presentando lista...'
              : alreadySubmitted
                ? 'Actualizar lista'
                : `Confirmar lista (${starters} + ${substitutes})`}
          </Text>
        </TouchableOpacity>
      </View>

      {AlertComponent}
    </View>
  );
}
