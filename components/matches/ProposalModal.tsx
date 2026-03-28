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
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { AppIcon } from '@/components/ui/AppIcon';
import type { MatchProposalFormData } from '@/components/matches/types';
import type { Database } from '@/types/supabase';
import { fetchActiveZones, fetchVenuesByZone } from '@/lib/venue-data';
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

  // Zone + Venue
  const [zones, setZones] = useState<ZoneEntry[]>([]);
  const [selectedZoneId, setSelectedZoneId] = useState<string | null>(null);
  const [venues, setVenues] = useState<VenueEntry[]>([]);
  const [selectedVenue, setSelectedVenue] = useState<VenueEntry | null>(null);
  const [loadingVenues, setLoadingVenues] = useState(false);
  const [freeTextLocation, setFreeTextLocation] = useState('');
  const [zonesLoaded, setZonesLoaded] = useState(false);

  // Load zones once when modal opens
  useEffect(() => {
    if (!visible || zonesLoaded) return;
    fetchActiveZones()
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
    setFreeTextLocation('');
    onClose();
  }

  async function handleSubmit() {
    setLoading(true);
    try {
      await onSubmit({
        format,
        matchType,
        scheduledAt: scheduledDate,
        durationMinutes,
        venueId: selectedVenue?.id ?? null,
        location: selectedVenue
          ? [selectedVenue.name, selectedVenue.address].filter(Boolean).join(' — ')
          : freeTextLocation.trim() || null,
        signalAmount: signalAmount ? parseFloat(signalAmount) : null,
        totalCost: totalCost ? parseFloat(totalCost) : null,
      });
      handleClose();
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

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={handleClose}>
      <View className="flex-1 justify-end bg-black/60">
        <View className="rounded-t-3xl bg-surface-container pb-10">
          {/* Header */}
          <View className="flex-row items-center justify-between px-5 py-4">
            <Text className="font-uiBold text-lg text-neutral-on-surface">Proponer detalles</Text>
            <TouchableOpacity onPress={handleClose} activeOpacity={0.7}>
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
                  No hay zonas disponibles
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
                      Sin complejos registrados en esta zona
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
                {/* Free-text fallback shown only when no venue is selected */}
                {!selectedVenue && (
                  <View className="mb-4 mt-2">
                    <Text className="font-ui mb-1 text-[10px] text-neutral-outline">
                      O ingresá la dirección manualmente
                    </Text>
                    <TextInput
                      value={freeTextLocation}
                      onChangeText={setFreeTextLocation}
                      placeholder="Ej: Av. Santa Fe 1234, piso 2"
                      placeholderTextColor="#869585"
                      className="rounded-xl bg-surface-high px-4 py-3 text-sm text-neutral-on-surface"
                    />
                  </View>
                )}
                {selectedVenue && <View className="mb-4" />}
              </>
            )}

            {/* Free-text shown when no zone selected */}
            {!selectedZoneId && (
              <>
                <Text className="font-ui mb-2 text-xs uppercase tracking-widest text-neutral-outline">
                  Dirección (opcional)
                </Text>
                <TextInput
                  value={freeTextLocation}
                  onChangeText={setFreeTextLocation}
                  placeholder="Ej: Complejo El Potrillo, Palermo"
                  placeholderTextColor="#869585"
                  className="mb-4 rounded-xl bg-surface-high px-4 py-3 text-sm text-neutral-on-surface"
                />
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
            <TouchableOpacity
              onPress={() => void handleSubmit()}
              disabled={loading}
              activeOpacity={0.8}
              className="rounded-xl bg-brand-primary py-3.5"
            >
              <Text className="font-uiBold text-center text-sm text-[#003914]">
                {loading ? 'Enviando...' : 'Enviar propuesta'}
              </Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}
