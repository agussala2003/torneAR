import { Text, View } from 'react-native';
import type { MatchScorer } from './types';

/**
 * Techo de nombres visibles. Sin esto, un 11-0 con diez goleadores distintos
 * (el Caso D del banco de pruebas es justo un 11-0) alargaría el bloque sin
 * límite dentro de una tarjeta de ALTO FIJO con `overflow-hidden` en la raíz
 * — pasado cierto punto el contenido no se recorta con gracia, desaparece
 * debajo del footer. Una tarjeta para compartir tampoco necesita listar a
 * los once goleadores: cinco alcanza para "quién la rompió", y el resto se
 * resume en una línea.
 */
const MAX_VISIBLE_SCORERS = 5;

/** Ancho fijo — no `w-full` — por el mismo motivo que el resto de la tarjeta:
 *  la captura de `view-shot` tiene que verse igual en cualquier pantalla, y
 *  un `%` se resuelve distinto según el layout del padre en ese momento. */
const BLOCK_WIDTH = 600;

interface Props {
  scorers: MatchScorer[] | null;
}

/**
 * Lista de goleadores dentro de `DataBlocksSection`, junto al chip de rating
 * y al MVP. Si no hay goleadores para mostrar, colapsa a `null` — igual que
 * `DataBlocksSection` con el chip y el MVP, no se reserva una caja vacía para
 * contenido ausente.
 */
export function ScorersBlock({ scorers }: Props) {
  if (!scorers || scorers.length === 0) return null;

  // Copia antes de ordenar: `scorers` es la prop tal cual la mandó el padre,
  // y `Array.prototype.sort` muta in-place — ordenarla directo reordenaría el
  // array del caller en cada render.
  const sorted = [...scorers].sort((a, b) => b.goals - a.goals);
  const visible = sorted.slice(0, MAX_VISIBLE_SCORERS);
  const hiddenCount = sorted.length - visible.length;

  return (
    <View
      style={{ width: BLOCK_WIDTH }}
      className="items-center gap-3 rounded-3xl bg-surface-container px-8 py-6"
    >
      <Text className="font-ui text-[20px] uppercase tracking-widest text-neutral-on-surface-variant">
        ⚽ Goleadores
      </Text>

      <View className="w-full items-center gap-1.5">
        {visible.map((scorer) => (
          // `${name}-${goals}` y no sólo `name`: dos entradas del mismo
          // jugador no deberían darse (viene agregado por partido), pero si
          // el caller manda algo raro, dos keys idénticas rompen la lista
          // silenciosamente en vez de un warning ruidoso.
          <Text
            key={`${scorer.name}-${scorer.goals}`}
            numberOfLines={1}
            className="font-uiBold text-[26px] text-neutral-on-surface"
          >
            {scorer.name} ×{scorer.goals}
          </Text>
        ))}

        {hiddenCount > 0 && (
          <Text className="font-ui mt-1 text-[18px] text-neutral-outline">
            +{hiddenCount} más
          </Text>
        )}
      </View>
    </View>
  );
}
