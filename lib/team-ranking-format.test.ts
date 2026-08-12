import { describe, it, expect } from 'vitest';
import { resolveBestFormatRanking } from './team-ranking-format';

const FALLBACK = { eloRating: 1000, format: 'FUTBOL_11' as const };

describe('resolveBestFormatRanking', () => {
  it('devuelve el formato de mayor puntaje', () => {
    const result = resolveBestFormatRanking(
      [
        { format: 'FUTBOL_7', elo_score: 961 },
        { format: 'FUTBOL_5', elo_score: 1000 },
      ],
      FALLBACK,
    );

    expect(result).toEqual({ eloRating: 1000, format: 'FUTBOL_5', isFallback: false });
  });

  it('no depende del orden en que llegan las filas', () => {
    const rows = [
      { format: 'FUTBOL_5' as const, elo_score: 1000 },
      { format: 'FUTBOL_7' as const, elo_score: 961 },
    ];

    expect(resolveBestFormatRanking(rows, FALLBACK)).toEqual(
      resolveBestFormatRanking([...rows].reverse(), FALLBACK),
    );
  });

  it('desempata por orden del enum y no alfabéticamente', () => {
    // Alfabéticamente 'FUTBOL_11' < 'FUTBOL_5', pero en el enum va último. El
    // `ORDER BY tr.format` de Postgres usa el orden de declaración, y esta
    // función tiene que coincidir o el widget y la tarjeta rotulan distinto.
    const result = resolveBestFormatRanking(
      [
        { format: 'FUTBOL_11', elo_score: 1000 },
        { format: 'FUTBOL_5', elo_score: 1000 },
      ],
      FALLBACK,
    );

    expect(result.format).toBe('FUTBOL_5');
  });

  it('desempata igual con las filas al revés', () => {
    const result = resolveBestFormatRanking(
      [
        { format: 'FUTBOL_5', elo_score: 1000 },
        { format: 'FUTBOL_11', elo_score: 1000 },
      ],
      FALLBACK,
    );

    expect(result.format).toBe('FUTBOL_5');
  });

  it('cae al ELO global y al formato preferido si el equipo nunca jugó ranking', () => {
    expect(resolveBestFormatRanking([], FALLBACK)).toEqual({
      eloRating: 1000,
      format: 'FUTBOL_11',
      isFallback: true,
    });
  });

  it('usa el puntaje por formato aunque sea menor que el ELO global del fallback', () => {
    // El caso del QA al revés: el equipo tiene 961 en su único formato y 1000
    // de ELO global. Manda el del formato, que es lo que muestra el ranking.
    const result = resolveBestFormatRanking([{ format: 'FUTBOL_5', elo_score: 961 }], FALLBACK);

    expect(result).toEqual({ eloRating: 961, format: 'FUTBOL_5', isFallback: false });
  });
});
