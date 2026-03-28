import { useState } from 'react';
import {
  View,
  Text,
  Modal,
  ScrollView,
  TouchableOpacity,
  TextInput,
} from 'react-native';
import { AppIcon } from '@/components/ui/AppIcon';
import type { CancellationFormData, CancellationReason } from '@/components/matches/types';

interface Props {
  visible: boolean;
  onClose: () => void;
  onSubmit: (data: CancellationFormData) => Promise<void>;
  isLateWarning?: boolean;
}

const REASONS: { value: CancellationReason; label: string; description: string }[] = [
  {
    value: 'MUTUO_ACUERDO',
    label: 'Mutuo acuerdo',
    description: 'Ambos equipos acordaron cancelar',
  },
  {
    value: 'FUERZA_MAYOR',
    label: 'Fuerza mayor',
    description: 'Situación imprevista e inevitable',
  },
  {
    value: 'LESION',
    label: 'Lesión',
    description: 'Lesión de jugador clave',
  },
  {
    value: 'CAMPO_NO_DISPONIBLE',
    label: 'Campo no disponible',
    description: 'La cancha no está disponible',
  },
  {
    value: 'FALTA_QUORUM',
    label: 'Falta de quórum',
    description: 'No hay suficientes jugadores',
  },
  {
    value: 'UNILATERAL',
    label: 'Unilateral',
    description: 'Decisión unilateral del equipo',
  },
];

export function CancellationModal({ visible, onClose, onSubmit, isLateWarning }: Props) {
  const [reason, setReason] = useState<CancellationReason>('MUTUO_ACUERDO');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit() {
    setLoading(true);
    try {
      await onSubmit({ reason, notes: notes.trim() || null });
      onClose();
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View className="flex-1 justify-end bg-black/60">
        <View className="rounded-t-3xl bg-surface-container pb-10">
          {/* Header */}
          <View className="flex-row items-center justify-between px-5 py-4">
            <Text className="font-uiBold text-lg text-neutral-on-surface">
              Solicitar cancelación
            </Text>
            <TouchableOpacity onPress={onClose} activeOpacity={0.7}>
              <AppIcon family="material-community" name="close" size={22} color="#869585" />
            </TouchableOpacity>
          </View>

          <ScrollView
            className="px-5"
            contentContainerStyle={{ paddingBottom: 16 }}
            showsVerticalScrollIndicator={false}
          >
            {/* Late warning */}
            {isLateWarning && (
              <View className="mb-4 flex-row gap-3 rounded-xl bg-warning-tertiary/10 p-3">
                <AppIcon
                  family="material-community"
                  name="alert"
                  size={18}
                  color="#FABD32"
                />
                <Text className="font-ui flex-1 text-sm text-warning-tertiary">
                  El partido es en menos de 24 horas. Cancelar tarde puede generar una penalización
                  de Fair Play.
                </Text>
              </View>
            )}

            {/* Reason selector */}
            <Text className="font-ui mb-3 text-xs uppercase tracking-widest text-neutral-outline">
              Motivo
            </Text>
            <View className="mb-4 gap-2">
              {REASONS.map((r) => (
                <TouchableOpacity
                  key={r.value}
                  onPress={() => setReason(r.value)}
                  activeOpacity={0.8}
                  className={`flex-row items-center gap-3 rounded-xl p-3 ${
                    reason === r.value
                      ? 'border border-brand-primary/40 bg-brand-primary/10'
                      : 'bg-surface-high'
                  }`}
                >
                  <View
                    className={`h-5 w-5 items-center justify-center rounded-full border-2 ${
                      reason === r.value ? 'border-brand-primary' : 'border-neutral-outline'
                    }`}
                  >
                    {reason === r.value && (
                      <View className="h-2.5 w-2.5 rounded-full bg-brand-primary" />
                    )}
                  </View>
                  <View className="flex-1">
                    <Text className="font-uiBold text-sm text-neutral-on-surface">{r.label}</Text>
                    <Text className="font-ui text-xs text-neutral-on-surface-variant">
                      {r.description}
                    </Text>
                  </View>
                </TouchableOpacity>
              ))}
            </View>

            {/* Notes */}
            <Text className="font-ui mb-2 text-xs uppercase tracking-widest text-neutral-outline">
              Notas adicionales (opcional)
            </Text>
            <TextInput
              value={notes}
              onChangeText={setNotes}
              multiline
              numberOfLines={3}
              placeholder="Describe la situación..."
              placeholderTextColor="#869585"
              className="mb-4 rounded-xl bg-surface-high px-4 py-3 text-sm text-neutral-on-surface"
              style={{ height: 80, textAlignVertical: 'top' }}
            />

            {/* Submit */}
            <TouchableOpacity
              onPress={() => void handleSubmit()}
              disabled={loading}
              activeOpacity={0.8}
              className="rounded-xl bg-danger-error/80 py-3.5"
            >
              <Text className="font-uiBold text-center text-sm text-surface-base">
                {loading ? 'Enviando...' : 'Solicitar cancelación'}
              </Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}
