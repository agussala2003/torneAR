import { describe, expect, it } from 'vitest';
import {
  averageAge,
  calculateAge,
  calculateAgeFromDate,
  formatAge,
  maxSignupBirthDate,
  MINIMUM_SIGNUP_AGE,
} from '@/lib/age';

// Fecha fija: sin esto los tests de "todavía no cumplió" cambian de resultado
// según el día en que corra CI.
const NOW = new Date(2026, 7, 4); // 2026-08-04

describe('calculateAge', () => {
  it('calcula los años cumplidos', () => {
    expect(calculateAge('1995-06-15', NOW)).toBe(31);
  });

  it('descuenta un año a quien todavía no cumplió', () => {
    // Cumple en diciembre: al 4 de agosto sigue teniendo 30.
    expect(calculateAge('1995-12-01', NOW)).toBe(30);
  });

  it('cuenta el año el mismo día del cumpleaños', () => {
    expect(calculateAge('1995-08-04', NOW)).toBe(31);
  });

  it('no lo cuenta el día anterior al cumpleaños', () => {
    expect(calculateAge('1995-08-05', NOW)).toBe(30);
  });

  it('devuelve null sin fecha cargada', () => {
    expect(calculateAge(null, NOW)).toBeNull();
    expect(calculateAge(undefined, NOW)).toBeNull();
    expect(calculateAge('', NOW)).toBeNull();
  });

  it('devuelve null ante una fecha imposible en vez de rodarla al mes siguiente', () => {
    expect(calculateAge('1995-02-31', NOW)).toBeNull();
    expect(calculateAge('no-es-fecha', NOW)).toBeNull();
  });

  it('devuelve null ante una fecha futura en vez de una edad negativa', () => {
    expect(calculateAge('2030-01-01', NOW)).toBeNull();
  });

  it('tolera el timestamp completo que devuelve Postgres si la columna cambiara', () => {
    expect(calculateAge('1995-06-15T00:00:00+00:00', NOW)).toBe(31);
  });
});

describe('formatAge', () => {
  it('pluraliza', () => {
    expect(formatAge(31)).toBe('31 años');
    expect(formatAge(1)).toBe('1 año');
  });

  it('devuelve null cuando no hay edad', () => {
    expect(formatAge(null)).toBeNull();
  });
});

describe('averageAge', () => {
  it('promedia el plantel con un decimal', () => {
    const result = averageAge(['1995-01-01', '2000-01-01', '1990-01-01'], NOW);
    // 31 + 26 + 36 = 93 / 3 = 31
    expect(result).toEqual({ average: 31, counted: 3 });
  });

  it('ignora a quienes no cargaron la fecha en vez de contarlos como 0', () => {
    const result = averageAge(['1996-01-01', null, undefined], NOW);
    expect(result).toEqual({ average: 30, counted: 1 });
  });

  it('devuelve null cuando nadie cargó su fecha', () => {
    expect(averageAge([null, null], NOW)).toBeNull();
    expect(averageAge([], NOW)).toBeNull();
  });

  it('redondea a un decimal', () => {
    // 31 y 26 → 28.5
    expect(averageAge(['1995-01-01', '2000-01-01'], NOW)?.average).toBe(28.5);
  });
});

describe('maxSignupBirthDate', () => {
  it('devuelve la fecha de quien cumple la edad mínima justo hoy', () => {
    // Es el tope del calendario: nacido este día, hoy cumple 18.
    expect(maxSignupBirthDate(NOW)).toEqual(new Date(2008, 7, 4));
  });

  it('el tope es válido: quien nació ese día ya tiene la edad mínima', () => {
    // Borde inclusivo. Si el picker ofrece esta fecha, el schema tiene que
    // aceptarla — si no, el usuario elige del calendario y le rebota al enviar.
    expect(calculateAgeFromDate(maxSignupBirthDate(NOW), NOW)).toBe(MINIMUM_SIGNUP_AGE);
  });

  it('un día después del tope ya no alcanza la edad mínima', () => {
    const tope = maxSignupBirthDate(NOW);
    const unDiaDespues = new Date(tope.getFullYear(), tope.getMonth(), tope.getDate() + 1);
    expect(calculateAgeFromDate(unDiaDespues, NOW)).toBe(MINIMUM_SIGNUP_AGE - 1);
  });

  it('respeta el 29 de febrero sin desbordar a marzo', () => {
    // 2044 no es bisiesto: `new Date(2044, 1, 29)` rodaría al 1 de marzo si el
    // cálculo se hiciera restando milisegundos.
    const bisiesto = new Date(2062, 1, 29); // 2062-02-29 no existe → 2062-03-01
    const tope = maxSignupBirthDate(bisiesto);
    expect(calculateAgeFromDate(tope, bisiesto)).toBe(MINIMUM_SIGNUP_AGE);
  });
});
