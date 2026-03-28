import { useCallback, useState } from 'react';
import { ScrollView, Text, View, TouchableOpacity, ActivityIndicator } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Image } from 'expo-image';
import { useTeamStore } from '@/stores/teamStore';
import { GlobalHeader } from '@/components/GlobalHeader';
import { AppIcon } from '@/components/ui/AppIcon';
import { useCustomAlert } from '@/hooks/useCustomAlert';
import { fetchChallengesInbox, acceptChallengeWithNotification, updateChallengeStatus, cancelChallenge } from '@/lib/challenge-actions';
import type { ChallengeInboxEntry } from '@/components/ranking/types';

const STATUS_CONFIG: Record<string, { label: string; bg: string; text: string }> = {
    ACEPTADA: { label: '✓ Aceptado', bg: 'bg-brand-primary/15', text: 'text-brand-primary' },
    RECHAZADA: { label: '✕ Rechazado', bg: 'bg-danger-error/15', text: 'text-danger-error' },
    CANCELADA: { label: '↩ Cancelado', bg: 'bg-surface-high', text: 'text-neutral-on-surface-variant' },
};

export default function ChallengesInboxScreen() {
    const { activeTeamId } = useTeamStore();
    const { showAlert, AlertComponent } = useCustomAlert();

    const [loading, setLoading] = useState(true);
    const [challenges, setChallenges] = useState<ChallengeInboxEntry[]>([]);
    const [tab, setTab] = useState<'RECIBIDOS' | 'ENVIADOS' | 'HISTORIAL'>('RECIBIDOS');
    const [actionLoading, setActionLoading] = useState<string | null>(null);

    const loadInbox = useCallback(async () => {
        if (!activeTeamId) return;
        try {
            setLoading(true);
            const data = await fetchChallengesInbox(activeTeamId);
            setChallenges(data);
        } catch (error: any) {
            showAlert('Error', error.message || 'No se pudieron cargar los desafíos.');
        } finally {
            setLoading(false);
        }
    }, [activeTeamId, showAlert]);

    useFocusEffect(useCallback(() => { loadInbox(); }, [loadInbox]));

    async function handleAccept(c: ChallengeInboxEntry) {
        try {
            setActionLoading(c.challengeId);
            const { matchId } = await acceptChallengeWithNotification(c.challengeId, c.opponentTeamId);
            await loadInbox();
            showAlert(
                '¡Partido creado!',
                'El desafío fue aceptado. Ya tienen un partido en estado Pendiente.',
                () => router.push({ pathname: '/match-detail' as never, params: { matchId } }),
            );
        } catch (error: any) {
            showAlert('Error', error.message || 'No se pudo aceptar el desafío.');
        } finally {
            setActionLoading(null);
        }
    }

    async function handleReject(challengeId: string) {
        try {
            setActionLoading(challengeId);
            await updateChallengeStatus(challengeId, 'RECHAZADA');
            showAlert('Listo', 'Desafío rechazado.');
            await loadInbox();
        } catch (error: any) {
            showAlert('Error', error.message || 'No se pudo rechazar el desafío.');
        } finally {
            setActionLoading(null);
        }
    }

    async function handleCancel(challengeId: string) {
        try {
            setActionLoading(challengeId);
            await cancelChallenge(challengeId);
            showAlert('Cancelado', 'El desafío fue cancelado.');
            await loadInbox();
        } catch (error: any) {
            showAlert('Error', error.message || 'No se pudo cancelar el desafío.');
        } finally {
            setActionLoading(null);
        }
    }

    const filteredChallenges = challenges.filter(c => {
        if (tab === 'RECIBIDOS') return c.direction === 'RECIBIDO' && c.status === 'ENVIADA';
        if (tab === 'ENVIADOS') return c.direction === 'ENVIADO' && c.status === 'ENVIADA';
        return c.status !== 'ENVIADA';
    });

    const unreadCount = challenges.filter(c => c.direction === 'RECIBIDO' && c.status === 'ENVIADA').length;

    return (
        <View className="flex-1 bg-surface-base">
            <GlobalHeader isRankingTab />
            <ScrollView className="px-4 pt-4" contentContainerStyle={{ paddingBottom: 60 }}>

                <View className="mb-4 flex-row items-center gap-3">
                    <TouchableOpacity onPress={() => router.back()} className="rounded-xl bg-surface-high p-2">
                        <AppIcon family="material-community" name="arrow-left" size={20} color="#BCCBB9" />
                    </TouchableOpacity>
                    <Text className="font-displayBlack text-2xl uppercase tracking-widest text-brand-primary">Desafíos</Text>
                </View>

                {/* Tabs */}
                <View className="mb-5 flex-row rounded-xl bg-surface-low p-1">
                    <TouchableOpacity onPress={() => setTab('RECIBIDOS')} className={`flex-1 items-center rounded-lg py-2.5 ${tab === 'RECIBIDOS' ? 'bg-surface-high' : ''}`}>
                        <View className="flex-row items-center gap-1.5">
                            <Text className={`font-displayBlack text-[11px] uppercase tracking-widest ${tab === 'RECIBIDOS' ? 'text-neutral-on-surface' : 'text-neutral-on-surface-variant'}`}>
                                Recibidos
                            </Text>
                            {unreadCount > 0 && (
                                <View className="h-4 min-w-[16px] items-center justify-center rounded-full bg-danger-error px-1">
                                    <Text className="font-uiBold text-[8px] text-surface-base">{unreadCount > 9 ? '9+' : unreadCount}</Text>
                                </View>
                            )}
                        </View>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => setTab('ENVIADOS')} className={`flex-1 items-center rounded-lg py-2.5 ${tab === 'ENVIADOS' ? 'bg-surface-high' : ''}`}>
                        <Text className={`font-displayBlack text-[11px] uppercase tracking-widest ${tab === 'ENVIADOS' ? 'text-neutral-on-surface' : 'text-neutral-on-surface-variant'}`}>Enviados</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => setTab('HISTORIAL')} className={`flex-1 items-center rounded-lg py-2.5 ${tab === 'HISTORIAL' ? 'bg-surface-high' : ''}`}>
                        <Text className={`font-displayBlack text-[11px] uppercase tracking-widest ${tab === 'HISTORIAL' ? 'text-neutral-on-surface' : 'text-neutral-on-surface-variant'}`}>Historial</Text>
                    </TouchableOpacity>
                </View>

                {loading ? (
                    <ActivityIndicator color="#53E076" className="mt-10" />
                ) : filteredChallenges.length === 0 ? (
                    <View className="mt-10 items-center">
                        <Text className="text-4xl">📭</Text>
                        <Text className="mt-4 font-ui text-sm text-neutral-on-surface-variant">No hay desafíos en esta sección.</Text>
                    </View>
                ) : (
                    filteredChallenges.map(c => (
                        <View key={c.challengeId} className={`mb-3 rounded-[16px] p-4 ${c.direction === 'RECIBIDO' && c.status === 'ENVIADA' ? 'border border-brand-primary/20 bg-[#1b201b]' : 'bg-surface-container'}`}>
                            <View className="mb-3 flex-row items-center gap-3">
                                {c.opponentShieldUrl ? (
                                    <Image source={{ uri: c.opponentShieldUrl }} style={{ width: 42, height: 42, borderRadius: 21 }} contentFit="cover" />
                                ) : (
                                    <View className="h-[42px] w-[42px] items-center justify-center rounded-full bg-surface-high">
                                        <AppIcon family="material-community" name="shield" size={20} color="#869585" />
                                    </View>
                                )}
                                <View className="flex-1">
                                    <Text className="font-uiBold text-[13px] text-neutral-on-surface">{c.opponentTeamName}</Text>
                                    <Text className="font-ui text-[10px] text-neutral-on-surface-variant">
                                        {new Date(c.createdAt).toLocaleDateString('es-AR')} · {c.direction === 'RECIBIDO' ? 'Enviado por' : 'Por'} {c.creatorName.split(' ')[0]}
                                    </Text>
                                </View>
                                <View className={`rounded-full px-2.5 py-1 ${c.matchType === 'RANKING' ? 'bg-warning-tertiary/15' : 'bg-info-secondary/10'}`}>
                                    <Text className={`font-displayBlack text-[10px] uppercase tracking-wider ${c.matchType === 'RANKING' ? 'text-warning-tertiary' : 'text-info-secondary'}`}>
                                        {c.matchType === 'RANKING' ? '🏆 Ranking' : '🤝 Amistoso'}
                                    </Text>
                                </View>
                            </View>

                            <View className="mb-3">
                                <Text className="font-ui text-[11px] text-neutral-on-surface-variant">Rating rival: <Text className="font-uiBold text-neutral-on-surface">{c.opponentElo}</Text></Text>
                            </View>

                            {/* Recibido pendiente: Aceptar / Rechazar */}
                            {c.status === 'ENVIADA' && c.direction === 'RECIBIDO' && (
                                <View className="flex-row gap-2">
                                    {actionLoading === c.challengeId ? (
                                        <View className="flex-1 items-center py-2.5">
                                            <ActivityIndicator color="#53E076" size="small" />
                                        </View>
                                    ) : (
                                        <>
                                            <TouchableOpacity onPress={() => handleAccept(c)} className="flex-1 items-center rounded-xl bg-brand-primary py-2.5">
                                                <Text className="font-displayBlack text-[12px] uppercase tracking-widest text-surface-base">✓ Aceptar</Text>
                                            </TouchableOpacity>
                                            <TouchableOpacity onPress={() => handleReject(c.challengeId)} className="flex-1 items-center rounded-xl border border-danger-error/30 py-2.5">
                                                <Text className="font-displayBlack text-[12px] uppercase tracking-widest text-danger-error">✕ Rechazar</Text>
                                            </TouchableOpacity>
                                        </>
                                    )}
                                </View>
                            )}

                            {/* Enviado pendiente: Esperando + Cancelar */}
                            {c.status === 'ENVIADA' && c.direction === 'ENVIADO' && (
                                <View className="flex-row items-center justify-between">
                                    <Text className="font-uiBold text-[10px] text-warning-tertiary">⏳ Esperando respuesta...</Text>
                                    {actionLoading === c.challengeId ? (
                                        <ActivityIndicator color="#869585" size="small" />
                                    ) : (
                                        <TouchableOpacity onPress={() => handleCancel(c.challengeId)} className="rounded-lg border border-neutral-outline/30 px-3 py-1.5">
                                            <Text className="font-uiBold text-[10px] text-neutral-on-surface-variant">Cancelar</Text>
                                        </TouchableOpacity>
                                    )}
                                </View>
                            )}

                            {/* Historial: badge de estado */}
                            {c.status !== 'ENVIADA' && (() => {
                                const cfg = STATUS_CONFIG[c.status];
                                return cfg ? (
                                    <View className={`self-end rounded-full px-3 py-1 ${cfg.bg}`}>
                                        <Text className={`font-uiBold text-[10px] ${cfg.text}`}>{cfg.label}</Text>
                                    </View>
                                ) : null;
                            })()}
                        </View>
                    ))
                )}
            </ScrollView>
            {AlertComponent}
        </View>
    );
}
