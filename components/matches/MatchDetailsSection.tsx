import { View, Text } from 'react-native';
import type { MatchDetailViewData } from '@/components/matches/types';

interface Props {
  match: MatchDetailViewData;
}

// `minWidth: 0` + `ellipsizeMode`: el tile "Lugar" recibe "{complejo} — {dirección}"
// concatenado en media pantalla. Sin poder encoger, `numberOfLines` no trunca y
// el texto se sale del recuadro.
function Tile({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-1 rounded-xl bg-surface-high p-3" style={{ minWidth: 0 }}>
      <Text className="font-ui mb-1 text-[10px] uppercase tracking-widest text-neutral-outline">
        {label}
      </Text>
      <Text
        className="font-uiBold text-sm text-neutral-on-surface"
        numberOfLines={2}
        ellipsizeMode="tail"
      >
        {value}
      </Text>
    </View>
  );
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('es-AR', { weekday: 'short', day: '2-digit', month: 'short' });
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
}

function formatFormat(fmt: string): string {
  return fmt.replace('FUTBOL_', 'F').replace('_', ' ');
}

export function MatchDetailsSection({ match }: Props) {
  return (
    <View className="mt-4 rounded-2xl bg-surface-container p-4">
      <Text className="font-uiBold mb-3 text-base text-neutral-on-surface">Detalles</Text>
      <View className="gap-2">
        <View className="flex-row gap-2">
          <Tile
            label="Fecha"
            value={match.scheduledAt ? formatDate(match.scheduledAt) : '—'}
          />
          <Tile
            label="Hora"
            value={match.scheduledAt ? formatTime(match.scheduledAt) : '—'}
          />
        </View>
        <View className="flex-row gap-2">
          <Tile
            label="Lugar"
            value={match.venueName ?? match.location ?? 'Sin definir'}
          />
          <Tile
            label="Formato"
            value={match.format ? `${formatFormat(match.format)} · ${match.durationMinutes ?? '?'} min` : '—'}
          />
        </View>
        {(match.signalAmount !== null || match.totalCost !== null) && (
          <View className="flex-row gap-2">
            {match.signalAmount !== null && (
              <Tile label="Seña" value={`$${match.signalAmount}`} />
            )}
            {match.totalCost !== null && (
              <Tile label="Costo total" value={`$${match.totalCost}`} />
            )}
          </View>
        )}
      </View>
    </View>
  );
}
