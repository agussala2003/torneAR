import { useCallback, useEffect, useMemo, useState } from 'react';
import { ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useIsFocused } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '@/context/AuthContext';
import { useTeamStore } from '@/stores/teamStore';
import { GlobalHeader } from '@/components/GlobalHeader';
import { HomeSkeleton } from '@/components/home/HomeSkeleton';
import { useCustomAlert } from '@/hooks/useCustomAlert';
import { getGenericSupabaseErrorMessage } from '@/lib/auth-error-messages';
import { fetchHomeViewData } from '@/lib/home-data';
import { supabase } from '@/lib/supabase';
import { getSupabaseStorageUrl } from '@/lib/supabase-storage';
import { Logger } from '@/lib/logger';
import type { HomeViewData, MiniRankingEntry, PendingAction } from '@/components/home/types';
import type { Database } from '@/types/supabase';
import { TeamShield } from '@/components/ui/TeamShield';
import { HomeOnboardingState } from '@/components/home/HomeOnboardingState';
import { HomeOnboardingTour } from '@/components/home/HomeOnboardingTour';
import { MiniRankingCard } from '@/components/home/MiniRankingCard';
import { PendingActionsCard } from '@/components/home/PendingActionsCard';
import { UpcomingMatchesSection } from '@/components/home/UpcomingMatchesSection';
import { MyTeamsRankingSection } from '@/components/home/MyTeamsRankingSection';
import { QuickActionsSection } from '@/components/home/QuickActionsSection';

type TeamFormat = Database['public']['Enums']['team_format'];

/** Ventana en la que el partido deja de ser "una fecha" y pasa a ser una cuenta regresiva. */
const COUNTDOWN_WINDOW_MS = 24 * 60 * 60 * 1000;

/** Cadencia del reloj: al segundo dentro de la ventana, floja fuera de ella. */
const COUNTDOWN_TICK_MS = 1_000;
const IDLE_TICK_MS = 30_000;

/** Clave de la guía inicial. Un valor `'true'` es lo único que la apaga. */
const ONBOARDING_STORAGE_KEY = 'has_seen_onboarding';

const pad = (value: number) => String(value).padStart(2, '0');

