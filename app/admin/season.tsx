import { useCallback, useState } from 'react';
import { ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useAuth } from '@/context/AuthContext';
import { GlobalLoader } from '@/components/GlobalLoader';
import { AppIcon } from '@/components/ui/AppIcon';
import { SecondaryHeader } from '@/components/ui/SecondaryHeader';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useCustomAlert } from '@/hooks/useCustomAlert';
import { getGenericSupabaseErrorMessage } from '@/lib/auth-error-messages';
import {
  fetchActiveSeasonInfo,
  transitionSeason,
  type ActiveSeasonInfo,
} from '@/lib/season-admin-data';
import { Logger } from '@/lib/logger';

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function isValidISODate(value: string): boolean {
  if (!ISO_DATE_RE.test(value)) return false;
  const d = new Date(value + 'T00:00:00');
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

function formatDate(iso: string): string {
  return new Date(iso + 'T00:00:00').toLocaleDateString('es-AR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

export default function SeasonAdminScreen() {
  const { profile } = useAuth();
  const { showAlert, AlertComponent } = useCustomAlert();

  const [loading, setLoading] = useState(true);
  const [activeSeason, setActiveSeason] = useState<ActiveSeasonInfo | null>(null);
  const [name, setName] = useState('');
  const [startsAt, setStartsAt] = useState('');
  const [endsAt, setEndsAt] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [confirmVisible, setConfirmVisible] = useState(false);
  const [transitioning, setTransitioning] = useState(false);

  const isAdmin = profile?.is_admin === true;

  const loadSeason = useCallback(async () => {
    try {
      setLoading(true);
      setActiveSeason(await fetchActiveSeasonInfo());
    } catch (error) {
      Logger.error('No se pudo cargar la temporada activa', {
        scope: 'admin.season.loadSeason',
        error,
      });
      showAlert('Error', getGenericSupabaseErrorMessage(error, 'No se pudo cargar la temporada activa.'));
    } finally {
      setLoading(false);
    }
  }, [showAlert]);

  useFocusEffect(
    useCallback(() => {
      if (isAdmin) void loadSeason();
    }, [isAdmin, loadSeason]),
  );

  function validateForm(): string | null {
    if (!name.trim()) return 'Ingresá el nombre de la nueva temporada (ej: Apertura 2027).';
    if (!isValidISODate(startsAt)) return 'La fecha de inicio debe tener formato YYYY-MM-DD (ej: 2027-01-01).';
    if (!isValidISODate(endsAt)) return 'La fecha de fin debe tener formato YYYY-MM-DD (ej: 2027-06-30).';
    if (startsAt >= endsAt) return 'La fecha de inicio debe ser anterior a la de fin.';
    return null;
  }

  function handleSubmitPress() {
    const error = validateForm();
    setFormError(error);
    if (!error) setConfirmVisible(true);
  }

  async function handleConfirmTransition() {
    setTransitioning(true);
    try {
      await transitionSeason(name.trim(), startsAt, endsAt);
      Logger.info('Transición de temporada ejecutada', {
        scope: 'admin.season.handleConfirmTransition',
        newSeasonName: name.trim(),
        startsAt,
        endsAt,
        adminProfileId: profile?.id,
      });
      setConfirmVisible(false);
      setName('');
      setStartsAt('');
      setEndsAt('');
      await loadSeason();
      showAlert(
        'Temporada iniciada',
        `Se cerró la temporada anterior y comenzó "${name.trim()}". Los contadores de temporada fueron reseteados; el Rating y el historial de partidos quedaron intactos.`,
        undefined,
        'success',
      );
    } catch (error) {
      Logger.error('No se pudo ejecutar la transición de temporada', {
        scope: 'admin.season.handleConfirmTransition',
        newSeasonName: name.trim(),
        startsAt,
        endsAt,
        error,
      });
      setConfirmVisible(false);
      showAlert('Error', getGenericSupabaseErrorMessage(error, 'No se pudo ejecutar la transición.'));
    } finally {
      setTransitioning(false);
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
      <SecondaryHeader title="Temporadas" />

      {loading ? (
        <GlobalLoader label="Cargando temporada" />
      ) : (
        <ScrollView className="px-4" contentContainerStyle={{ paddingTop: 12, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
          {/* Temporada activa */}
          <View className="mb-4 rounded-2xl bg-surface-container p-4">
            <Text className="font-ui mb-2 text-[11px] uppercase tracking-widest text-neutral-outline">
              Temporada activa
            </Text>
            {activeSeason ? (
              <>
                <View className="flex-row items-center justify-between">
                  <Text className="font-displayBlack text-lg text-neutral-on-surface">{activeSeason.name}</Text>
                  <View
                    className={`rounded-full px-2.5 py-1 ${
                      activeSeason.isExpired ? 'bg-danger-error/20' : 'bg-brand-primary/15'
                    }`}
                  >
                    <Text
                      className={`font-uiBold text-[11px] ${
                        activeSeason.isExpired ? 'text-danger-error' : 'text-brand-primary'
                      }`}
                    >
                      {activeSeason.isExpired ? 'VENCIDA' : 'EN CURSO'}
                    </Text>
                  </View>
                </View>
                <Text className="font-ui mt-1 text-sm text-neutral-on-surface-variant">
                  {formatDate(activeSeason.startsAt)} — {formatDate(activeSeason.endsAt)}
                </Text>
                {activeSeason.isExpired && (
                  <Text className="font-ui mt-2 text-xs text-danger-error">
                    La temporada venció: ejecutá la transición para abrir la siguiente.
                  </Text>
                )}
              </>
            ) : (
              <Text className="font-ui text-sm text-danger-error">
                No hay temporada activa. Creá una con el formulario de abajo.
              </Text>
            )}
          </View>

          {/* Formulario de transición */}
          <View className="rounded-2xl bg-surface-container p-4">
            <Text className="font-ui mb-3 text-[11px] uppercase tracking-widest text-neutral-outline">
              Nueva temporada
            </Text>

            <Text className="font-uiBold mb-1 text-xs text-neutral-on-surface-variant">Nombre</Text>
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="Ej: Apertura 2027"
              placeholderTextColor="#869585"
              className="font-ui mb-3 rounded-xl bg-surface-high px-3 py-3 text-sm text-neutral-on-surface"
            />

            <View className="mb-3 flex-row gap-3">
              <View className="flex-1">
                <Text className="font-uiBold mb-1 text-xs text-neutral-on-surface-variant">Inicio (YYYY-MM-DD)</Text>
                <TextInput
                  value={startsAt}
                  onChangeText={setStartsAt}
                  placeholder="2027-01-01"
                  placeholderTextColor="#869585"
                  autoCapitalize="none"
                  autoCorrect={false}
                  className="font-ui rounded-xl bg-surface-high px-3 py-3 text-sm text-neutral-on-surface"
                />
              </View>
              <View className="flex-1">
                <Text className="font-uiBold mb-1 text-xs text-neutral-on-surface-variant">Fin (YYYY-MM-DD)</Text>
                <TextInput
                  value={endsAt}
                  onChangeText={setEndsAt}
                  placeholder="2027-06-30"
                  placeholderTextColor="#869585"
                  autoCapitalize="none"
                  autoCorrect={false}
                  className="font-ui rounded-xl bg-surface-high px-3 py-3 text-sm text-neutral-on-surface"
                />
              </View>
            </View>

            {formError && (
              <Text className="font-ui mb-3 text-xs text-danger-error">{formError}</Text>
            )}

            <TouchableOpacity
              onPress={handleSubmitPress}
              activeOpacity={0.8}
              className="items-center rounded-xl bg-warning-tertiary py-3"
            >
              <Text className="font-uiBold text-sm text-surface-base">Iniciar transición de temporada</Text>
            </TouchableOpacity>

            <Text className="font-ui mt-3 text-[11px] leading-4 text-neutral-outline">
              La transición cierra la temporada activa, pone en 0 las estadísticas de temporada
              (victorias, empates, derrotas y goles) de todos los equipos y pasa los partidos
              abiertos a la temporada nueva. El Rating y el historial de partidos jugados no se tocan.
            </Text>
          </View>
        </ScrollView>
      )}

      <ConfirmDialog
        visible={confirmVisible}
        title="¿Iniciar nueva temporada?"
        message={`Se cerrará "${activeSeason?.name ?? 'la temporada activa'}" y comenzará "${name.trim()}" (${startsAt} → ${endsAt}). Las estadísticas de temporada (victorias, empates, derrotas y goles) de TODOS los equipos vuelven a 0. Esta acción no se puede deshacer.`}
        confirmLabel="Iniciar temporada"
        confirmTone="danger"
        loading={transitioning}
        onConfirm={() => void handleConfirmTransition()}
        onCancel={() => setConfirmVisible(false)}
      />

      {AlertComponent}
    </View>
  );
}
