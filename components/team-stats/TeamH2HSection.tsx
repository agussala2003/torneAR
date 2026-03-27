import { Text, View } from 'react-native';
import type { H2HMatch } from './types';

interface Props {
    h2h: H2HMatch[];
    myTeamId: string;
    opponentName: string;
}

export function TeamH2HSection({ h2h, myTeamId, opponentName }: Props) {
    if (!h2h || h2h.length === 0) {
        return (
            <View className="mt-3">
                <View className="mb-3 flex-row items-center">
                    <Text className="font-display text-sm uppercase tracking-wider text-neutral-on-surface-variant">Head to Head</Text>
                    <Text className="font-display text-sm tracking-wider text-neutral-on-surface-variant"> vs {opponentName}</Text>
                </View>
                <View className="rounded-xl bg-surface-low px-4 py-5">
                    <Text className="font-ui text-sm text-neutral-on-surface-variant">
                        Aún no jugaron partidos entre sí.
                    </Text>
                </View>
            </View>
        );
    }

    let myWins = 0, draws = 0, myLosses = 0;
    h2h.forEach(match => {
        const isTeamA = match.teamAId === myTeamId;
        const myGoals = isTeamA ? match.teamAGoals : match.teamBGoals;
        const oppGoals = isTeamA ? match.teamBGoals : match.teamAGoals;

        if (myGoals > oppGoals) myWins++;
        else if (myGoals === oppGoals) draws++;
        else myLosses++;
    });

    return (
        <View className="mt-3">
            <View className="mb-3 flex-row items-center">
                <Text className="font-display text-sm uppercase tracking-wider text-neutral-on-surface-variant">Head to Head</Text>
                <Text className="font-display text-sm tracking-wider text-neutral-on-surface-variant"> vs {opponentName}</Text>
            </View>

            <View className="mb-3 flex-row gap-1.5">
                <View className="flex-1 items-center rounded-xl bg-surface-container py-2.5">
                    <Text className="font-displayBlack text-[22px] leading-none text-brand-primary">{myWins}</Text>
                    <Text className="mt-0.5 font-ui text-[10px] text-neutral-on-surface-variant">Mis victorias</Text>
                </View>
                <View className="flex-1 items-center rounded-xl bg-surface-container py-2.5">
                    <Text className="font-displayBlack text-[22px] leading-none text-neutral-on-surface-variant">{draws}</Text>
                    <Text className="mt-0.5 font-ui text-[10px] text-neutral-on-surface-variant">Empates</Text>
                </View>
                <View className="flex-1 items-center rounded-xl bg-surface-container py-2.5">
                    <Text className="font-displayBlack text-[22px] leading-none text-danger-error">{myLosses}</Text>
                    <Text className="mt-0.5 font-ui text-[10px] text-neutral-on-surface-variant">Sus victorias</Text>
                </View>
            </View>

            {h2h.map(match => {
                const isTeamA = match.teamAId === myTeamId;
                const myGoals = isTeamA ? match.teamAGoals : match.teamBGoals;
                const oppGoals = isTeamA ? match.teamBGoals : match.teamAGoals;
                const isWin = myGoals > oppGoals;
                const isDraw = myGoals === oppGoals;
                const scoreColor = isWin ? 'text-brand-primary' : isDraw ? 'text-neutral-on-surface' : 'text-danger-error';

                const dateObj = new Date(match.scheduledAt);
                const dateStr = `${dateObj.getDate().toString().padStart(2, '0')}/${(dateObj.getMonth() + 1).toString().padStart(2, '0')}/${dateObj.getFullYear().toString().slice(-2)}`;

                return (
                    <View key={match.matchId} className="mb-1.5 flex-row items-center rounded-xl bg-surface-container px-3 py-2">
                        <Text className="w-14 font-ui text-[10px] text-neutral-on-surface-variant">{dateStr}</Text>
                        <Text className={`flex-1 text-center font-displayBlack text-[17px] ${scoreColor}`}>
                            {myGoals} – {oppGoals}
                        </Text>
                        <View className="w-10 items-end">
                            {match.matchType === 'RANKING' ? (
                                <Text className="font-ui text-[10px] text-warning-tertiary">🏆</Text>
                            ) : (
                                <Text className="font-ui text-[10px] text-neutral-outline">AMI</Text>
                            )}
                        </View>
                    </View>
                );
            })}
        </View>
    );
}