import { useState } from 'react';
import { ActivityIndicator, Text, TouchableOpacity, View } from 'react-native';
import { sendChallenge, validateRankingChallenge } from '@/lib/challenge-actions';

interface Props {
    challengerTeamId: string;
    opponentTeamId: string;
    matchType: 'RANKING' | 'AMISTOSO';
    createdBy: string;
    showAlert: (title: string, message: string, onClose?: () => void) => void;
    onSuccess?: () => void;
    alreadyChallenged?: boolean;
}

export function ChallengeButton({ challengerTeamId, opponentTeamId, matchType, createdBy, showAlert, onSuccess, alreadyChallenged }: Props) {
    const [loading, setLoading] = useState(false);
    const [validating, setValidating] = useState(false);
    const [confirming, setConfirming] = useState(false);
    const [eloDiffWarning, setEloDiffWarning] = useState(false);

    const isRanking = matchType === 'RANKING';

    async function handleInitiate() {
        if (isRanking) {
            // Validar restricciones de ranking antes de mostrar confirmación
            try {
                setValidating(true);
                const result = await validateRankingChallenge(challengerTeamId, opponentTeamId);
                if (!result.canChallenge) {
                    showAlert('No se puede desafiar', result.errorMessage ?? 'Este desafío no está permitido.');
                    return;
                }
                setEloDiffWarning(result.eloDiffWarning);
                setConfirming(true);
            } catch {
                showAlert('Error', 'No se pudo verificar las condiciones del desafío.');
            } finally {
                setValidating(false);
            }
        } else {
            setEloDiffWarning(false);
            setConfirming(true);
        }
    }

    async function handleConfirm() {
        setConfirming(false);
        try {
            setLoading(true);
            await sendChallenge(challengerTeamId, opponentTeamId, createdBy, matchType);
            showAlert('¡Enviado!', 'El desafío fue enviado correctamente al rival.', onSuccess);
        } catch (error: any) {
            showAlert('Error', error.message || 'No se pudo enviar el desafío.');
        } finally {
            setLoading(false);
        }
    }

    if (alreadyChallenged) {
        return (
            <View className={`items-center rounded-xl py-3 ${isRanking ? 'bg-surface-high' : 'border border-neutral-outline/20 bg-transparent'}`}>
                <Text className="font-displayBlack text-[12px] uppercase tracking-widest text-neutral-on-surface-variant">
                    {isRanking ? '⏳ Desafío enviado' : '⏳ Amistoso enviado'}
                </Text>
            </View>
        );
    }

    if (confirming) {
        return (
            <View className={`rounded-xl ${isRanking ? 'bg-brand-primary/10 border border-brand-primary/30' : 'border border-info-secondary/20 bg-transparent'} px-4 py-3`}>
                <Text className="mb-2 text-center font-ui text-xs text-neutral-on-surface-variant">
                    ¿Confirmar desafío {isRanking ? 'por el ranking' : 'amistoso'}?
                </Text>
                {eloDiffWarning && (
                    <View className="mb-3 rounded-lg bg-warning-tertiary/10 px-3 py-2">
                        <Text className="text-center font-ui text-[10px] text-warning-tertiary">
                            ⚠️ Diferencia de rating {'>'} 400 pts. Bajo impacto en el ranking.
                        </Text>
                    </View>
                )}
                <View className="flex-row gap-2">
                    <TouchableOpacity
                        activeOpacity={0.7}
                        onPress={() => setConfirming(false)}
                        className="flex-1 items-center rounded-lg border border-neutral-outline/30 py-2"
                    >
                        <Text className="font-uiBold text-[11px] text-neutral-on-surface-variant">Cancelar</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        activeOpacity={0.8}
                        onPress={handleConfirm}
                        className={`flex-1 items-center rounded-lg py-2 ${isRanking ? 'bg-brand-primary' : 'bg-info-secondary/20'}`}
                    >
                        <Text className={`font-displayBlack text-[11px] uppercase tracking-widest ${isRanking ? 'text-surface-base' : 'text-info-secondary'}`}>
                            ✓ Enviar
                        </Text>
                    </TouchableOpacity>
                </View>
            </View>
        );
    }

    return (
        <TouchableOpacity
            activeOpacity={0.8}
            disabled={loading || validating}
            onPress={handleInitiate}
            className={`items-center rounded-xl py-3 ${isRanking ? 'bg-brand-primary' : 'border border-info-secondary/30 bg-transparent'}`}
        >
            {loading || validating ? (
                <ActivityIndicator color={isRanking ? '#131313' : '#8CCDFF'} size="small" />
            ) : (
                <Text className={`font-displayBlack uppercase tracking-widest ${isRanking ? 'text-[13px] text-surface-base' : 'text-[12px] text-info-secondary'}`}>
                    {isRanking ? '⚔️ Desafiar al ranking' : 'Desafiar amistoso'}
                </Text>
            )}
        </TouchableOpacity>
    );
}
