import { useState } from 'react';
import {
  View,
  Text,
  Modal,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { AppIcon } from '@/components/ui/AppIcon';
import { useCustomAlert } from '@/hooks/useCustomAlert';
import { joinMatchAsGuest } from '@/lib/match-actions';
import { getGenericSupabaseErrorMessage } from '@/lib/auth-error-messages';

interface Props {
  visible: boolean;
  onClose: () => void;
  /** Called after a successful join so the caller can navigate to the match */
  onJoined: (matchId: string, myTeamId: string) => void;
}

export function GuestJoinModal({ visible, onClose, onJoined }: Props) {
  const [code, setCode] = useState('');
  const [teamSide, setTeamSide] = useState<'A' | 'B' | null>(null);
  const [preview, setPreview] = useState<{ teamAName: string; teamBName: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const { showAlert, AlertComponent } = useCustomAlert();

  function handleClose() {
    setCode('');
    setTeamSide(null);
    setPreview(null);
    onClose();
  }

  async function handleJoin() {
    const trimmed = code.trim().toUpperCase();
    if (trimmed.length === 0) {
      showAlert('Código requerido', 'Ingresá el código del partido.');
      return;
    }
    if (!teamSide) {
      showAlert('Equipo requerido', 'Seleccioná en qué equipo querés jugar.');
      return;
    }

    setLoading(true);
    try {
      const result = await joinMatchAsGuest(trimmed, teamSide);
      setPreview({ teamAName: result.teamAName, teamBName: result.teamBName });
      handleClose();
      onJoined(result.matchId, result.teamId);
    } catch (err) {
      showAlert('Error', getGenericSupabaseErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={handleClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        className="flex-1 justify-end bg-black/60"
      >
        <View className="rounded-t-3xl bg-surface-container pb-10">
          {/* Header */}
          <View className="flex-row items-center justify-between px-5 py-4">
            <Text className="font-uiBold text-lg text-neutral-on-surface">Unirse como invitado</Text>
            <TouchableOpacity onPress={handleClose} activeOpacity={0.7}>
              <AppIcon family="material-community" name="close" size={22} color="#869585" />
            </TouchableOpacity>
          </View>

          <View className="px-5 gap-5">
            {/* Code input */}
            <View>
              <Text className="font-ui mb-2 text-xs uppercase tracking-widest text-neutral-outline">
                Código del partido
              </Text>
              <TextInput
                value={code}
                onChangeText={(t) => setCode(t.toUpperCase())}
                placeholder="Ej: AB12CD"
                placeholderTextColor="#869585"
                autoCapitalize="characters"
                autoCorrect={false}
                maxLength={8}
                className="rounded-xl border border-neutral-outline/30 bg-surface-high px-4 py-3 font-displayBlack text-2xl tracking-[6px] text-neutral-on-surface"
              />
            </View>

            {/* Team side selector */}
            <View>
              <Text className="font-ui mb-2 text-xs uppercase tracking-widest text-neutral-outline">
                ¿En qué equipo jugás?
              </Text>
              <View className="flex-row gap-3">
                {(['A', 'B'] as const).map((side) => (
                  <TouchableOpacity
                    key={side}
                    onPress={() => setTeamSide(side)}
                    activeOpacity={0.8}
                    className={`flex-1 rounded-xl border py-3 ${
                      teamSide === side
                        ? 'border-brand-primary bg-brand-primary/15'
                        : 'border-neutral-outline/30 bg-surface-high'
                    }`}
                  >
                    <Text
                      className={`font-uiBold text-center text-sm ${
                        teamSide === side ? 'text-brand-primary' : 'text-neutral-on-surface-variant'
                      }`}
                    >
                      Equipo {side}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Info note */}
            <View className="flex-row items-start gap-2 rounded-xl bg-info-secondary/10 px-4 py-3">
              <AppIcon family="material-community" name="information-outline" size={16} color="#8CCDFF" />
              <Text className="font-ui flex-1 text-xs leading-5 text-info-secondary">
                Como invitado podés hacer check-in y cargar el resultado del partido, pero no formás parte del equipo de forma permanente.
              </Text>
            </View>

            {/* Submit */}
            <TouchableOpacity
              onPress={() => void handleJoin()}
              disabled={loading}
              activeOpacity={0.8}
              className="rounded-xl bg-brand-primary py-3.5"
            >
              <Text className="font-uiBold text-center text-sm text-[#003914]">
                {loading ? 'Uniéndose...' : 'Unirse al partido'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
        {AlertComponent}
      </KeyboardAvoidingView>
    </Modal>
  );
}