/** "vie 8 ago · 21:30" — el formato largo, para cuando falta más de un día. */
function formatMatchDate(iso: string): string {
  const date = new Date(iso);
  const day = date.toLocaleDateString('es-AR', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
  const time = date.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
  return `${day} · ${time}`;
}

export default function HomeScreen() {
  const { profile } = useAuth();
  const activeTeamId = useTeamStore((state) => state.activeTeamId);
  const isFocused = useIsFocused();
  const [loading, setLoading] = useState(true);
  const [viewData, setViewData] = useState<HomeViewData | null>(null);
  const { showAlert, AlertComponent } = useCustomAlert();

  // ─── Mini-ranking (top 3 del formato que juega mi equipo) ──────────────────
  const [miniRanking, setMiniRanking] = useState<MiniRankingEntry[]>([]);
  const [miniRankingFormat, setMiniRankingFormat] = useState<TeamFormat | null>(null);
  const [miniRankingLoading, setMiniRankingLoading] = useState(true);

  // ─── Guía inicial ──────────────────────────────────────────────────────────
  // `null` = todavía no sabemos qué dice AsyncStorage. Distinguirlo de `false`
  // evita el parpadeo de la guía en el primer frame de cada arranque.
  const [tourPending, setTourPending] = useState<boolean | null>(null);

  // ─── Reloj de la cuenta regresiva ──────────────────────────────────────────
  const [nowTs, setNowTs] = useState(() => Date.now());

  const loadData = useCallback(async () => {
    if (!profile) {
      setLoading(false);
      setMiniRankingLoading(false);
      return;
    }
    try {
      setLoading(true);
      const data = await fetchHomeViewData(profile.id);
      setViewData(data);
      // El reloj se resincroniza con cada carga: si la pantalla estuvo horas en
      // segundo plano, `nowTs` quedó viejo y la cuenta arrancaría atrasada.
      setNowTs(Date.now());

      // ── TAREA 2 — consulta directa a Supabase para el mini-ranking ────────
      // Va acá, dentro de la pantalla, y no en `lib/home-data.ts`: son dos pasos
      // (formato del equipo → top 3 de ese formato) y un fallo suyo no puede
      // tumbar el resto del inicio, así que tiene su propio try/catch.
      const rankedTeamId =
        activeTeamId && data.myTeams.some((team) => team.id === activeTeamId)
          ? activeTeamId
          : (data.myTeams[0]?.id ?? null);

      if (!rankedTeamId) {
        setMiniRanking([]);
        setMiniRankingFormat(null);
        setMiniRankingLoading(false);
      } else {
        setMiniRankingLoading(true);
        try {
          // Paso 1: el formato principal del equipo (Fútbol 5, 7, 11…).
          const { data: teamRow, error: teamError } = await supabase
            .from('teams')
            .select('preferred_format')
            .eq('id', rankedTeamId)
            .maybeSingle();

          if (teamError) throw teamError;

          const format = teamRow?.preferred_format ?? null;
          setMiniRankingFormat(format);

          if (!format) {
            setMiniRanking([]);
          } else {
            // Paso 2: la misma RPC que alimenta la tab Ranking, acotada al
            // formato y recortada al podio.
            const { data: rankingRows, error: rankingError } = await supabase.rpc(
              'get_team_ranking',
              { p_format: format },
            );

            if (rankingError) throw rankingError;

            const myTeamIds = new Set(data.myTeams.map((team) => team.id));
            const top3 = [...(rankingRows ?? [])]
              .sort((a, b) => Number(a.rank_position) - Number(b.rank_position))
              .slice(0, 3)
              .map<MiniRankingEntry>((row) => ({
                rankPosition: Number(row.rank_position),
                teamId: row.team_id,
                teamName: row.team_name,
                shieldUrl: row.shield_url
                  ? getSupabaseStorageUrl('shields', row.shield_url)
                  : null,
                eloRating: row.elo_rating,
                isMyTeam: myTeamIds.has(row.team_id),
              }));

            setMiniRanking(top3);
          }
        } catch (rankingError) {
          // La tarjeta se degrada a su estado vacío; el resto del inicio queda intacto.
          Logger.error('No se pudo cargar el mini-ranking del inicio', {
            scope: 'tabs.index.loadMiniRanking',
            profileId: profile.id,
            teamId: rankedTeamId,
            error: rankingError,
          });
          setMiniRanking([]);
        } finally {
          setMiniRankingLoading(false);
        }
      }
    } catch (error) {
      Logger.error('No se pudo cargar la pantalla de inicio', {
        scope: 'tabs.index.loadData',
        profileId: profile.id,
        error,
      });
      showAlert(
        'Error al cargar inicio',
        getGenericSupabaseErrorMessage(error, 'No se pudo cargar la pantalla de inicio.'),
      );
      setMiniRankingLoading(false);
    } finally {
      setLoading(false);
    }
  }, [profile, activeTeamId, showAlert]);

  useFocusEffect(
    useCallback(() => {
      void loadData();
    }, [loadData]),
  );

  // ─── TAREA 1 — Próximo partido y cuenta regresiva ──────────────────────────

  // El "próximo partido" es el primero con fecha futura. `EN_VIVO` queda afuera
  // a propósito: ése ya empezó y no hay nada que contar.
  const nextMatch = useMemo(() => {
    if (!viewData) return null;
    const reference = Date.now();
    return (
      viewData.upcomingMatches
        .filter(
          (match) =>
            match.status !== 'EN_VIVO' &&
            match.scheduledAt !== null &&
            new Date(match.scheduledAt).getTime() > reference,
        )
        .sort(
          (a, b) =>
            new Date(a.scheduledAt as string).getTime() -
            new Date(b.scheduledAt as string).getTime(),
        )[0] ?? null
    );
  }, [viewData]);

  const targetTs = nextMatch?.scheduledAt ? new Date(nextMatch.scheduledAt).getTime() : null;
  const msLeft = targetTs === null ? null : targetTs - nowTs;
  const isCountingDown = msLeft !== null && msLeft > 0 && msLeft <= COUNTDOWN_WINDOW_MS;
  const hasStarted = msLeft !== null && msLeft <= 0;

  // Un solo `setInterval` para todo: late cada segundo dentro de la ventana de
  // 24 h y cada 30 s fuera de ella —lo justo para detectar el cruce hacia la
  // ventana sin quemar renders mientras el partido sigue lejos—. Cuando
  // `isCountingDown` cambia, el efecto se reinicia con la nueva cadencia.
  useEffect(() => {
    if (targetTs === null || !isFocused) return;

    setNowTs(Date.now());
    const intervalId = setInterval(
      () => setNowTs(Date.now()),
      isCountingDown ? COUNTDOWN_TICK_MS : IDLE_TICK_MS,
    );

    return () => clearInterval(intervalId);
  }, [targetTs, isCountingDown, isFocused]);

  const countdown = useMemo(() => {
    const totalSeconds = Math.max(0, Math.floor((msLeft ?? 0) / 1000));
    return {
      hours: pad(Math.floor(totalSeconds / 3600)),
      minutes: pad(Math.floor((totalSeconds % 3600) / 60)),
      seconds: pad(totalSeconds % 60),
    };
  }, [msLeft]);

  // ─── TAREA 3 — Guía inicial ────────────────────────────────────────────────

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const stored = await AsyncStorage.getItem(ONBOARDING_STORAGE_KEY);
        if (!cancelled) setTourPending(stored !== 'true');
      } catch (error) {
        // Si el storage falla preferimos no molestar con la guía.
        Logger.warn('No se pudo leer el estado de la guía inicial', {
          scope: 'tabs.index.readOnboardingFlag',
          error,
        });
        if (!cancelled) setTourPending(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const handleDismissTour = useCallback(() => {
    setTourPending(false);
    void AsyncStorage.setItem(ONBOARDING_STORAGE_KEY, 'true').catch((error) => {
      // Que no se persista sólo significa que la guía vuelve a aparecer.
      Logger.warn('No se pudo persistir el estado de la guía inicial', {
        scope: 'tabs.index.writeOnboardingFlag',
        error,
      });
    });
  }, []);

  // ─── Navigation handlers ──────────────────────────────────────────────────

  const handleMatchPress = (matchId: string) => {
    router.push({ pathname: '/match-detail', params: { matchId } });
  };

  const handleSeeAllMatches = () => {
    router.push('/(tabs)/matches');
  };

  const handleTeamPress = (teamId: string) => {
    router.push({ pathname: '/team-manage', params: { teamId } });
  };

  const handleSeeRanking = () => {
    router.push('/(tabs)/ranking');
  };

  const handleGoToRanking = () => {
    router.push('/(tabs)/ranking');
  };

  const handleGoToMarket = () => {
    router.push('/(tabs)/market');
  };

  const handleManageTeam = () => {
    router.push('/(tabs)/profile');
  };

  // D12 — cada señal lleva al lugar donde SE RESUELVE. Las que apuntan a un
  // partido concreto (`matchId`, que sólo viene cuando hay uno solo) entran
  // directo al detalle; con varias, a la lista de partidos.
  const handlePendingAction = (action: PendingAction) => {
    switch (action.type) {
      case 'DISPUTE':
      case 'LIVE_RESULT':
      case 'MATCH_PROPOSAL':
      case 'CANCELLATION_REQUEST':
        if (action.matchId) {
          router.push({ pathname: '/match-detail', params: { matchId: action.matchId } });
        } else {
          router.push('/(tabs)/matches');
        }
        break;
      case 'CHALLENGE_RECEIVED':
        router.push('/challenge-inbox');
        break;
      case 'MARKET_APPLICATION':
        router.push('/(tabs)/market');
        break;
      case 'TEAM_REQUEST':
        // El perfil es donde vive la gestión de equipos.
        router.push('/(tabs)/profile');
        break;
    }
  };

  const handleCreateTeam = () => {
    router.push('/team-create');
  };

  const handleJoinTeam = () => {
    router.push('/team-join');
  };

  // ─── Render ───────────────────────────────────────────────────────────────

  // Solo la PRIMERA carga muestra esqueleto. En los refrescos por foco el
  // contenido anterior sigue en pantalla y se actualiza en silencio: antes cada
  // regreso a la tab borraba todo y mostraba un loader a pantalla completa.
  const isInitialLoad = loading && !viewData;
  const hasNoTeams = !viewData || viewData.myTeams.length === 0;

  // La guía señala tarjetas que sólo existen con equipo cargado; sin eso, el
  // usuario ya tiene su propia pantalla de bienvenida.
  const showTour = tourPending === true && !isInitialLoad && !hasNoTeams;

  return (
    <View className="flex-1 bg-surface-base">
      <GlobalHeader />

      {isInitialLoad ? (
        <HomeSkeleton />
      ) : hasNoTeams ? (
        // Full-screen onboarding CTA for users without any team
        <HomeOnboardingState
          onCreateTeam={handleCreateTeam}
          onJoinTeam={handleJoinTeam}
          onGoToMarket={handleGoToMarket}
          pendingTransfers={viewData?.pendingTransfers ?? 0}
          onConfirmTransfer={() => router.push('/team-requests')}
        />
      ) : (
        <ScrollView
          className="px-4"
          contentContainerStyle={{ paddingTop: 18, paddingBottom: 114 }}
          showsVerticalScrollIndicator={false}
        >
          <PendingActionsCard
            actions={viewData.pendingActions}
            onActionPress={handlePendingAction}
          />

          {/* ── TAREA 1 — Próximo partido con cuenta regresiva ────────────── */}
          {nextMatch && (
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={() => handleMatchPress(nextMatch.id)}
              className={`mb-5 overflow-hidden rounded-2xl bg-surface-container ${
                isCountingDown ? 'border border-brand-primary/30' : ''
              }`}
            >
              {/* Encabezado */}
              <View className="flex-row items-center justify-between px-4 pt-4">
                <Text className="font-displayBlack text-xs uppercase tracking-widest text-neutral-on-surface-variant">
                  Próximo partido
                </Text>
                <View className="flex-row items-center gap-1.5">
                  <View
                    className={`h-1.5 w-1.5 rounded-full ${
                      nextMatch.status === 'CONFIRMADO' ? 'bg-info-secondary' : 'bg-neutral-outline'
                    }`}
                  />
                  <Text
                    className={`font-ui text-[11px] ${
                      nextMatch.status === 'CONFIRMADO'
                        ? 'text-info-secondary'
                        : 'text-neutral-outline'
                    }`}
                  >
                    {nextMatch.status === 'CONFIRMADO' ? 'Confirmado' : 'Pendiente'}
                  </Text>
                </View>
              </View>

              {/* Equipos */}
              <View className="flex-row items-center justify-between gap-2 px-4 py-4">
                <View className="flex-1 items-center gap-2">
                  <TeamShield
                    shieldUrl={nextMatch.teamA.shieldUrl}
                    size={44}
                    isMyTeam={nextMatch.myTeamId === nextMatch.teamA.id}
                  />
                  <Text
                    className="font-uiBold text-center text-[12px] text-neutral-on-surface"
                    numberOfLines={1}
                  >
                    {nextMatch.teamA.name}
                  </Text>
                </View>

                <Text className="font-displayBlack text-base text-neutral-outline">VS</Text>

                <View className="flex-1 items-center gap-2">
                  <TeamShield
                    shieldUrl={nextMatch.teamB.shieldUrl}
                    size={44}
                    isMyTeam={nextMatch.myTeamId === nextMatch.teamB.id}
                  />
                  <Text
                    className="font-uiBold text-center text-[12px] text-neutral-on-surface"
                    numberOfLines={1}
                  >
                    {nextMatch.teamB.name}
                  </Text>
                </View>
              </View>

              {/* Cuenta regresiva (< 24 h) o fecha larga */}
              <View className="border-t border-neutral-outline/20 bg-surface-high/40 px-4 py-3">
                {isCountingDown ? (
                  <>
                    <Text className="font-ui mb-2 text-center text-[10px] uppercase tracking-widest text-brand-primary">
                      Empieza en
                    </Text>
                    <View className="flex-row items-center justify-center gap-1.5">
                      {[
                        { value: countdown.hours, label: 'Hs' },
                        { value: countdown.minutes, label: 'Min' },
                        { value: countdown.seconds, label: 'Seg' },
                      ].map((segment, index) => (
                        <View key={segment.label} className="flex-row items-center gap-1.5">
                          {index > 0 && (
                            <Text className="font-displayBlack pb-3 text-xl text-neutral-outline">
                              :
                            </Text>
                          )}
                          <View className="min-w-[52px] items-center rounded-xl bg-surface-lowest px-2 py-1.5">
                            <Text className="font-displayBlack text-2xl text-brand-primary">
                              {segment.value}
                            </Text>
                            <Text className="font-ui text-[9px] uppercase tracking-wider text-neutral-on-surface-variant">
                              {segment.label}
                            </Text>
                          </View>
                        </View>
                      ))}
                    </View>
                  </>
                ) : hasStarted ? (
                  <Text className="font-uiBold text-center text-[13px] text-brand-primary">
                    ¡Es la hora del partido!
                  </Text>
                ) : (
                  <Text className="font-uiBold text-center text-[13px] text-neutral-on-surface">
                    {nextMatch.scheduledAt ? formatMatchDate(nextMatch.scheduledAt) : 'Sin fecha'}
                  </Text>
                )}
              </View>
            </TouchableOpacity>
          )}

          {/* ── TAREA 2 — Mini-ranking del formato de mi equipo ───────────── */}
          <MiniRankingCard
            entries={miniRanking}
            format={miniRankingFormat}
            loading={miniRankingLoading}
            onPress={handleSeeRanking}
          />

          <UpcomingMatchesSection
            matches={viewData.upcomingMatches}
            onMatchPress={handleMatchPress}
            onSeeAll={handleSeeAllMatches}
          />

          <MyTeamsRankingSection
            teams={viewData.myTeams}
            onTeamPress={handleTeamPress}
            onSeeRanking={handleSeeRanking}
          />

          <QuickActionsSection
            onGoToRanking={handleGoToRanking}
            onGoToMarket={handleGoToMarket}
            onManageTeam={handleManageTeam}
          />
        </ScrollView>
      )}

      {/* ── TAREA 3 — Guía de 3 pasos, sólo la primera vez ────────────────── */}
      <HomeOnboardingTour visible={showTour} onDismiss={handleDismissTour} />

      {AlertComponent}
    </View>
  );
}
