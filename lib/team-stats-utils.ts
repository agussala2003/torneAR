export type ChartPoint = { x: number; y: number };

export type EloTrend = 'up' | 'down' | 'flat';

export interface EloChartLayout {
  points: ChartPoint[];
  minElo: number;
  maxElo: number;
  netDelta: number;
  trend: EloTrend;
}

// Convierte una serie cronológica de valores de ELO en puntos (x,y) dentro de
// un rectángulo width x height, listos para dibujar con react-native-svg.
// Función pura — sin dependencias de React Native, testeable directamente.
export function buildEloChartLayout(
  eloValues: number[],
  width: number,
  height: number,
  verticalPadding = 12,
): EloChartLayout {
  if (eloValues.length === 0) {
    return { points: [], minElo: 0, maxElo: 0, netDelta: 0, trend: 'flat' };
  }

  const minElo = Math.min(...eloValues);
  const maxElo = Math.max(...eloValues);
  const range = maxElo - minElo || 1; // evita división por cero cuando todos los valores son iguales
  const usableHeight = height - verticalPadding * 2;

  const points: ChartPoint[] = eloValues.map((elo, i) => {
    const x = eloValues.length === 1 ? width / 2 : (i / (eloValues.length - 1)) * width;
    const y = verticalPadding + usableHeight - ((elo - minElo) / range) * usableHeight;
    return { x, y };
  });

  const netDelta = eloValues[eloValues.length - 1] - eloValues[0];
  const trend: EloTrend = netDelta > 0 ? 'up' : netDelta < 0 ? 'down' : 'flat';

  return { points, minElo, maxElo, netDelta, trend };
}
