import { describe, it, expect } from 'vitest';
import { buildEloChartLayout } from './team-stats-utils';

describe('buildEloChartLayout', () => {
  it('devuelve layout vacío cuando no hay valores', () => {
    const layout = buildEloChartLayout([], 300, 120);
    expect(layout.points).toEqual([]);
    expect(layout.trend).toBe('flat');
    expect(layout.netDelta).toBe(0);
  });

  it('centra el único punto horizontalmente cuando hay un solo valor', () => {
    const layout = buildEloChartLayout([1000], 300, 120);
    expect(layout.points).toHaveLength(1);
    expect(layout.points[0].x).toBe(150);
    expect(layout.minElo).toBe(1000);
    expect(layout.maxElo).toBe(1000);
    expect(layout.trend).toBe('flat');
  });

  it('detecta tendencia "up" cuando el último valor es mayor al primero', () => {
    const layout = buildEloChartLayout([1000, 1020, 1040], 300, 120);
    expect(layout.trend).toBe('up');
    expect(layout.netDelta).toBe(40);
    // El primer punto debe estar más abajo (y mayor) que el último (ELO creciente => y decreciente)
    expect(layout.points[0].y).toBeGreaterThan(layout.points[2].y);
  });

  it('detecta tendencia "down" cuando el último valor es menor al primero', () => {
    const layout = buildEloChartLayout([1040, 1010, 1000], 300, 120);
    expect(layout.trend).toBe('down');
    expect(layout.netDelta).toBe(-40);
  });

  it('detecta tendencia "flat" cuando el primer y último valor son iguales, y no rompe con rango 0', () => {
    const layout = buildEloChartLayout([1000, 1000, 1000], 300, 120);
    expect(layout.trend).toBe('flat');
    expect(layout.netDelta).toBe(0);
    // Con rango 0 no debería haber NaN en las coordenadas
    for (const p of layout.points) {
      expect(Number.isNaN(p.x)).toBe(false);
      expect(Number.isNaN(p.y)).toBe(false);
    }
  });

  it('distribuye los puntos en x de forma uniforme entre 0 y el ancho', () => {
    const layout = buildEloChartLayout([1000, 1010, 1020, 1030], 400, 100);
    expect(layout.points[0].x).toBe(0);
    expect(layout.points[3].x).toBe(400);
    expect(layout.points[1].x).toBeCloseTo(400 / 3, 5);
  });

  it('respeta el padding vertical: los puntos quedan dentro de [padding, height-padding]', () => {
    const layout = buildEloChartLayout([1000, 1050], 300, 120, 12);
    for (const p of layout.points) {
      expect(p.y).toBeGreaterThanOrEqual(12);
      expect(p.y).toBeLessThanOrEqual(108);
    }
  });
});
