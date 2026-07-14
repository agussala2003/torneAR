import { useCallback, useState } from 'react';
import { ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { Image } from 'expo-image';
import { router, useFocusEffect } from 'expo-router';
import { useAuth } from '@/context/AuthContext';
import { GlobalLoader } from '@/components/GlobalLoader';
import { AppIcon } from '@/components/ui/AppIcon';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useCustomAlert } from '@/hooks/useCustomAlert';
import { getGenericSupabaseErrorMessage } from '@/lib/auth-error-messages';
import { getSupabaseStorageUrl } from '@/lib/supabase-storage';
import { fetchPendingWoClaims, resolveWoClaim, type PendingWoClaim } from '@/lib/wo-admin-data';

const REASON_LABELS: Record<string, string> = {
  NO_PRESENTACION: 'No presentación',
  ABANDONO: 'Abandono',
  INCIDENTE_CONDUCTA: 'Incidente de conducta',
  CAMPO_NO_DISPONIBLE: 'Campo no disponible',
  FALTA_QUORUM: 'Falta de quórum',
  OTRO: 'Otro',
};

function formatDate(iso: string | null): string {
  if (!iso) return 'Sin fecha';
  return new Date(iso).toLocaleDateString('es-AR', { day: '2-digit', month: 'short', year: 'numeric' });
}

