import { useCallback, useState } from 'react';
import { ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useAuth } from '@/context/AuthContext';
import { GlobalLoader } from '@/components/GlobalLoader';
import { AppIcon } from '@/components/ui/AppIcon';
import { SecondaryHeader } from '@/components/ui/SecondaryHeader';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useCustomAlert } from '@/hooks/useCustomAlert';
import { getGenericSupabaseErrorMessage } from '@/lib/auth-error-messages';
import {
  fetchDisputedMatches,
  adminResolveDispute,
  type DisputedMatch,
  type DisputedMatchSide,
  type DisputeResolution,
} from '@/lib/dispute-admin-data';
import { formatScoreline } from '@/lib/dispute-scores';
import { Logger } from '@/lib/logger';

const FORMAT_SHORT: Record<string, string> = {
  FUTBOL_5: 'F5', FUTBOL_6: 'F6', FUTBOL_7: 'F7',
  FUTBOL_8: 'F8', FUTBOL_9: 'F9', FUTBOL_11: 'F11',
};

function formatDate(iso: string | null): string {
  if (!iso) return 'Sin fecha';
  return new Date(iso).toLocaleDateString('es-AR', { day: '2-digit', month: 'short', year: 'numeric' });
}

function formatFps(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

/**
 * Columna de un equipo: el marcador COMPLETO que propuso, votos y Fair Play.
 *
 * Antes acá se pintaba `side.goals` solo — los goles que ese equipo se
 * adjudica. Dos de esas cifras, una al lado de la otra, se leen como un
 * marcador y no lo son: salen de dos planillas distintas. "A: 2  B: 3" no dice
 * si el desacuerdo es de un gol o de cinco. Ahora cada columna muestra el
 * marcador entero tal como lo cargó su equipo, siempre en orden A–B, que es
 * exactamente lo que ve el jugador en DisputeSection.
 */
function TeamColumn({ side, align }: { side: DisputedMatchSide; align: 'left' | 'right' }) {
  const items = align === 'right' ? 'items-end' : 'items-start';
  return (
    <View className={`flex-1 ${items}`} style={{ minWidth: 0 }}>
      <Text
        className="font-uiBold text-sm text-neutral-on-surface"
        numberOfLines={1}
        ellipsizeMode="tail"
      >
        {side.teamName}
      </Text>
      <Text className="font-displayBlack mt-1 text-2xl leading-none text-neutral-on-surface">
        {formatScoreline(side.scoreline)}
      </Text>
      <Text className="font-ui mt-1 text-[10px] text-neutral-outline">
        {side.scoreline === null ? 'no cargó' : 'cargó'}
      </Text>
      <Text className="font-ui mt-1 text-[11px] text-neutral-on-surface-variant">
        {side.votes} voto{side.votes === 1 ? '' : 's'} · FP {formatFps(side.fairPlayScore)}
      </Text>
    </View>
  );
}

const CONFIRM_COPY: Record<DisputeResolution, { title: string; message: string; label: string }> = {
  WIN_A: {
    title: 'Dar por ganador al equipo A',
    message:
      'El partido se va a finalizar con el marcador que cargó ese equipo (o 3-0 si nunca lo cargó). ' +
      'Se aplican el Rating, las estadísticas de temporada y el Fair Play. Esta acción no se puede deshacer.',
    label: 'Confirmar',
  },
  WIN_B: {
    title: 'Dar por ganador al equipo B',
    message:
      'El partido se va a finalizar con el marcador que cargó ese equipo (o 3-0 si nunca lo cargó). ' +
      'Se aplican el Rating, las estadísticas de temporada y el Fair Play. Esta acción no se puede deshacer.',
    label: 'Confirmar',
  },
  CANCEL: {
    title: 'Anular el partido',
    message:
      'El partido queda cancelado y NO computa: sin Rating, sin estadísticas y sin ganador. ' +
      'Se libera a los jugadores convocados. Esta acción no se puede deshacer.',
    label: 'Anular',
  },
};

export default function DisputeReviewScreen() {
  const { profile } = useAuth();
  const { showAlert, AlertComponent } = useCustomAlert();

  const [loading, setLoading] = useState(true);
  const [matches, setMatches] = useState<DisputedMatch[]>([]);
  const [dialog, setDialog] = useState<{ match: DisputedMatch; resolution: DisputeResolution } | null>(null);
  const [resolving, setResolving] = useState(false);

  const isAdmin = profile?.is_admin === true;

  const loadMatches = useCallback(async () => {
    try {
      setLoading(true);
      setMatches(await fetchDisputedMatches());
    } catch (error) {
      Logger.error('No se pudieron cargar los partidos en disputa', {
        scope: 'admin.dispute-review.loadMatches',
        error,
      });
      showAlert('Error', getGenericSupabaseErrorMessage(error, 'No se pudieron cargar las disputas.'));
    } finally {
      setLoading(false);
    }
  }, [showAlert]);

  useFocusEffect(
    useCallback(() => {
      if (isAdmin) void loadMatches();
    }, [isAdmin, loadMatches]),
  );

  async function handleConfirm(notes: string) {
    if (!dialog) return;
    setResolving(true);
    try {
      await adminResolveDispute(dialog.match.matchId, dialog.resolution, notes);
      setDialog(null);
      await loadMatches();
      Logger.info('Disputa resuelta por un administrador', {
        scope: 'admin.dispute-review.handleConfirm',
        matchId: dialog.match.matchId,
        resolution: dialog.resolution,
        adminProfileId: profile?.id,
      });
      showAlert(
        'Disputa resuelta',
        dialog.resolution === 'CANCEL'
          ? 'El partido fue anulado y no computa.'
          : 'Se finalizó el partido y se aplicaron el Rating, las estadísticas y el Fair Play.',
        undefined,
        'success',
      );
    } catch (error) {
      Logger.error('No se pudo resolver la disputa desde el panel de administración', {
        scope: 'admin.dispute-review.handleConfirm',
        matchId: dialog.match.matchId,
        resolution: dialog.resolution,
        error,
      });
      showAlert('Error', getGenericSupabaseErrorMessage(error, 'No se pudo resolver la disputa.'));
    } finally {
      setResolving(false);
    }
  }

  // ─── Gating ───────────────────────────────────────────────────────────────
  if (!isAdmin) {
    return (
      <View className="flex-1 items-center justify-center bg-surface-base px-6">
        <AppIcon family="material-community" name="lock-outline" size={44} color="#869585" />
        <Text className="font-display mt-3 text-xl text-neutral-on-surface">Acceso denegado</Text>
        <Text className="font-ui mt-2 text-center text-neutral-on-surface-variant">
          Esta sección es solo para administradores de la liga.
        </Text>
        <TouchableOpacity
          onPress={() => router.back()}
          activeOpacity={0.8}
          className="mt-5 rounded-xl bg-surface-high px-5 py-2.5"
        >
          <Text className="font-uiBold text-sm text-neutral-on-surface">Volver</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-surface-base">
      {/* Header */}
      <SecondaryHeader title="Disputas" />

      {loading ? (
        <GlobalLoader label="Cargando disputas" />
      ) : matches.length === 0 ? (
        <View className="flex-1 items-center justify-center px-6">
          <AppIcon family="material-community" name="check-decagram" size={44} color="#53E076" />
          <Text className="font-display mt-3 text-lg text-neutral-on-surface">Todo al día</Text>
          <Text className="font-ui mt-1 text-center text-neutral-on-surface-variant">
            No hay partidos en disputa esperando resolución.
          </Text>
        </View>
      ) : (
        <ScrollView className="px-4" contentContainerStyle={{ paddingTop: 12, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
          {matches.map((m) => (
            <View key={m.matchId} className="mb-4 rounded-2xl bg-surface-container p-4">
              {/* Meta */}
              <View className="mb-3 flex-row items-center justify-between">
                <View className={`rounded-full px-2.5 py-1 ${m.matchType === 'RANKING' ? 'bg-warning-tertiary/20' : 'bg-info-secondary/15'}`}>
                  <Text className={`font-uiBold text-[10px] uppercase tracking-wider ${m.matchType === 'RANKING' ? 'text-warning-tertiary' : 'text-info-secondary'}`}>
                    {m.matchType === 'RANKING' ? '🏆 Ranking' : '🤝 Amistoso'}
                    {m.format ? ` · ${FORMAT_SHORT[m.format] ?? m.format}` : ''}
                  </Text>
                </View>
                <Text className="font-ui text-[11px] text-neutral-on-surface-variant">
                  {formatDate(m.scheduledAt)}
                </Text>
              </View>

              {/* Marcadores enfrentados. La leyenda fija el eje: las dos cifras
                  de cada columna son "local – visitante", no "míos – suyos". */}
              <Text className="font-ui mb-2 text-[10px] uppercase tracking-widest text-neutral-outline">
                Marcadores cargados ({m.teamA.teamName} – {m.teamB.teamName})
              </Text>
              <View className="flex-row items-start gap-3">
                <TeamColumn side={m.teamA} align="left" />
                <Text className="font-ui mt-6 text-xs text-neutral-outline">vs</Text>
                <TeamColumn side={m.teamB} align="right" />
              </View>

              {/* Por qué la resolución automática no alcanza */}
              {m.isDeadlocked && (
                <View className="mt-3 flex-row items-start gap-2 rounded-xl bg-warning-tertiary/10 px-3 py-2.5">
                  <AppIcon family="material-community" name="scale-balance" size={15} color="#FABD32" />
                  <Text className="font-ui flex-1 text-[11px] leading-4 text-warning-tertiary">
                    Empate total: mismos votos y mismo Fair Play. La resolución automática no puede
                    desempatar — este partido sólo se cierra desde acá.
                  </Text>
                </View>
              )}

              {/* Acciones */}
              <View className="mt-4 gap-2">
                <View className="flex-row gap-2">
                  <TouchableOpacity
                    onPress={() => setDialog({ match: m, resolution: 'WIN_A' })}
                    activeOpacity={0.8}
                    className="flex-1 items-center rounded-xl bg-brand-primary py-3"
                  >
                    <Text className="font-uiBold text-xs text-surface-base" numberOfLines={1}>
                      Gana {m.teamA.teamName}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => setDialog({ match: m, resolution: 'WIN_B' })}
                    activeOpacity={0.8}
                    className="flex-1 items-center rounded-xl bg-brand-primary py-3"
                  >
                    <Text className="font-uiBold text-xs text-surface-base" numberOfLines={1}>
                      Gana {m.teamB.teamName}
                    </Text>
                  </TouchableOpacity>
                </View>
                <TouchableOpacity
                  onPress={() => setDialog({ match: m, resolution: 'CANCEL' })}
                  activeOpacity={0.8}
                  className="items-center rounded-xl border border-danger-error/30 bg-danger-error/10 py-3"
                >
                  <Text className="font-uiBold text-xs text-danger-error">Anular el partido</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))}
        </ScrollView>
      )}

      <ConfirmDialog
        visible={dialog !== null}
        title={dialog ? CONFIRM_COPY[dialog.resolution].title : ''}
        message={dialog ? CONFIRM_COPY[dialog.resolution].message : ''}
        confirmLabel={dialog ? CONFIRM_COPY[dialog.resolution].label : 'Confirmar'}
        confirmTone={dialog?.resolution === 'CANCEL' ? 'danger' : 'primary'}
        showNotesInput
        notesPlaceholder="Motivo de la resolución (se le comparte a los dos equipos)"
        loading={resolving}
        onConfirm={handleConfirm}
        onCancel={() => setDialog(null)}
      />

      {AlertComponent}
    </View>
  );
}
