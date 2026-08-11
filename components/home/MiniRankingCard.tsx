import { View, Text, TouchableOpacity } from 'react-native';
import { AppIcon } from '@/components/ui/AppIcon';
import { TeamShield } from '@/components/ui/TeamShield';
import type { MiniRankingEntry } from './types';
import type { Database } from '@/types/supabase';

type TeamFormat = Database['public']['Enums']['team_format'];

const FORMAT_LABEL: Record<TeamFormat, string> = {
  FUTBOL_5: 'Fútbol 5',
  FUTBOL_6: 'Fútbol 6',
  FUTBOL_7: 'Fútbol 7',
  FUTBOL_8: 'Fútbol 8',
  FUTBOL_9: 'Fútbol 9',
  FUTBOL_11: 'Fútbol 11',
};

/** Oro / plata / bronce. El resto (no debería haber) cae en el gris de siempre. */
const PODIUM_STYLE: Record<number, { bg: string; text: string; border: string }> = {
  1: { bg: '#FABD3222', text: '#FABD32', border: '#FABD3255' },
  2: { bg: '#BCCBB922', text: '#BCCBB9', border: '#BCCBB955' },
  3: { bg: '#CD7F3222', text: '#E0A46A', border: '#CD7F3255' },
};

interface RowProps {
  entry: MiniRankingEntry;
  isLast: boolean;
}

function MiniRankingRow({ entry, isLast }: RowProps) {
  const podium = PODIUM_STYLE[entry.rankPosition] ?? {
    bg: '#2A2A2A',
    text: '#BCCBB9',
    border: '#86958555',
  };

  return (
    <View>
      <View className="flex-row items-center gap-3 px-4 py-3">
        {/* Posición */}
        <View
          className="h-7 w-7 items-center justify-center rounded-full border"
          style={{ backgroundColor: podium.bg, borderColor: podium.border }}
        >
          <Text className="font-displayBlack text-[13px]" style={{ color: podium.text }}>
            {entry.rankPosition}
          </Text>
        </View>

        <TeamShield shieldUrl={entry.shieldUrl} size={32} isMyTeam={entry.isMyTeam} />

        <View className="flex-1">
          <Text
            className={`font-uiBold text-[13px] ${
              entry.isMyTeam ? 'text-brand-primary' : 'text-neutral-on-surface'
            }`}
            numberOfLines={1}
          >
            {entry.teamName}
          </Text>
          {entry.isMyTeam && (
            <Text className="font-ui text-[10px] uppercase tracking-wider text-brand-primary/70">
              Tu equipo
            </Text>
          )}
        </View>

        <View className="items-end">
          <Text className="font-displayBlack text-[15px] text-neutral-on-surface">
            {entry.eloRating}
          </Text>
          <Text className="font-ui text-[9px] uppercase tracking-wider text-neutral-outline">
            Elo
          </Text>
        </View>
      </View>

      {!isLast && <View className="mx-4 h-px bg-neutral-outline/20" />}
    </View>
  );
}

interface Props {
  entries: MiniRankingEntry[];
  /** Formato con el que se consultó el top 3. `null` mientras no se conoce. */
  format: TeamFormat | null;
  loading: boolean;
  onPress: () => void;
}

/**
 * Tarjeta de sólo presentación: la consulta a Supabase vive en la pantalla Home.
 * Acá no hay más lógica que elegir entre esqueleto, vacío y las tres filas.
 */
export function MiniRankingCard({ entries, format, loading, onPress }: Props) {
  const formatLabel = format ? FORMAT_LABEL[format] : null;

  return (
    <View className="mb-5">
      <View className="mb-3 flex-row items-center justify-between">
        <Text className="font-displayBlack text-xs uppercase tracking-widest text-neutral-on-surface-variant">
          Top 3 {formatLabel ?? 'del ranking'}
        </Text>
        <TouchableOpacity activeOpacity={0.7} onPress={onPress}>
          <Text className="font-uiBold text-xs text-info-secondary">Ver ranking</Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity
        activeOpacity={0.85}
        onPress={onPress}
        className="overflow-hidden rounded-2xl bg-surface-container"
      >
        {loading ? (
          // Tres filas fantasma con la misma altura que las reales: sin salto de
          // layout cuando llega la respuesta.
          <View className="py-1">
            {[0, 1, 2].map((i) => (
              <View key={i} className="flex-row items-center gap-3 px-4 py-3">
                <View className="h-7 w-7 rounded-full bg-surface-high" />
                <View className="h-8 w-8 rounded-full bg-surface-high" />
                <View className="h-3 flex-1 rounded-full bg-surface-high" />
                <View className="h-3 w-10 rounded-full bg-surface-high" />
              </View>
            ))}
          </View>
        ) : entries.length === 0 ? (
          <View className="items-center px-4 py-8">
            <AppIcon family="material-community" name="trophy-outline" size={30} color="#869585" />
            <Text className="font-ui mt-2 text-center text-sm text-neutral-on-surface-variant">
              Todavía no hay equipos rankeados
              {formatLabel ? ` en ${formatLabel}` : ''}
            </Text>
          </View>
        ) : (
          <>
            {entries.map((entry, index) => (
              <MiniRankingRow
                key={entry.teamId}
                entry={entry}
                isLast={index === entries.length - 1}
              />
            ))}

            {/* Pie con la invitación a abrir el ranking completo */}
            <View className="flex-row items-center justify-center gap-1.5 border-t border-neutral-outline/20 bg-surface-high/40 py-2.5">
              <Text className="font-uiBold text-[11px] text-info-secondary">
                Ver la tabla completa
              </Text>
              <AppIcon
                family="material-community"
                name="arrow-right"
                size={13}
                color="#8CCDFF"
              />
            </View>
          </>
        )}
      </TouchableOpacity>
    </View>
  );
}
