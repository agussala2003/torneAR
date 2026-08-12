import { View, Text, TouchableOpacity } from 'react-native';
import { AppIcon } from '@/components/ui/AppIcon';
import { TeamShield } from '@/components/ui/TeamShield';
import { getTeamFormatShortLabel } from '@/lib/team-options';
import type { HomeTeamSnapshot } from './types';

const ROLE_LABEL: Record<string, string> = {
  CAPITAN: 'Capitán',
  SUBCAPITAN: 'Subcapitán',
  JUGADOR: 'Jugador',
  DIRECTOR_TECNICO: 'DT',
};

interface TeamCardProps {
  team: HomeTeamSnapshot;
  onPress: (teamId: string) => void;
}

/**
 * Tarjeta extendida de equipo: ocupa el ancho completo y se apila.
 *
 * Antes habia dos disenos —esta para un solo equipo, y una version comprimida
 * de 176px en scroll horizontal para dos o mas—, asi que sumar un segundo
 * equipo degradaba la informacion del primero: el record de temporada pasaba a
 * una linea suelta, el rol perdia jerarquia y el ranking quedaba en una caja
 * chica. Ademas el carrusel horizontal escondia los equipos a partir del
 * segundo, que es justo el caso que motivaba el cambio de layout.
 */
function TeamRankingCard({ team, onPress }: TeamCardProps) {
  const record = `${team.seasonWins}V ${team.seasonDraws}E ${team.seasonLosses}D`;

  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={() => onPress(team.id)}
      className="w-full flex-row items-center gap-4 overflow-hidden rounded-2xl bg-surface-container p-4"
    >
      <TeamShield shieldUrl={team.shieldUrl} size={52} isMyTeam />

      <View className="flex-1">
        <Text className="font-uiBold text-[15px] text-neutral-on-surface" numberOfLines={1}>
          {team.name}
        </Text>
        <Text className="font-ui text-[11px] text-neutral-on-surface-variant">
          {ROLE_LABEL[team.role] ?? team.role}
        </Text>
        <Text className="font-ui mt-1 text-[11px] text-neutral-on-surface-variant">{record}</Text>
      </View>

      <View className="items-end">
        <Text className="font-displayBlack text-2xl text-brand-primary">{team.eloRating}</Text>
        {/* "Rating" y no "Ranking": el Rating es el puntaje, el Ranking es la
            tabla de posiciones. Es el término que usa el resto de la app.

            El formato acompaña a la cifra porque un equipo que juega F5 y F7
            tiene un puntaje por cada uno: sin el rótulo, comparar este número
            con el del widget de Top 3 —que sí declara su formato— parecía una
            incoherencia de la app. */}
        <Text className="font-ui text-[10px] uppercase tracking-wider text-neutral-on-surface-variant">
          Rating
          {team.rankingFormat ? ` • ${getTeamFormatShortLabel(team.rankingFormat)}` : ''}
        </Text>
        <View className="mt-1 flex-row items-center gap-1">
          <AppIcon family="material-community" name="hand-peace" size={11} color="#53E076" />
          <Text className="font-uiBold text-[11px] text-brand-primary">{team.fairPlayScore}</Text>
          <Text className="font-ui text-[10px] text-neutral-outline">FPS</Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}

interface Props {
  teams: HomeTeamSnapshot[];
  onTeamPress: (teamId: string) => void;
}

export function MyTeamsRankingSection({ teams, onTeamPress }: Props) {
  if (teams.length === 0) return null;

  return (
    <View className="mb-5">
      {/* Sin enlace "Ver ranking": hacia `router.push` a una TAB, que apila una
          instancia nueva de Ranking sobre la Home en vez de cambiar de pestaña.
          Repitiendo el gesto (Home -> Ranking -> Home -> Ranking) la pila crecia
          sin fin y el retroceso nunca salia — el "loop infinito" del QA. La
          MiniRankingCard ya ofrece esa entrada, y el QuickAction de abajo llega
          al ranking por la via correcta. */}
      <View className="mb-3">
        <Text className="font-displayBlack text-xs uppercase tracking-widest text-neutral-on-surface-variant">
          Mis Equipos
        </Text>
      </View>

      {/* Mismo layout con 1, 2 o N equipos. La Home ya scrollea en vertical, asi
          que apilar no obliga a ningun gesto nuevo para ver el ultimo. */}
      <View className="gap-3">
        {teams.map((team) => (
          <TeamRankingCard key={team.id} team={team} onPress={onTeamPress} />
        ))}
      </View>
    </View>
  );
}
