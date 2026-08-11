// tornear/lib/favorite-teams.ts

/**
 * Catalogo cerrado de cuadros favoritos (Liga Profesional Argentina).
 *
 * Es una constante del cliente y NO una tabla, a proposito: el cuadro favorito
 * es un dato de identidad del usuario, no una entidad del dominio. Los `teams`
 * de torneAR son los equipos amateur de la app; mezclar clubes profesionales en
 * esa tabla contaminaria rankings, ELO y busquedas del mercado.
 *
 * Si en el futuro se necesitan filtros por club, migrar a una tabla
 * `football_clubs` con su propia migracion.
 */

/**
 * Base de los escudos, en 256x256 (suficiente para un avatar de 44px hasta 3x
 * de densidad, ~10 KB por archivo).
 *
 * ⚠️ El tamaño es parte de la identidad del archivo, no un parametro
 * intercambiable: football-logos.cc publica un hash DISTINTO por cada
 * resolucion del mismo escudo. Independiente Rivadavia, por ejemplo, es
 * `9af0d0c7` en 64x64, `fd293578` en 256x256 y `f8dad054` en 1500x1500.
 * Cambiar `256x256` por otro tamaño rompe las 28 URLs de una.
 */
const CLUB_LOGO_BASE_URL = 'https://assets.football-logos.cc/logos/argentina/256x256';

/**
 * Catalogo: nombre canonico + archivo del escudo.
 *
 * `logoFile` incluye el HASH del contenido y no solo el slug. No es un detalle
 * cosmetico: la URL sin hash devuelve 404 (verificado contra el servidor), asi
 * que no alcanza con concatenar un slug — hay que pinear el archivo exacto.
 *
 * Los 28 valores se extrajeron del HTML de https://football-logos.cc/argentina
 * y se verificaron UNO POR UNO con una request real (HTTP 200 + image/png) el
 * 2026-08-11. No estan escritos de memoria.
 *
 * Ojo con los slugs que no coinciden con el nombre — son del proveedor, no
 * nuestros, y no se pueden "arreglar":
 *   · Argentinos Juniors  → `argeninos-juniors` (SIC: falta la 't', es un typo
 *                            del proveedor; corregirlo da 404)
 *   · Huracan             → `ca-huracan`
 *   · Gimnasia LP         → `gimnasia-lp` (hay otras cuatro "Gimnasia" en el
 *                            catalogo del sitio: Jujuy, Mendoza, Salta)
 *   · Instituto           → `instituto-cordoba`
 *   · San Lorenzo         → `san-lorenzo-de-almagro`
 *   · Racing Club         → `racing-club` (existe tambien `racing`, que es otro
 *                            club: el sitio lo titula "Racing" a secas)
 *   · Talleres            → `talleres` (existe `talleres-remedios-de-escalada`)
 *
 * `logoFile: null` es "no hay escudo que mostrar", no un dato faltante.
 */
export const FAVORITE_TEAMS = [
  { name: 'Argentinos Juniors', logoFile: 'argeninos-juniors.a7c47840' },
  { name: 'Atlético Tucumán', logoFile: 'atletico-tucuman.3021868e' },
  { name: 'Banfield', logoFile: 'banfield.2b03df71' },
  { name: 'Barracas Central', logoFile: 'barracas-central.d735f375' },
  { name: 'Belgrano', logoFile: 'belgrano.a9ed5c35' },
  { name: 'Boca Juniors', logoFile: 'boca-juniors.533fd0f6' },
  { name: 'Central Córdoba', logoFile: 'central-cordoba.6116953f' },
  { name: 'Defensa y Justicia', logoFile: 'defensa-y-justicia.00540812' },
  { name: 'Deportivo Riestra', logoFile: 'deportivo-riestra.34842092' },
  { name: 'Estudiantes de La Plata', logoFile: 'estudiantes-de-la-plata.c58f9f29' },
  { name: 'Gimnasia y Esgrima La Plata', logoFile: 'gimnasia-lp.9ad61caf' },
  { name: 'Godoy Cruz', logoFile: 'godoy-cruz.28da0774' },
  { name: 'Huracán', logoFile: 'ca-huracan.c9e27138' },
  { name: 'Independiente', logoFile: 'independiente.091ccb51' },
  { name: 'Independiente Rivadavia', logoFile: 'independiente-rivadavia.fd293578' },
  { name: 'Instituto', logoFile: 'instituto-cordoba.9dd5a11e' },
  { name: 'Lanús', logoFile: 'lanus.0b3284dc' },
  { name: "Newell's Old Boys", logoFile: 'newells-old-boys.323439bf' },
  { name: 'Platense', logoFile: 'platense.2ed87c5b' },
  { name: 'Racing Club', logoFile: 'racing-club.2b4a44c9' },
  { name: 'River Plate', logoFile: 'river-plate.44a77530' },
  { name: 'Rosario Central', logoFile: 'rosario-central.3341c8bd' },
  { name: 'San Lorenzo', logoFile: 'san-lorenzo-de-almagro.94d7129e' },
  { name: 'Sarmiento', logoFile: 'sarmiento.8f0e71f1' },
  { name: 'Talleres', logoFile: 'talleres.1dcd3bf7' },
  { name: 'Tigre', logoFile: 'tigre.81ae80b6' },
  { name: 'Unión', logoFile: 'union.b8de0704' },
  { name: 'Vélez Sarsfield', logoFile: 'velez-sarsfield.d9813ef4' },
  { name: 'Otro / No tengo', logoFile: null },
] as const;

export type FavoriteTeam = (typeof FAVORITE_TEAMS)[number]['name'];

/**
 * Solo los nombres, que es lo que consume el `OptionPickerDialog`.
 *
 * Se DERIVA del catalogo en vez de ser una segunda lista escrita a mano: con
 * dos arrays paralelos, sumar un club y olvidarse del otro es cuestion de
 * tiempo, y el sintoma seria un equipo elegible sin escudo (o al reves).
 */
export const FAVORITE_TEAM_OPTIONS: readonly string[] = FAVORITE_TEAMS.map((team) => team.name);

/** Indice nombre → archivo. `flatMap` en vez de `filter` para que TS descarte el null. */
const LOGO_FILE_BY_NAME: ReadonlyMap<string, string> = new Map(
  FAVORITE_TEAMS.flatMap((team) =>
    team.logoFile ? [[team.name, team.logoFile] as [string, string]] : [],
  ),
);

/**
 * URL del escudo, o `null` si el club no tiene uno mapeado.
 *
 * El `null` es un caso esperado y no un error: cubre 'Otro / No tengo' y
 * tambien cualquier valor legacy que la migracion de normalizacion no haya
 * podido resolver. Quien llama muestra el fallback (iniciales), nunca una
 * imagen rota.
 *
 * Es una funcion y no un string armado en la UI para que el dia que los
 * escudos se muden (a Supabase Storage, por ejemplo) cambie solo este archivo.
 */
export function getClubLogoUrl(teamName: string): string | null {
  const file = LOGO_FILE_BY_NAME.get(teamName.trim());
  return file ? `${CLUB_LOGO_BASE_URL}/${file}.png` : null;
}

/** Chequeo de pertenencia al catalogo (lo usa el `.refine` de userProfileSchema). */
export function isValidFavoriteTeam(value: string): boolean {
  return FAVORITE_TEAM_OPTIONS.includes(value);
}
