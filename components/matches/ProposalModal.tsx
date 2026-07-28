import { useState, useEffect } from 'react';
import {
  View,
  Text,
  Modal,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Platform,
  ActivityIndicator,
  KeyboardAvoidingView,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { AppIcon } from '@/components/ui/AppIcon';
import { useCustomAlert } from '@/hooks/useCustomAlert';
import { getGenericSupabaseErrorMessage } from '@/lib/auth-error-messages';
import type { MatchProposalFormData } from '@/components/matches/types';
import type { Database } from '@/types/supabase';
import { fetchZonesWithVenues, fetchVenuesByZone } from '@/lib/venue-data';
import type { ZoneEntry, VenueEntry } from '@/lib/venue-data';

type TeamFormat = Database['public']['Enums']['team_format'];
type MatchType = Database['public']['Enums']['match_type'];

const FORMATS: { label: string; value: TeamFormat }[] = [
  { label: 'F5', value: 'FUTBOL_5' },
  { label: 'F6', value: 'FUTBOL_6' },
  { label: 'F7', value: 'FUTBOL_7' },
  { label: 'F8', value: 'FUTBOL_8' },
  { label: 'F9', value: 'FUTBOL_9' },
  { label: 'F11', value: 'FUTBOL_11' },
];

const DURATIONS = [60, 75, 90];

interface Props {
  visible: boolean;
  matchType?: MatchType;
  onClose: () => void;
  onSubmit: (data: MatchProposalFormData) => Promise<void>;
}

export function ProposalModal({ visible, matchType = 'RANKING', onClose, onSubmit }: Props) {
  const [format, setFormat] = useState<TeamFormat>('FUTBOL_5');
  const [scheduledDate, setScheduledDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [durationMinutes, setDurationMinutes] = useState(60);
  const [signalAmount, setSignalAmount] = useState('');
  const [totalCost, setTotalCost] = useState('');
  const [loading, setLoading] = useState(false);

  // Zone + Venue. La cancha SÓLO puede salir del catálogo `venues`: el campo de
  // texto libre que había acá guardaba la dirección en `location` dejando
  // `venue_id` en null, y el geofence del check-in arranca con
  // `IF v_match.venue_id IS NOT NULL` — así que una dirección escrita a mano
  // desactivaba la validación geoespacial sin ningún aviso.
  const [zones, setZones] = useState<ZoneEntry[]>([]);
  const [selectedZoneId, setSelectedZoneId] = useState<string | null>(null);
  const [venues, setVenues] = useState<VenueEntry[]>([]);
  const [selectedVenue, setSelectedVenue] = useState<VenueEntry | null>(null);
  const [loadingVenues, setLoadingVenues] = useState(false);
  const [zonesLoaded, setZonesLoaded] = useState(false);

  // Alert propio, renderizado DENTRO del <Modal> (ver abajo). Un <Modal> nativo se
  // presenta en una ventana del sistema por encima de todo el arbol React, asi que
  // un alert montado en la pantalla padre queda detras y el usuario no lo ve.
  const { showAlert, AlertComponent } = useCustomAlert();

  // Load zones once when modal opens. Sólo zonas con complejos cargados: elegir
  // una zona vacía era un callejón sin salida (no hay texto libre de reemplazo).
  useEffect(() => {
    if (!visible || zonesLoaded) return;
    fetchZonesWithVenues()
      .then(setZones)
      .catch(() => {})
      .finally(() => setZonesLoaded(true));
  }, [visible, zonesLoaded]);

  // Load venues when zone changes
  useEffect(() => {
    if (!selectedZoneId) {
      setVenues([]);
      setSelectedVenue(null);
      return;
    }
    setLoadingVenues(true);
    setSelectedVenue(null);
    fetchVenuesByZone(selectedZoneId)
      .then(setVenues)
      .catch(() => setVenues([]))
      .finally(() => setLoadingVenues(false));
  }, [selectedZoneId]);

  function handleClose() {
    // Reset state
    setFormat('FUTBOL_5');
    setScheduledDate(new Date());
    setDurationMinutes(60);
    setSignalAmount('');
    setTotalCost('');
    setSelectedZoneId(null);
    setSelectedVenue(null);
    onClose();
  }

  async function handleSubmit() {
    if (loading || blockReason) return;
    setLoading(true);
    try {
      await onSubmit({
        format,
        matchType,
        scheduledAt: scheduledDate,
        durationMinutes,
        venueId: selectedVenue?.id ?? null,
        // `location` queda como denormalización para display; la fuente de verdad
        // de la cancha es `venueId`, único dato que el geofence puede usar.
        location: selectedVenue
          ? [selectedVenue.name, selectedVenue.address].filter(Boolean).join(' — ')
          : null,
        signalAmount: signalAmount ? parseFloat(signalAmount) : null,
        totalCost: totalCost ? parseFloat(totalCost) : null,
      });
      handleClose();
    } catch (err) {
      // El sheet queda abierto a proposito: el usuario no pierde lo que cargo y
      // puede corregir y reintentar sin volver a completar el formulario.
      showAlert(
        'No se pudo enviar',
        getGenericSupabaseErrorMessage(err, 'No pudimos enviar la propuesta. Intenta de nuevo.'),
      );
    } finally {
      setLoading(false);
    }
  }

  function formatDateDisplay(d: Date): string {
    return d.toLocaleDateString('es-AR', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  function formatTimeDisplay(d: Date): string {
    return d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
  }

  const selectedZoneName = zones.find((z) => z.id === selectedZoneId)?.name ?? null;

  // Un partido de RANKING mueve ELO y se valida con geofence al hacer check-in:
  // sin `venue_id` no hay coordenadas contra las cuales medir, así que la cancha
  // oficial es obligatoria. En AMISTOSO queda opcional, pero si se define tiene
  // que salir igual del catálogo — no hay otra vía de carga.
  const blockReason: string | null =
    matchType === 'RANKING' && !selectedVenue
      ? zonesLoaded && zones.length === 0
        ? 'Todavía no hay complejos cargados. Escribinos para sumar tu cancha y poder proponer partidos de ranking.'
        : 'Elegí zona y complejo: los partidos de ranking necesitan una cancha oficial para validar el check-in.'
      : null;

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={handleClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        className="flex-1 justify-end bg-black/60"
      >
        {/* maxHeight acota el sheet para que el ScrollView tenga un alto finito y
            pueda desplazarse hasta el fondo: los campos de seña y costo total
            estan al final y con el teclado abierto quedaban fuera de alcance. */}
        <View className="rounded-t-3xl bg-surface-container pb-10" style={{ maxHeight: '90%' }}>
          {/* Header */}
          <View className="flex-row items-center justify-between px-5 py-4">
            <Text className="font-uiBold text-lg text-neutral-on-surface">Proponer detalles</Text>
            <TouchableOpacity
              onPress={handleClose}
              activeOpacity={0.7}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            >
              <AppIcon family="material-community" name="close" size={22} color="#869585" />
            </TouchableOpacity>
          </View>

          <ScrollView
            className="px-5"
            contentContainerStyle={{ paddingBottom: 16 }}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {/* ── Date ── */}
            <Text className="font-ui mb-2 text-xs uppercase tracking-widest text-neutral-outline">
              Fecha
            </Text>
            <TouchableOpacity
              onPress={() => setShowDatePicker(true)}
              activeOpacity={0.8}
              className="mb-4 rounded-xl bg-surface-high px-4 py-3"
            >
              <Text className="font-ui text-sm text-neutral-on-surface">
                {formatDateDisplay(scheduledDate)}
              </Text>
            </TouchableOpacity>
            {showDatePicker && (
              <DateTimePicker
                value={scheduledDate}
                mode="date"
                display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                minimumDate={new Date()}
                onChange={(_e, d) => {
                  setShowDatePicker(false);
                  if (d) {
                    const merged = new Date(scheduledDate);
                    merged.setFullYear(d.getFullYear(), d.getMonth(), d.getDate());
                    setScheduledDate(merged);
                  }
                }}
              />
            )}

            {/* ── Time ── */}
            <Text className="font-ui mb-2 text-xs uppercase tracking-widest text-neutral-outline">
              Hora
            </Text>
            <TouchableOpacity
              onPress={() => setShowTimePicker(true)}
              activeOpacity={0.8}
              className="mb-4 rounded-xl bg-surface-high px-4 py-3"
            >
              <Text className="font-ui text-sm text-neutral-on-surface">
                {formatTimeDisplay(scheduledDate)}
              </Text>
            </TouchableOpacity>
            {showTimePicker && (
              <DateTimePicker
                value={scheduledDate}
                mode="time"
                is24Hour
                display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                onChange={(_e, d) => {
                  setShowTimePicker(false);
                  if (d) {
                    const merged = new Date(scheduledDate);
                    merged.setHours(d.getHours(), d.getMinutes());
                    setScheduledDate(merged);
                  }
                }}
              />
            )}

            {/* ── Duration ── */}
            <Text className="font-ui mb-2 text-xs uppercase tracking-widest text-neutral-outline">
              Duración
            </Text>
            <View className="mb-4 flex-row gap-2">
              {DURATIONS.map((d) => (
                <TouchableOpacity
                  key={d}
                  onPress={() => setDurationMinutes(d)}
                  activeOpacity={0.8}
                  className={`flex-1 rounded-xl py-2.5 ${
                    durationMinutes === d ? 'bg-brand-primary' : 'bg-surface-high'
                  }`}
                >
                  <Text
                    className={`font-uiBold text-center text-sm ${
                      durationMinutes === d ? 'text-[#003914]' : 'text-neutral-on-surface-variant'
                    }`}
                  >
                    {d} min
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* ── Format ── */}
            <Text className="font-ui mb-2 text-xs uppercase tracking-widest text-neutral-outline">
              Formato
            </Text>
            <View className="mb-4 flex-row flex-wrap gap-2">
              {FORMATS.map((f) => (
                <TouchableOpacity
                  key={f.value}
                  onPress={() => setFormat(f.value)}
                  activeOpacity={0.8}
                  className={`rounded-xl px-4 py-2.5 ${
                    format === f.value ? 'bg-brand-primary' : 'bg-surface-high'
                  }`}
                >
                  <Text
                    className={`font-uiBold text-sm ${
                      format === f.value ? 'text-[#003914]' : 'text-neutral-on-surface-variant'
                    }`}
                  >
                    {f.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* ── Zone ── */}
            <Text className="font-ui mb-2 text-xs uppercase tracking-widest text-neutral-outline">
              Zona
            </Text>
            {!zonesLoaded ? (
              <ActivityIndicator color="#53E076" style={{ marginBottom: 16, alignSelf: 'flex-start' }} />
            ) : zones.length === 0 ? (
              <View className="mb-4 rounded-xl bg-surface-high px-4 py-3">
                <Text className="font-ui text-sm text-neutral-on-surface-variant">
                  Todavía no hay zonas con complejos cargados.
                </Text>
              </View>
            ) : (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                className="mb-4"
                contentContainerStyle={{ gap: 8, paddingRight: 4 }}
              >
                {zones.map((z) => (
                  <TouchableOpacity
                    key={z.id}
                    onPress={() => setSelectedZoneId(z.id === selectedZoneId ? null : z.id)}
                    activeOpacity={0.8}
                    className={`rounded-xl px-4 py-2.5 ${
                      selectedZoneId === z.id
                        ? 'bg-brand-primary'
                        : 'bg-surface-high'
                    }`}
                  >
                    <Text
                      className={`font-uiBold text-sm ${
                        selectedZoneId === z.id ? 'text-[#003914]' : 'text-neutral-on-surface-variant'
                      }`}
                    >
                      {z.name}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}

            {/* ── Venue (shown after zone is selected) ── */}
            {selectedZoneId && (
              <>
                <Text className="font-ui mb-2 text-xs uppercase tracking-widest text-neutral-outline">
                  Complejo en {selectedZoneName}
                </Text>
                {loadingVenues ? (
                  <ActivityIndicator color="#53E076" style={{ marginBottom: 16, alignSelf: 'flex-start' }} />
                ) : venues.length === 0 ? (
                  <View className="mb-1 rounded-xl bg-surface-high px-4 py-3">
                    <Text className="font-ui text-sm text-neutral-on-surface-variant">
                      Los complejos de esta zona ya no están disponibles. Elegí otra zona.
                    </Text>
                  </View>
                ) : (
                  <View className="mb-1 gap-2">
                    {venues.map((v) => (
                      <TouchableOpacity
                        key={v.id}
                        onPress={() => setSelectedVenue(selectedVenue?.id === v.id ? null : v)}
                        activeOpacity={0.8}
                        className={`rounded-xl p-3 ${
                          selectedVenue?.id === v.id
                            ? 'border border-brand-primary/40 bg-brand-primary/10'
                            : 'bg-surface-high'
                        }`}
                      >
                        <View className="flex-row items-center gap-3">
                          <View
                            className={`h-5 w-5 items-center justify-center rounded-full border-2 ${
                              selectedVenue?.id === v.id
                                ? 'border-brand-primary'
                                : 'border-neutral-outline'
                            }`}
                          >
                            {selectedVenue?.id === v.id && (
                              <View className="h-2.5 w-2.5 rounded-full bg-brand-primary" />
                            )}
                          </View>
                          <View className="flex-1">
                            <Text className="font-uiBold text-sm text-neutral-on-surface">
                              {v.name}
                            </Text>
                            {v.address && (
                              <Text className="font-ui text-xs text-neutral-on-surface-variant">
                                {v.address}
                              </Text>
                            )}
                          </View>
                        </View>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
                <View className="mb-4" />
              </>
            )}

            {/* ── Costs ── */}
            <View className="mb-4 flex-row gap-2">
              <View className="flex-1">
                <Text className="font-ui mb-2 text-xs uppercase tracking-widest text-neutral-outline">
                  Seña ($)
                </Text>
                <TextInput
                  value={signalAmount}
                  onChangeText={setSignalAmount}
                  keyboardType="numeric"
                  placeholder="0"
                  placeholderTextColor="#869585"
                  className="rounded-xl bg-surface-high px-4 py-3 text-sm text-neutral-on-surface"
                />
              </View>
              <View className="flex-1">
                <Text className="font-ui mb-2 text-xs uppercase tracking-widest text-neutral-outline">
                  Costo total ($)
                </Text>
                <TextInput
                  value={totalCost}
                  onChangeText={setTotalCost}
                  keyboardType="numeric"
                  placeholder="0"
                  placeholderTextColor="#869585"
                  className="rounded-xl bg-surface-high px-4 py-3 text-sm text-neutral-on-surface"
                />
              </View>
            </View>

            {/* ── Submit ── */}
            {/* Motivo inline en vez de alert: el usuario ve por qué no puede
                enviar sin tener que tocar el botón para descubrirlo. */}
            {blockReason && (
              <View className="mb-2 flex-row items-start gap-2 rounded-xl bg-warning-tertiary/10 px-3 py-2">
                <AppIcon family="material-community" name="alert-circle-outline" size={14} color="#FABD32" />
                <Text className="font-ui flex-1 text-xs text-warning-tertiary">{blockReason}</Text>
              </View>
            )}
            <TouchableOpacity
              onPress={() => void handleSubmit()}
              disabled={loading || blockReason !== null}
              activeOpacity={0.8}
              className={`rounded-xl py-3.5 ${
                loading || blockReason !== null ? 'bg-surface-high' : 'bg-brand-primary'
              }`}
            >
              <Text
                className={`font-uiBold text-center text-sm ${
                  loading || blockReason !== null ? 'text-neutral-outline' : 'text-[#003914]'
                }`}
              >
                {loading ? 'Enviando...' : 'Enviar propuesta'}
              </Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>

      {/* Dentro del <Modal>: si se montara en la pantalla padre quedaria detras
          de esta ventana nativa y el error seria invisible. */}
      {AlertComponent}
    </Modal>
  );
}
