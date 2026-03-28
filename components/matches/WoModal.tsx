import { useState } from 'react';
import {
  View,
  Text,
  Modal,
  ScrollView,
  TouchableOpacity,
  Alert,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Image } from 'expo-image';
import { AppIcon } from '@/components/ui/AppIcon';
import type { WoClaimFormData, WoClaimEntry } from '@/components/matches/types';

type WoReason = WoClaimEntry['reason'];

interface Props {
  visible: boolean;
  onClose: () => void;
  onSubmit: (data: WoClaimFormData) => Promise<void>;
}

const REASONS: { value: WoReason; label: string; description: string }[] = [
  {
    value: 'NO_PRESENTACION',
    label: 'No presentación',
    description: 'El rival no se presentó al partido',
  },
  {
    value: 'ABANDONO',
    label: 'Abandono',
    description: 'El rival abandonó el partido en curso',
  },
  {
    value: 'INCIDENTE_CONDUCTA',
    label: 'Incidente de conducta',
    description: 'Conducta antideportiva grave del rival',
  },
];

export function WoModal({ visible, onClose, onSubmit }: Props) {
  const [reason, setReason] = useState<WoReason>('NO_PRESENTACION');
  const [photoBase64, setPhotoBase64] = useState<string | null>(null);
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [photoMimeType, setPhotoMimeType] = useState('image/jpeg');
  const [loading, setLoading] = useState(false);

  async function handlePickImage() {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permiso requerido', 'Necesitamos acceso a tu galería para adjuntar evidencia.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      quality: 0.7,
      base64: true,
    });
    if (!result.canceled && result.assets[0]) {
      setPhotoBase64(result.assets[0].base64 ?? null);
      setPhotoUri(result.assets[0].uri);
      setPhotoMimeType(result.assets[0].mimeType ?? 'image/jpeg');
    }
  }

  async function handleTakePhoto() {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permiso requerido', 'Necesitamos acceso a tu cámara para tomar evidencia.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: true,
      quality: 0.7,
      base64: true,
    });
    if (!result.canceled && result.assets[0]) {
      setPhotoBase64(result.assets[0].base64 ?? null);
      setPhotoUri(result.assets[0].uri);
      setPhotoMimeType(result.assets[0].mimeType ?? 'image/jpeg');
    }
  }

  function handlePhotoPress() {
    Alert.alert('Agregar evidencia', 'Elegí una opción', [
      { text: 'Galería', onPress: () => void handlePickImage() },
      { text: 'Cámara', onPress: () => void handleTakePhoto() },
      { text: 'Cancelar', style: 'cancel' },
    ]);
  }

  async function handleSubmit() {
    if (!photoBase64) {
      Alert.alert('Foto requerida', 'Debés adjuntar una foto como evidencia para reclamar un WO.');
      return;
    }
    setLoading(true);
    try {
      await onSubmit({
        reason,
        photoBase64,
        photoMimeType,
        notes: null,
      });
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
            <Text className="font-uiBold text-lg text-neutral-on-surface">Reclamar WO</Text>
            <TouchableOpacity onPress={onClose} activeOpacity={0.7}>
              <AppIcon family="material-community" name="close" size={22} color="#869585" />
            </TouchableOpacity>
          </View>

          <ScrollView
            className="px-5"
            contentContainerStyle={{ paddingBottom: 16 }}
            showsVerticalScrollIndicator={false}
          >
            {/* Info banner */}
            <View className="mb-4 rounded-xl bg-info-secondary/10 p-4">
              <View className="mb-2 flex-row items-center gap-2">
                <AppIcon family="material-community" name="information" size={18} color="#8CCDFF" />
                <Text className="font-uiBold text-sm text-info-secondary">Reglas del WO</Text>
              </View>
              <Text className="font-ui text-sm leading-5 text-neutral-on-surface-variant">
                Un WO se otorga cuando el equipo rival no cumple sus obligaciones deportivas. La
                solicitud será revisada por administración. Se requiere evidencia fotográfica.
                Reclamar falsamente puede resultar en penalización de Fair Play.
              </Text>
            </View>

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

            {/* Photo upload area */}
            <Text className="font-ui mb-2 text-xs uppercase tracking-widest text-neutral-outline">
              Evidencia fotográfica *
            </Text>
            <TouchableOpacity
              onPress={handlePhotoPress}
              activeOpacity={0.8}
              className={`mb-4 overflow-hidden rounded-xl border-2 border-dashed ${
                photoUri
                  ? 'border-brand-primary'
                  : 'border-neutral-outline/40 bg-surface-high'
              }`}
            >
              {photoUri ? (
                <Image
                  source={{ uri: photoUri }}
                  style={{ width: '100%', height: 160 }}
                  contentFit="cover"
                />
              ) : (
                <View className="items-center justify-center py-8">
                  <AppIcon family="material-community" name="camera-plus" size={32} color="#869585" />
                  <Text className="font-ui mt-2 text-sm text-neutral-outline">
                    Toca para agregar foto
                  </Text>
                  <Text className="font-ui mt-1 text-xs text-neutral-outline">
                    Galería o cámara
                  </Text>
                </View>
              )}
            </TouchableOpacity>
            {photoUri && (
              <TouchableOpacity
                onPress={handlePhotoPress}
                activeOpacity={0.8}
                className="mb-4 -mt-2 items-center"
              >
                <Text className="font-ui text-xs text-neutral-outline">Cambiar foto</Text>
              </TouchableOpacity>
            )}

            {/* Submit */}
            <TouchableOpacity
              onPress={() => void handleSubmit()}
              disabled={loading}
              activeOpacity={0.8}
              className="rounded-xl bg-warning-tertiary/80 py-3.5"
            >
              <Text className="font-uiBold text-center text-sm text-surface-base">
                {loading ? 'Enviando...' : 'Enviar reclamo WO'}
              </Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}
