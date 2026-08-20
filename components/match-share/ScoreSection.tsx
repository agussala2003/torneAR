import { Text, View } from 'react-native';
import { TeamShield } from '@/components/ui/TeamShield';
import type { MatchShareCardData } from './types';

/**
 * El marcador es el protagonista absoluto de la tarjeta: una sola línea
 * `[Goles Local] - [Goles Visitante]` a tamaño colosal, con los escudos y
 * nombres de los equipos arriba a modo de firma, más chicos.
 *
 * Antes el número vivía DENTRO de cada columna de equipo (escudo, nombre,
 * marcador, apilados) — dos números de 96px, cada uno leído junto a su
 * equipo. Acá se invierte la jerarquía: el marcador se separa en su propia
 * fila y crece a 200px, y las columnas de equipo quedan como identificación
 * liviana. Es la diferencia entre "una ficha por equipo" y "el resultado, con
 * quién jugó al lado".
 */

const SCORE_FONT_SIZE = 200;
const DASH_FONT_SIZE = 140;
/**
 * Misma `lineHeight` en el número Y en el guion — eso es lo que los alinea,
 * no que compartan `fontSize`. RN centra cada `Text` por la caja de su
 * `lineHeight`, no por la línea de base tipográfica: si el guion tuviera su
 * propia altura de línea implícita (la que le da un `fontSize` menor sin
 * `lineHeight` explícito), su caja sería más baja que la del número y
 * `items-center` los centraría en puntos distintos — el guion quedaría un
 * poco más arriba, ópticamente "flotando". Forzar el mismo valor en los tres
 * `Text` de la fila es lo que garantiza el pedido de "guion perfectamente
 * alineado" con cualquier combinación de dígitos (1 o 2 cifras a cada lado).
 */
const SCORE_LINE_HEIGHT = Math.round(SCORE_FONT_SIZE * 1.05);

const TEAM_COLUMN_WIDTH = 380;
const TEAM_SHIELD_SIZE = 130;

interface TeamIdentityProps {
  name: string;
  shieldUrl: string | null;
}

function TeamIdentity({ name, shieldUrl }: TeamIdentityProps) {
  return (
    <View style={{ width: TEAM_COLUMN_WIDTH }} className="items-center gap-4">
      {/* `name` habilita el fallback de iniciales de `TeamShield` cuando el
          equipo no tiene escudo cargado — sin esto, un equipo sin escudo caía
          en el ícono genérico y dos tarjetas sin escudo eran indistinguibles
          entre sí. */}
      <TeamShield shieldUrl={shieldUrl} name={name} size={TEAM_SHIELD_SIZE} />
      <Text
        className="font-uiBold text-center text-[30px] leading-9 text-neutral-on-surface"
        numberOfLines={2}
      >
        {name}
      </Text>
    </View>
  );
}

interface Props {
  teamA: MatchShareCardData['teamA'];
  teamB: MatchShareCardData['teamB'];
  scoreA: number | null;
  scoreB: number | null;
}

export function ScoreSection({ teamA, teamB, scoreA, scoreB }: Props) {
  return (
    <View className="w-full items-center gap-14">
      {/* Fila 1: quién jugó. */}
      <View className="w-full flex-row items-start justify-center gap-8">
        <TeamIdentity name={teamA.name} shieldUrl={teamA.shieldUrl} />
        <TeamIdentity name={teamB.name} shieldUrl={teamB.shieldUrl} />
      </View>

      {/* Fila 2: el resultado. `-` con el mismo `ancho de línea` que los
          números (ver comentario de SCORE_LINE_HEIGHT) para que
          `items-center` los centre en el mismo eje. */}
      <View className="w-full flex-row items-center justify-center">
        <Text
          style={{ fontSize: SCORE_FONT_SIZE, lineHeight: SCORE_LINE_HEIGHT, fontVariant: ['tabular-nums'] }}
          className="font-displayBlack text-neutral-on-surface"
        >
          {scoreA ?? '-'}
        </Text>
        <Text
          style={{ fontSize: DASH_FONT_SIZE, lineHeight: SCORE_LINE_HEIGHT }}
          className="font-displayBlack mx-8 text-neutral-outline"
        >
          -
        </Text>
        <Text
          style={{ fontSize: SCORE_FONT_SIZE, lineHeight: SCORE_LINE_HEIGHT, fontVariant: ['tabular-nums'] }}
          className="font-displayBlack text-neutral-on-surface"
        >
          {scoreB ?? '-'}
        </Text>
      </View>
    </View>
  );
}
