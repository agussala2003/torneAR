// tornear/lib/favorite-teams.ts

/**
 * Catalogo cerrado de cuadros favoritos (Liga Profesional Argentina).
 *
 * Es una constante del cliente y NO una tabla, a proposito: el cuadro favorito
 * es un dato de identidad del usuario, no una entidad del dominio. Los `teams`
 * de torneAR son los equipos amateur de la app; mezclar clubes profesionales en
 * esa tabla contaminaria rankings, ELO y busquedas del mercado.
 *
 * Si en el futuro se necesitan escudos o filtros por club, migrar a una tabla
 * `football_clubs` con su propia migracion.
 */
export const FAVORITE_TEAM_OPTIONS = [
  'Argentinos Juniors',
  'Atlético Tucumán',
  'Banfield',
  'Barracas Central',
  'Belgrano',
  'Boca Juniors',
  'Central Córdoba',
  'Defensa y Justicia',
  'Deportivo Riestra',
  'Estudiantes de La Plata',
  'Gimnasia y Esgrima La Plata',
  'Godoy Cruz',
  'Huracán',
  'Independiente',
  'Independiente Rivadavia',
  'Instituto',
  'Lanús',
  "Newell's Old Boys",
  'Platense',
  'Racing Club',
  'River Plate',
  'Rosario Central',
  'San Lorenzo',
  'Sarmiento',
  'Talleres',
  'Tigre',
  'Unión',
  'Vélez Sarsfield',
  'Otro / No tengo',
] as const;

export type FavoriteTeam = (typeof FAVORITE_TEAM_OPTIONS)[number];

/** Chequeo de pertenencia al catalogo (lo usa el `.refine` de userProfileSchema). */
export function isValidFavoriteTeam(value: string): boolean {
  return (FAVORITE_TEAM_OPTIONS as readonly string[]).includes(value);
}
