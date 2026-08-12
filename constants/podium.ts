/**
 * Colores del podio y del prestigio.
 *
 * Existen como constantes y no sólo como clases de NativeWind porque buena
 * parte de los lugares donde se usan no aceptan `className`: `AppIcon` recibe
 * un `color` string, y las filas del ranking pintan la barra lateral con
 * `style={{ backgroundColor }}` porque el color se elige en runtime según la
 * posición.
 *
 * Antes cada pantalla repetía el literal `'#FABD32'` —la fila del ranking, el
 * widget del inicio, el badge de MVP— y no había forma de saber que eran el
 * mismo concepto: el oro del ranking y el ámbar de las advertencias
 * compartían valor por casualidad. Acá el oro tiene nombre propio, y el token
 * `brand-gold` de `tailwind.config.js` refleja el mismo valor para donde sí se
 * puede usar una clase.
 */

/** 1er puesto, MVP y logros. Igual que `brand-gold`. */
export const GOLD = '#FABD32';

/** Bordes y fondos que acompañan al oro sin competirle. Igual que `brand-gold-dim`. */
export const GOLD_DIM = '#C9962A';

export const SILVER = '#BCCBB9';
export const BRONZE = '#CD7F32';

/**
 * Color por posición del podio; `null` fuera del top 3, para que el llamador
 * decida su propio neutro (no es el mismo gris en la tabla que en el widget).
 */
export function podiumColor(position: number): string | null {
  if (position === 1) return GOLD;
  if (position === 2) return SILVER;
  if (position === 3) return BRONZE;
  return null;
}

/**
 * Insignias que se pintan en dorado en vez del verde del resto.
 *
 * Se listan por slug y no por una columna nueva en `badges`: son dos de diez y
 * el criterio es de presentación, no de dominio — la base no tiene por qué
 * saber de qué color se dibuja un logro.
 *
 * Las dos ya se llaman "de Oro" en el catálogo ("MVP de Oro", "Fair Play Oro"),
 * así que pintarlas de verde contradecía su propio nombre.
 */
const GOLD_BADGE_SLUGS = new Set(['mvp_recurrente', 'fair_play_oro']);

export function isGoldBadge(slug: string): boolean {
  return GOLD_BADGE_SLUGS.has(slug);
}
