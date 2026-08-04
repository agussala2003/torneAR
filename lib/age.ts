/**
 * Edad a partir de `profiles.date_of_birth`.
 *
 * Sin dependencia nueva a propósito: el repo no tiene `dayjs` y agregarlo (más
 * su locale y su plugin de UTC) para una resta de años sería peso en el bundle
 * de una app que ya maneja fechas con `Date` y helpers propios — mismo criterio
 * que `lib/date-mask.ts`.
 *
 * La cuenta se hace sobre los componentes de fecha en local, no sobre la
 * diferencia de milisegundos: dividir por 365.25 se equivoca alrededor del
 * cumpleaños, y ahí es justamente donde el número importa.
 */

/** `date_of_birth` llega como 'YYYY-MM-DD' (columna date de Postgres). */
function parseBirthDate(dateOfBirth: string): { year: number; month: number; day: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(dateOfBirth.trim());
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);

  // `new Date('1995-02-31')` no explota: rueda a marzo. Se valida el
  // round-trip para que una fecha imposible devuelva null en vez de una edad
  // silenciosamente corrida.
  const probe = new Date(year, month - 1, day);
  if (
    probe.getFullYear() !== year ||
    probe.getMonth() !== month - 1 ||
    probe.getDate() !== day
  ) {
    return null;
  }

  return { year, month, day };
}

/**
 * Años cumplidos.
 *
 * `null` cuando no hay fecha, cuando no se puede parsear o cuando la fecha es
 * futura: el llamador decide qué mostrar en su lugar, y eso es preferible a un
 * 0 o un negativo que la UI pintaría como si fuera un dato real.
 */
export function calculateAge(
  dateOfBirth: string | null | undefined,
  now: Date = new Date(),
): number | null {
  if (!dateOfBirth) return null;

  const birth = parseBirthDate(dateOfBirth);
  if (!birth) return null;

  let age = now.getFullYear() - birth.year;

  // Todavía no cumplió este año: se descuenta uno.
  const monthDiff = now.getMonth() + 1 - birth.month;
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < birth.day)) {
    age -= 1;
  }

  return age < 0 ? null : age;
}

/** "27 años" / "1 año", o `null` si no hay edad que mostrar. */
export function formatAge(age: number | null): string | null {
  if (age === null) return null;
  return `${age} ${age === 1 ? 'año' : 'años'}`;
}

/**
 * Promedio de edad de un plantel, redondeado a un decimal.
 *
 * Ignora a quienes no cargaron su fecha de nacimiento en vez de contarlos como
 * 0: un plantel donde la mitad no completó el perfil daría un promedio de 13
 * años y el número parecería un bug del cálculo, no un dato faltante. Por eso
 * también se devuelve `counted`, para que la pantalla pueda aclarar sobre
 * cuántos jugadores se calculó.
 */
export function averageAge(
  datesOfBirth: (string | null | undefined)[],
  now: Date = new Date(),
): { average: number; counted: number } | null {
  const ages = datesOfBirth
    .map((date) => calculateAge(date, now))
    .filter((age): age is number => age !== null);

  if (ages.length === 0) return null;

  const total = ages.reduce((sum, age) => sum + age, 0);
  return {
    average: Math.round((total / ages.length) * 10) / 10,
    counted: ages.length,
  };
}
