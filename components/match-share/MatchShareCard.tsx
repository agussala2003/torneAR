import { View, Text } from 'react-native';
import { Image } from 'expo-image';
import { AppIcon } from '@/components/ui/AppIcon';
import { wordmarkWidthFor } from '@/constants/brand';
import { CardBackground } from './CardBackground';
import { ScoreSection } from './ScoreSection';
import { ScorersBlock } from './ScorersBlock';
import { OUTCOME_ACCENT, type MatchOutcome, type MatchShareCardData } from './types';

/**
 * Formato 4:5 — el que Instagram Stories recorta sin recuadrar ni perder
 * contenido de los bordes. Dimensiones fijas y NUNCA `flex-1`/`%` en el
 * contenedor raíz: es lo único que garantiza que la tarjeta se vea igual al
 * capturarse en cualquier pantalla, sin importar el tamaño real del
 * dispositivo que la renderiza. Todos los anchos que importan para la
 * composición (columnas de equipo, footer, bloque de goleadores) también son
 * numéricos y fijos por el mismo motivo — un `%` se resuelve distinto según
 * el layout del padre.
 */
export const SHARE_CARD_WIDTH = 1080;
export const SHARE_CARD_HEIGHT = 1350;

/**
 * Marca de agua. 37 (≥ 34 pedidos) y NO viene de un literal propio: sale de
 * `wordmarkWidthFor()` en `constants/brand.ts`, la misma fuente que usa el
 * header de la app. El wordmark ya está recortado a su bounding box real —
 * antes el PNG traía 8,7%/16,6% de aire transparente que hacía que cualquier
 * altura fija pintara el logo más chico de lo que la caja sugería.
 */
const WATERMARK_HEIGHT = 37;
const WATERMARK_WIDTH = wordmarkWidthFor(WATERMARK_HEIGHT);

const MATCH_TYPE_LABEL: Record<MatchShareCardData['matchType'], string> = {
  RANKING: 'Partido de Ranking',
  AMISTOSO: 'Amistoso',
};