export default function WoReviewScreen() {
  const { profile } = useAuth();
  const { showAlert, AlertComponent } = useCustomAlert();

  const [loading, setLoading] = useState(true);
  const [claims, setClaims] = useState<PendingWoClaim[]>([]);
  const [dialog, setDialog] = useState<{ claim: PendingWoClaim; approve: boolean } | null>(null);
  const [resolving, setResolving] = useState(false);

  const isAdmin = profile?.is_admin === true;

  const loadClaims = useCallback(async () => {
    try {
      setLoading(true);
      setClaims(await fetchPendingWoClaims());
    } catch (error) {
      showAlert('Error', getGenericSupabaseErrorMessage(error, 'No se pudieron cargar los reclamos.'));
    } finally {
      setLoading(false);
    }
  }, [showAlert]);

  useFocusEffect(
    useCallback(() => {
      if (isAdmin) void loadClaims();
    }, [isAdmin, loadClaims]),
  );

  async function handleConfirm(notes: string) {
    if (!dialog) return;
    setResolving(true);
    try {
      await resolveWoClaim(
        dialog.claim.claimId,
        dialog.approve,
        dialog.approve ? null : notes.trim() || null,
      );
      setDialog(null);
      await loadClaims();
      showAlert(
        dialog.approve ? 'WO aprobado' : 'WO rechazado',
        dialog.approve
          ? 'Se aplicó el resultado 3-0 y las estadísticas.'
          : 'El reclamo fue rechazado.',
        undefined,
        'success',
      );
    } catch (error) {
      showAlert('Error', getGenericSupabaseErrorMessage(error, 'No se pudo resolver el reclamo.'));
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
      <View className="flex-row items-center gap-3 px-4 pb-3 pt-14">
        <TouchableOpacity onPress={() => router.back()} activeOpacity={0.7}>
          <AppIcon family="material-community" name="chevron-left" size={26} color="#E5E2E1" />
        </TouchableOpacity>
        <Text className="font-displayBlack text-xl text-neutral-on-surface">Reclamos de WO</Text>
      </View>

      {loading ? (
        <GlobalLoader label="Cargando reclamos" />
      ) : claims.length === 0 ? (
        <View className="flex-1 items-center justify-center px-6">
          <AppIcon family="material-community" name="check-decagram" size={44} color="#53E076" />
          <Text className="font-display mt-3 text-lg text-neutral-on-surface">Todo al día</Text>
          <Text className="font-ui mt-1 text-center text-neutral-on-surface-variant">
            No hay reclamos de WO pendientes de revisión.
          </Text>
        </View>
      ) : (
        <ScrollView className="px-4" contentContainerStyle={{ paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
          {claims.map((c) => (
            <View key={c.claimId} className="mb-4 rounded-2xl bg-surface-container p-4">
              {/* Equipos + fecha */}
              <View className="mb-3 flex-row items-center justify-between">
                <Text className="font-uiBold flex-1 text-sm text-neutral-on-surface" numberOfLines={1}>
                  {c.claimingTeamName} <Text className="text-neutral-outline">vs</Text> {c.opponentTeamName}
                </Text>
                <Text className="font-ui text-[11px] text-neutral-on-surface-variant">{formatDate(c.scheduledAt ?? c.createdAt)}</Text>
              </View>

              {/* Motivo */}
              <View className="mb-3 flex-row items-center gap-2">
                <View className="rounded-full bg-warning-tertiary/20 px-2.5 py-1">
                  <Text className="font-uiBold text-[11px] text-warning-tertiary">
                    {c.reason ? (REASON_LABELS[c.reason] ?? c.reason) : 'Sin motivo'}
                  </Text>
                </View>
                <Text className="font-ui text-[11px] text-neutral-on-surface-variant">Reclama {c.claimingTeamName}</Text>
              </View>

              {/* Evidencia */}
              {c.photoUrl ? (
                <Image
                  source={{ uri: getSupabaseStorageUrl('wo_evidences', c.photoUrl) }}
                  style={{ width: '100%', height: 180, borderRadius: 12 }}
                  contentFit="cover"
                />
              ) : (
                <View className="h-[100px] items-center justify-center rounded-xl bg-surface-high">
                  <Text className="font-ui text-xs text-neutral-outline">Sin evidencia fotográfica</Text>
                </View>
              )}

              {/* Goleadores propuestos */}
              <Text className="font-ui mb-1 mt-3 text-[11px] uppercase tracking-widest text-neutral-outline">
                Goleadores propuestos
              </Text>
              {c.scorers.length === 0 ? (
                <Text className="font-ui text-sm text-neutral-on-surface-variant">No se cargaron goleadores.</Text>
              ) : (
                <View className="gap-1">
                  {c.scorers.map((s, i) => (
                    <View key={`${c.claimId}-${s.profile_id}-${i}`} className="flex-row items-center justify-between">
                      <Text className="font-ui text-sm text-neutral-on-surface">{s.full_name ?? 'Jugador'}</Text>
                      <Text className="font-uiBold text-sm text-brand-primary">{s.goals} ⚽</Text>
                    </View>
                  ))}
                </View>
              )}

              {/* MVP */}
              <View className="mt-2 flex-row items-center gap-2">
                <Text className="font-ui text-[11px] uppercase tracking-widest text-neutral-outline">MVP</Text>
                <Text className="font-uiBold text-sm text-warning-tertiary">
                  {c.mvpName ? `⭐ ${c.mvpName}` : 'Sin MVP'}
                </Text>
              </View>

              {/* Acciones */}
              <View className="mt-4 flex-row gap-2">
                <TouchableOpacity
                  onPress={() => setDialog({ claim: c, approve: false })}
                  activeOpacity={0.8}
                  className="flex-1 items-center rounded-xl bg-surface-high py-3"
                >
                  <Text className="font-uiBold text-sm text-danger-error">Rechazar</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => setDialog({ claim: c, approve: true })}
                  activeOpacity={0.8}
                  className="flex-1 items-center rounded-xl bg-brand-primary py-3"
                >
                  <Text className="font-uiBold text-sm text-surface-base">Aprobar</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))}
        </ScrollView>
      )}

      <ConfirmDialog
        visible={dialog !== null}
        title={dialog?.approve ? 'Aprobar WO' : 'Rechazar WO'}
        message={
          dialog?.approve
            ? 'Se asignará el 3-0, se aplicarán las estadísticas (ELO, temporada, Fair Play) y se acreditarán los goleadores/MVP. Esta acción no se puede deshacer.'
            : 'El reclamo será rechazado. Podés dejar una nota con el motivo.'
        }
        confirmLabel={dialog?.approve ? 'Aprobar' : 'Rechazar'}
        confirmTone={dialog?.approve ? 'primary' : 'danger'}
        showNotesInput={dialog?.approve === false}
        notesPlaceholder="Motivo del rechazo (opcional)"
        loading={resolving}
        onConfirm={handleConfirm}
        onCancel={() => setDialog(null)}
      />

      {AlertComponent}
    </View>
  );
}
