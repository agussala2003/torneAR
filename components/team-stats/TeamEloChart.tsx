import { useMemo } from 'react';
import { Text, View } from 'react-native';
import Svg, { Circle, Line, Polyline } from 'react-native-svg';
import { buildEloChartLayout, type EloTrend } from '@/lib/team-stats-utils';
import type { TeamEloPoint } from './types';

const CHART_WIDTH = 300;
const CHART_HEIGHT = 120;

const TREND_COLOR: Record<EloTrend, string> = {
  up: '#53E076', // brand-primary
  down: '#FFB4AB', // danger-error
  flat: '#BCCBB9', // neutral-on-surface-variant
};

const TREND_BG: Record<EloTrend, string> = {
  up: 'rgba(83,224,118,0.12)',
  down: 'rgba(255,180,171,0.12)',
  flat: 'rgba(188,203,185,0.12)',
};

function formatShortDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getDate()}/${d.getMonth() + 1}`;
}

type TeamEloChartProps = {
  history: TeamEloPoint[];
  currentElo: number;
};

export function TeamEloChart({ history, currentElo }: TeamEloChartProps) {
  const layout = useMemo(
    () => buildEloChartLayout(history.map((h) => h.elo), CHART_WIDTH, CHART_HEIGHT),
    [history],
  );

  const color = TREND_COLOR[layout.trend];
  const referenceY = layout.points[0]?.y ?? CHART_HEIGHT / 2;
  const lastPoint = layout.points[layout.points.length - 1];

  return (
    <View className="mt-6">
      <Text className="font-display mb-3 px-1 text-sm uppercase tracking-wider text-neutral-on-surface-variant">
        Evolución de ELO
      </Text>

      {history.length < 2 ? (
        <View className="items-center rounded-xl bg-surface-low px-4 py-6">
          <Text
            className="font-displayBlack text-2xl text-neutral-on-surface"
            style={{ fontVariant: ['tabular-nums'] }}
          >
            {currentElo}
          </Text>
          <Text className="font-ui mt-2 text-center text-xs text-neutral-on-surface-variant">
            {history.length === 0
              ? 'Todavía no jugó ningún partido de ranking.'
              : 'Necesita al menos 2 partidos de ranking para mostrar la evolución.'}
          </Text>
        </View>
      ) : (
        <View className="rounded-xl bg-surface-low p-4">
          <View className="mb-3 flex-row items-center justify-between">
            <View>
              <Text className="font-ui text-[11px] uppercase tracking-wide text-neutral-on-surface-variant">
                Actual
              </Text>
              <Text
                className="font-displayBlack mt-1 text-2xl text-neutral-on-surface"
                style={{ fontVariant: ['tabular-nums'] }}
              >
                {currentElo}
              </Text>
            </View>
            <View className="rounded-lg px-2.5 py-1" style={{ backgroundColor: TREND_BG[layout.trend] }}>
              <Text className="font-uiBold text-xs" style={{ color }}>
                {layout.netDelta > 0 ? `+${layout.netDelta}` : layout.netDelta} en los últimos {history.length}
              </Text>
            </View>
          </View>

          <Svg width="100%" height={CHART_HEIGHT} viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}>
            {/* Línea de referencia: el ELO al inicio de la ventana mostrada */}
            <Line
              x1={0}
              y1={referenceY}
              x2={CHART_WIDTH}
              y2={referenceY}
              stroke="#353534"
              strokeWidth={1}
              strokeDasharray="4,4"
            />
            <Polyline
              points={layout.points.map((p) => `${p.x},${p.y}`).join(' ')}
              fill="none"
              stroke={color}
              strokeWidth={2.5}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
            {lastPoint ? <Circle cx={lastPoint.x} cy={lastPoint.y} r={5} fill={color} /> : null}
          </Svg>

          <View className="mt-1 flex-row justify-between">
            <Text className="font-ui text-[10px] text-neutral-on-surface-variant">
              {formatShortDate(history[0].createdAt)}
            </Text>
            <Text className="font-ui text-[10px] text-neutral-on-surface-variant">
              {formatShortDate(history[history.length - 1].createdAt)}
            </Text>
          </View>
        </View>
      )}
    </View>
  );
}