function formatCardDate(iso: string | null): string {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('es-AR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

// ─── Header ─────────────────────────────────────────────────────────────────

interface CardHeaderProps {
  matchType: MatchShareCardData['matchType'];
  finishedAt: string | null;
}

function CardHeader({ matchType, finishedAt }: CardHeaderProps) {
  return (
    <View className="items-center gap-3">
      <Text className="font-displayBlack text-[30px] uppercase tracking-[8px] text-brand-primary">
        {MATCH_TYPE_LABEL[matchType] ?? matchType}
      </Text>
      {finishedAt && (
        <Text className="font-ui text-[24px] text-neutral-on-surface-variant">
          {formatCardDate(finishedAt)}
        </Text>
      )}
    </View>
  );
}

// ─── Data blocks ────────────────────────────────────────────────────────────
// Chip de rating + MVP + goleadores. Los tres son condicionales de forma
// independiente: un amistoso empatado sin MVP cargado puede llegar con los
// tres en `null` (Caso B del banco de pruebas), y el bloque entero tiene que
// desaparecer sin dejar un hueco fijo — por eso el guard de abajo cubre los
// tres, no sólo los dos que había antes de sumar goleadores.

interface DataBlocksSectionProps {
  eloDelta: MatchShareCardData['eloDelta'];
  mvp: MatchShareCardData['mvp'];
  scorers: MatchShareCardData['scorers'];
  outcome: MatchOutcome;
}

function DataBlocksSection({ eloDelta, mvp, scorers, outcome }: DataBlocksSectionProps) {
  const hasScorers = !!scorers && scorers.length > 0;
  // Ninguno de los tres corresponde: no hay nada que mostrar. Se devuelve
  // `null` y no una `View` vacía — con el `justify-between` del layout raíz,
  // un hijo ausente hace que el espacio se reparta entre Header/Score/Footer
  // en vez de dejar un hueco fijo reservado para contenido que no existe.
  if (!eloDelta && !mvp && !hasScorers) return null;

  return (
    <View className="w-full items-center gap-6">
      {/* Regla de acento: la única marca visual del resultado dentro de
          DataBlocksSection (Tarea 3). Un divisor y no un `border` alrededor
          de todo el bloque — encerrar tres piezas de forma tan distinta
          (chip, pastilla, tarjeta) en un mismo marco competía visualmente con
          cada una; una regla corta arriba "firma" la sección sin además
          delimitarla. */}
      <View
        style={{ width: 96, height: 4, borderRadius: 2, backgroundColor: OUTCOME_ACCENT[outcome].line }}
      />

      {eloDelta && (
        <View className="flex-row items-center gap-3 rounded-full border border-brand-gold/40 bg-brand-gold/15 px-8 py-4">
          <AppIcon family="material-community" name="trending-up" size={30} color="#FABD32" />
          <Text
            className="font-displayBlack text-[34px] tracking-wide text-brand-gold"
            style={{ fontVariant: ['tabular-nums'] }}
          >
            +{eloDelta.delta} RATING
          </Text>
        </View>
      )}

      {mvp && (
        <View className="flex-row items-center gap-4 rounded-full bg-surface-container px-6 py-4">
          {mvp.avatarUrl ? (
            <Image
              source={{ uri: mvp.avatarUrl }}
              style={{ height: 72, width: 72, borderRadius: 36 }}
              contentFit="cover"
            />
          ) : (
            <View className="h-[72px] w-[72px] items-center justify-center rounded-full bg-surface-high">
              <AppIcon family="material-community" name="account" size={38} color="#BCCBB9" />
            </View>
          )}
          <View className="gap-1">
            <Text className="font-ui text-[20px] uppercase tracking-widest text-brand-gold">
              MVP del partido
            </Text>
            <Text className="font-uiBold text-[28px] text-neutral-on-surface" numberOfLines={1}>
              {mvp.fullName}
            </Text>
          </View>
        </View>
      )}

      <ScorersBlock scorers={scorers} />
    </View>
  );
}

// ─── Footer ─────────────────────────────────────────────────────────────────

function CardFooter() {
  return (
    <View className="w-full items-center gap-4">
      <Image
        source={require('@/assets/new-images/logo_nombre_derecha.png')}
        contentFit="contain"
        style={{ height: WATERMARK_HEIGHT, width: WATERMARK_WIDTH }}
      />
      <Text className="font-ui text-[18px] uppercase tracking-[6px] text-neutral-on-surface-variant">
        Jugá. Rankeá. Compartí. · @torneAR
      </Text>
    </View>
  );
}

// ─── Tarjeta ────────────────────────────────────────────────────────────────

interface Props {
  data: MatchShareCardData;
  /**
   * Resultado desde la perspectiva de quien comparte. Prop separada de
   * `data` y no un campo de `MatchShareCardData` a propósito: `data` es
   * puramente descriptivo (qué pasó), `outcome` es una interpretación (cómo
   * se pinta) — y quien la calcula (`deriveMatchOutcome` en `types.ts`)
   * necesita `myTeamId`, un dato que el componente visual no tiene ni debería
   * recibir sólo para esto. La deriva `ShareMatchButton`, que ya lo tiene.
   */
  outcome: MatchOutcome;
}

/**
 * Tarjeta 100% presentacional: no hace fetch, no maneja estado, no sabe de
 * `react-native-view-shot` (eso lo orquesta `ShareMatchButton`, fuera de este
 * componente). Sólo recibe `MatchShareCardData` ya resuelto y lo pinta.
 *
 * Cuatro bloques apilados con `justify-between` sobre el alto fijo de la
 * tarjeta: Header, Score, DataBlocks (condicional) y Footer. El fondo
 * (`CardBackground`) es un `View` hermano posicionado absoluto y no un padre
 * — así el stack de contenido no hereda ningún comportamiento de layout del
 * SVG, sólo se pinta encima.
 */
export function MatchShareCard({ data, outcome }: Props) {
  const { teamA, teamB, scoreA, scoreB, matchType, finishedAt, eloDelta, mvp, scorers } = data;

  return (
    <View
      style={{ width: SHARE_CARD_WIDTH, height: SHARE_CARD_HEIGHT }}
      className="relative overflow-hidden bg-surface-lowest"
    >
      <CardBackground width={SHARE_CARD_WIDTH} height={SHARE_CARD_HEIGHT} outcome={outcome} />

      <View className="flex-1 items-center justify-between px-12 py-16">
        <CardHeader matchType={matchType} finishedAt={finishedAt} />
        <ScoreSection teamA={teamA} teamB={teamB} scoreA={scoreA} scoreB={scoreB} />
        <DataBlocksSection eloDelta={eloDelta} mvp={mvp} scorers={scorers} outcome={outcome} />
        <CardFooter />
      </View>
    </View>
  );
}
