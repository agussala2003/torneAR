import Svg, { Defs, Line, LinearGradient, Pattern, RadialGradient, Rect, Stop } from 'react-native-svg';
import { OUTCOME_ACCENT, type MatchOutcome } from './types';

/**
 * Textura de fondo de la tarjeta: líneas diagonales sutiles + un resplandor
 * teñido por el resultado + un desvanecido oscuro arriba y abajo.
 *
 * Es SVG puro y no `className` sobre los elementos: `react-native-svg` expone
 * sus primitivas (`Line`, `Rect`, `Pattern`) como componentes propios, no como
 * Views con estilos de NativeWind — mismo criterio que `TeamEloChart.tsx`, el
 * único otro lugar de la app que ya usa esta librería.
 *
 * El desvanecido no es decorativo nada más: sin él, el patrón de líneas y el
 * resplandor le restan contraste al texto del encabezado y del footer, que
 * son los dos bloques que se apoyan directamente sobre el fondo (el marcador
 * tiene tipografía enorme y no lo necesita).
 *
 * `width`/`height` llegan por props y no como import de
 * `SHARE_CARD_WIDTH`/`SHARE_CARD_HEIGHT` — ese import cerraría un ciclo
 * (`MatchShareCard` importa `CardBackground`, que importaría de vuelta
 * `MatchShareCard`), frágil bajo Metro/CJS: según el orden de evaluación, el
 * módulo que se importa en el medio del ciclo puede llegar `undefined`.
 */
interface Props {
  width: number;
  height: number;
  outcome: MatchOutcome;
}

const LINE_COLOR = '#3D4A3D'; // neutral-outline-variant
const FADE_COLOR = '#0E0E0E'; // surface-lowest — el mismo que el fondo sólido de la tarjeta, para que el degradado empalme sin costura

const PATTERN_TILE = 56;
const PATTERN_STROKE_WIDTH = 1.5;
const PATTERN_OPACITY = 0.05;

/** Centro del resplandor: donde vive el marcador gigante (`ScoreSection`),
 *  justo debajo del header. Coordenadas en % del propio viewport del SVG. */
const GLOW_CENTER_Y = '38%';
const GLOW_RADIUS = '55%';
const GLOW_OPACITY = 0.35;

export function CardBackground({ width, height, outcome }: Props) {
  const accent = OUTCOME_ACCENT[outcome];

  return (
    <Svg
      width={width}
      height={height}
      style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
    >
      <Defs>
        <Pattern
          id="diagonalLines"
          width={PATTERN_TILE}
          height={PATTERN_TILE}
          patternUnits="userSpaceOnUse"
          patternTransform="rotate(45)"
        >
          <Line
            x1={0}
            y1={0}
            x2={0}
            y2={PATTERN_TILE}
            stroke={LINE_COLOR}
            strokeWidth={PATTERN_STROKE_WIDTH}
          />
        </Pattern>

        {/* Resplandor centrado en la zona del marcador, teñido por el
            resultado. El `id` no incluye `outcome`: React re-renderiza el
            `Rect` que lo consume con el nuevo `stopColor` cada vez que
            `outcome` cambia, no hace falta un id por variante. */}
        <RadialGradient id="outcomeGlow" cx="50%" cy={GLOW_CENTER_Y} r={GLOW_RADIUS}>
          <Stop offset="0" stopColor={accent.glow} stopOpacity={GLOW_OPACITY} />
          <Stop offset="1" stopColor={accent.glow} stopOpacity={0} />
        </RadialGradient>

        {/* Sólido arriba, transparente hacia el 22% de la altura: cubre la
            franja donde vive el CardHeader y recorta el resplandor si se
            escapa hacia arriba. */}
        <LinearGradient id="topFade" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={FADE_COLOR} stopOpacity={1} />
          <Stop offset="0.22" stopColor={FADE_COLOR} stopOpacity={0} />
        </LinearGradient>

        {/* Transparente desde el 72%, sólido al final: cubre la franja del
            CardFooter. */}
        <LinearGradient id="bottomFade" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0.72" stopColor={FADE_COLOR} stopOpacity={0} />
          <Stop offset="1" stopColor={FADE_COLOR} stopOpacity={1} />
        </LinearGradient>
      </Defs>

      <Rect width="100%" height="100%" fill="url(#diagonalLines)" opacity={PATTERN_OPACITY} />
      <Rect width="100%" height="100%" fill="url(#outcomeGlow)" />
      <Rect width="100%" height="100%" fill="url(#topFade)" />
      <Rect width="100%" height="100%" fill="url(#bottomFade)" />
    </Svg>
  );
}
