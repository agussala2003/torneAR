import { useEffect, useMemo, useState } from 'react';
import { ScrollView, Text, TouchableOpacity, View, Image } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { GlobalHeader } from '@/components/GlobalHeader';
import { GlobalLoader } from '@/components/GlobalLoader';
import CustomAlert from '@/components/ui/CustomAlert';
import { AppIcon } from '@/components/ui/AppIcon';
import { supabase } from '@/lib/supabase';
import { getGenericSupabaseErrorMessage } from '@/lib/auth-error-messages';
import { getSupabaseStorageUrl } from '@/lib/supabase-storage';
import { getTeamCategoryLabel, getTeamFormatLabel, TeamCategory, TeamFormat } from '@/lib/team-options';

type TeamDetail = {
  id: string;
  name: string;
  zone: string;
  category: TeamCategory;
  preferred_format: TeamFormat;
  elo_rating: number;
  matches_played: number;
  fair_play_score: number;
  shield_url: string | null;
  created_at: string;
};

type MatchRow = {
  id: string;
  scheduled_at: string | null;
  status: string;
  location: string | null;
  match_type: string;
  team_a_id: string;
  team_b_id: string;
  team_a: { name: string } | null;
  team_b: { name: string } | null;
};

function formatDate(dateIso: string | null): string {
  if (!dateIso) return 'Fecha pendiente';

  const date = new Date(dateIso);
  if (Number.isNaN(date.getTime())) return 'Fecha pendiente';

  return date.toLocaleDateString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

function statusLabel(status: string): string {
  switch (status) {
    case 'FINALIZADO':
      return 'Finalizado';
    case 'EN_JUEGO':
      return 'En juego';
    case 'CANCELADO':
      return 'Cancelado';
    default:
      return 'Programado';
  }
}

export default function TeamStatsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ teamId?: string }>();

  const teamId = params.teamId ?? null;

  const [loading, setLoading] = useState(true);
  const [team, setTeam] = useState<TeamDetail | null>(null);
  const [matches, setMatches] = useState<MatchRow[]>([]);
  const [alertVisible, setAlertVisible] = useState(false);
  const [alertTitle, setAlertTitle] = useState('');
  const [alertMessage, setAlertMessage] = useState('');

  useEffect(() => {
    let mounted = true;

    async function loadData() {
      if (!teamId) {
        if (mounted) {
          setLoading(false);
          setAlertTitle('Equipo no disponible');
          setAlertMessage('No se pudo identificar el equipo para cargar estadisticas detalladas.');
          setAlertVisible(true);
        }
        return;
      }

      try {
        setLoading(true);

        const [teamRes, matchesRes] = await Promise.all([
          supabase
            .from('teams')
            .select('id, name, zone, category, preferred_format, elo_rating, matches_played, fair_play_score, shield_url, created_at')
            .eq('id', teamId)
            .maybeSingle(),
          supabase
            .from('matches')
            .select('id, scheduled_at, status, location, match_type, team_a_id, team_b_id, team_a:teams!team_a_id(name), team_b:teams!team_b_id(name)')
            .or(`team_a_id.eq.${teamId},team_b_id.eq.${teamId}`)
            .order('scheduled_at', { ascending: false })
            .limit(10),
        ]);

        if (teamRes.error) throw teamRes.error;
        if (matchesRes.error) throw matchesRes.error;

        if (mounted) {
          setTeam(teamRes.data as TeamDetail);
          setMatches((matchesRes.data as MatchRow[]) ?? []);
        }
      } catch (error) {
        if (mounted) {
          setAlertTitle('Error al cargar stats');
          setAlertMessage(getGenericSupabaseErrorMessage(error, 'No se pudo cargar el detalle de estadisticas del equipo.'));
          setAlertVisible(true);
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    }

    void loadData();

    return () => {
      mounted = false;
    };
  }, [teamId]);

  if (loading) {
    return <GlobalLoader label="Cargando stats del equipo" />;
  }

  if (!team) {
    return (
      <View className="flex-1 bg-surface-base px-6 items-center justify-center">
        <Text className="font-display text-xl text-neutral-on-surface">Equipo no disponible</Text>
        <TouchableOpacity onPress={() => router.back()} activeOpacity={0.8} className="mt-4 rounded-lg bg-surface-high px-4 py-2">
            <Text className="font-ui text-neutral-on-surface">Volver</Text>
        </TouchableOpacity>
        <CustomAlert visible={alertVisible} title={alertTitle} message={alertMessage} onClose={() => setAlertVisible(false)} />
      </View>
    );
  }

  const shieldUrl = team.shield_url ? getSupabaseStorageUrl('shields', team.shield_url) : '';

  return (
    <View className="flex-1 bg-surface-base">
      <GlobalHeader />

      <ScrollView className="px-4" contentContainerStyle={{ paddingTop: 16, paddingBottom: 110 }}>
        {/* TOP BAR */}
        <View className="mb-4 flex-row items-center justify-between">
          <TouchableOpacity
            onPress={() => router.back()}
            activeOpacity={0.85}
            className="flex-row items-center gap-1 rounded-lg bg-surface-high px-3 py-2"
          >
            <AppIcon family="material-icons" name="arrow-back" size={16} color="#BCCBB9" />
            <Text className="font-ui text-xs text-neutral-on-surface-variant">Volver</Text>
          </TouchableOpacity>

          <Text className="font-display text-sm uppercase tracking-widest text-brand-primary">Stats de Equipo</Text>
        </View>

        {/* TEAM HEADER COMPONENT */}
        <View className="mb-6 items-center pt-2">
           <View className="border-4 border-brand-primary-container bg-surface-lowest p-1" style={{ height: 100, width: 100, borderRadius: 16 }}>
             {shieldUrl ? (
               <Image source={{ uri: shieldUrl }} className="h-full w-full rounded-xl" resizeMode="cover" />
             ) : (
               <View className="h-full w-full items-center justify-center rounded-xl bg-surface-high">
                 <AppIcon family="material-community" name="shield-outline" size={32} color="#BCCBB9" />
               </View>
             )}
           </View>
           <Text className="font-displayBlack mt-4 text-2xl tracking-tight text-neutral-on-surface">{team.name}</Text>
           <Text className="font-ui mt-1 text-sm text-neutral-on-surface-variant">{team.zone}</Text>
           <View className="mt-3 flex-row flex-wrap justify-center gap-2">
             <Text className="font-uiBold rounded bg-brand-primary/15 px-2 py-1 text-[10px] uppercase tracking-wide text-brand-primary">
               {getTeamCategoryLabel(team.category)}
             </Text>
             <Text className="font-uiBold rounded bg-info-secondary/15 px-2 py-1 text-[10px] uppercase tracking-wide text-info-secondary">
               {getTeamFormatLabel(team.preferred_format)}
             </Text>
           </View>
        </View>

        {/* MAIN STATS */}
        <View className="mb-6 rounded-2xl bg-surface-low p-4">
          <Text className="font-display mb-3 text-sm uppercase tracking-wider text-neutral-on-surface-variant">Rendimiento e Historial</Text>
          <View className="flex-row flex-wrap gap-3">
             <View className="flex-1 min-w-[130px] rounded-xl bg-surface-high p-3">
                <Text className="font-ui text-[11px] uppercase tracking-wide text-neutral-on-surface-variant">PR</Text>
                <Text className="font-displayBlack mt-1 text-2xl text-neutral-on-surface" style={{ fontVariant: ['tabular-nums'] }}>{team.elo_rating}</Text>
             </View>
             <View className="flex-1 min-w-[130px] rounded-xl bg-surface-high p-3">
                <Text className="font-ui text-[11px] uppercase tracking-wide text-neutral-on-surface-variant">Partidos</Text>
                <Text className="font-displayBlack mt-1 text-2xl text-neutral-on-surface" style={{ fontVariant: ['tabular-nums'] }}>{team.matches_played}</Text>
             </View>
             <View className="flex-1 min-w-[130px] rounded-xl bg-surface-high p-3">
                <Text className="font-ui text-[11px] uppercase tracking-wide text-neutral-on-surface-variant">Fair Play</Text>
                <Text className="font-displayBlack mt-1 text-2xl text-neutral-on-surface" style={{ fontVariant: ['tabular-nums'] }}>{Number(team.fair_play_score).toFixed(1)}</Text>
             </View>
          </View>
        </View>

        {/* RECENT MATCHES */}
        <View className="rounded-2xl bg-surface-low p-4">
          <Text className="font-display mb-3 text-sm uppercase tracking-wider text-neutral-on-surface-variant">Ultimos partidos de {team.name}</Text>

          {matches.length ? (
            <View className="gap-2">
              {matches.map((match) => {
                const rivalName = match.team_a_id === teamId ? (match.team_b?.name || "Rival Desconocido") : (match.team_a?.name || "Rival Desconocido");
                const homeOrAway = match.team_a_id === teamId ? "Local" : "Visitante";
                return (
                  <View key={match.id} className="rounded-xl bg-surface-high p-3">
                    <View className="mb-1 flex-row items-center justify-between">
                      <Text className="font-uiBold text-xs uppercase text-neutral-on-surface overflow-hidden mr-2" numberOfLines={1}>vs {rivalName}</Text>
                      <Text className="font-ui text-[10px] uppercase text-neutral-on-surface-variant shrink-0">{statusLabel(match.status)}</Text>
                    </View>
                    <Text className="font-ui text-xs text-neutral-on-surface-variant">{formatDate(match.scheduled_at)}</Text>
                    <Text className="font-ui mt-1 text-xs text-neutral-on-surface-variant">{match.location ?? 'Ubicacion sin definir'} · {match.match_type} ({homeOrAway})</Text>
                  </View>
                );
              })}
            </View>
          ) : (
            <View className="rounded-xl bg-surface-high p-4">
              <Text className="font-ui text-sm text-neutral-on-surface-variant">Todavia no hay partidos recientes para este equipo.</Text>
            </View>
          )}
        </View>
      </ScrollView>

      <CustomAlert
        visible={alertVisible}
        title={alertTitle}
        message={alertMessage}
        onClose={() => setAlertVisible(false)}
      />
    </View>
  );
}
