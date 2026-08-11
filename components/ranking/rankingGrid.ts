/**
 * Anchos de columna de la tabla de ranking, en px.
 *
 * Existen como constante compartida porque el bug que reporto el QA era
 * exactamente que NO lo eran: el encabezado declaraba sus columnas con clases
 * (`w-7`, `w-10`, `mr-4`) y las filas las suyas con `style` y anchos automaticos
 * (`width: 28`, escudo de 34+10, columnas `items-end` sin ancho fijo). Cada
 * cambio en un lado corria las columnas del otro, y como las metricas tienen
 * ancho variable ("100%" vs "0%", "1500" vs "980") el desfasaje cambiaba fila
 * por fila.
 *
 * La posicion sumaba ademas un `marginLeft: 4` condicional para el top 3 y el
 * equipo propio, asi que esas filas quedaban corridas respecto del resto.
 *
 * Numeros y no clases de Tailwind: el encabezado y la fila viven en archivos
 * distintos y la unica forma de garantizar que midan igual es que lean el mismo
 * valor. Con clases habria que confiar en que nadie toque una sin la otra.
 */
export const RANKING_COL = {
  /** Posicion (#). Entra un 3 digitos sin empujar al escudo. */
  position: 32,
  /** Escudo circular + su aire a la derecha. */
  shield: 44,
  /** Efectividad (EF%). Fijo para que "100%" y "0%" ocupen lo mismo. */
  efficiency: 64,
  /** Rating. Fijo para que "1500" y "980" ocupen lo mismo. */
  rating: 64,
  /** Chevron de la fila. En el encabezado es un hueco del mismo ancho. */
  chevron: 20,
} as const;

/** Padding horizontal de la fila. El encabezado lo replica para alinear. */
export const RANKING_ROW_PX = 12;
