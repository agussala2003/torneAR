import { View, Text, TouchableOpacity } from 'react-native';
import { AppIcon } from '@/components/ui/AppIcon';
import { TeamShield } from '@/components/ui/TeamShield';
import type { MiniRankingContext, MiniRankingEntry } from './types';
import type { Database } from '@/types/supabase';

type TeamFormat = Database['public']['Enums']['team_format'];
type TeamCategory = Database['public']['Enums']['team_category'];

const FORMAT_LABEL: Record<TeamFormat, string> = {
  FUTBOL_5: 'Fútbol 5',
  FUTBOL_6: 'Fútbol 6',
  FUTBOL_7: 'Fútbol 7',
  FUTBOL_8: 'Fútbol 8',
  FUTBOL_9: 'Fútbol 9',
  FUTBOL_11: 'Fútbol 11',
};

const CATEGORY_LABEL: Record<TeamCategory, string> = {
  HOMBRES: 'Hombres',
  MUJERES: 'Mujeres',
  MIXTO: 'Mixto',
};

/** Chip de contexto de la cabecera (formato, categoría, zona). */
function ContextChip({ label, icon }: { label: string; icon: string }) {
  return (
    <View className="flex-row items-center gap-1 rounded-full border border-brand-primary/25 bg-brand-primary/10 px-2 py-0.5">
      <AppIcon family="material-community" name={icon} size={11} color="#53E076" />
      <Text className="font-uiBold text-[10px] text-brand-primary">{label}</Text>
    </View>
  );
}

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
      {/* La fila propia se despega del resto con fondo + borde izquierdo verde:
          el nombre en verde solo se perdía cuando el equipo caía 2º o 3º. */}
      <View
        className={`flex-row items-center gap-3 py-3 pr-4 ${
          entry.isMyTeam
            ? 'border-l-2 border-brand-primary bg-brand-primary/10 pl-[14px]'
            : 'pl-4'
        }`}
      >
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
            Ranking
          </Text>
        </View>
      </View>

      {!isLast && <View className="mx-4 h-px bg-neutral-outline/20" />}
    </View>
  );
}

interface Props {
  entries: MiniRankingEntry[];
  /**
   * Zona + categoría + formato con los que se consultó el top 3. `null` mientras
   * no se conoce. Es el mismo contexto que se manda por params a la tab Ranking:
   * lo que se lee en los chips es exactamente lo que se va a ver al entrar.
   */
  context: MiniRankingContext | null;
  loading: boolean;
  onPress: () => void;
}

/**
 * Tarjeta de sólo presentación: la consulta a Supabase vive en la pantalla Home.
 * Acá no hay más lógica que elegir entre esqueleto, vacío y las tres filas.
 */
export function MiniRankingCard({ entries, context, loading, onPress }: Props) {
  const formatLabel = context?.format ? FORMAT_LABEL[context.format] : null;
  const categoryLabel = context?.category ? CATEGORY_LABEL[context.category] : null;

  return (
    <View className="mb-5">
      <View className="mb-3 flex-row items-center justify-between">
        <Text className="font-displayBlack text-xs uppercase tracking-widest text-neutral-on-surface-variant">
          Ranking
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
        {/* ── Cabecera con contexto ──────────────────────────────────────────
            Una franja propia, más clara que el cuerpo y con el trofeo en verde:
            el widget arrancaba directo en la fila 1 y no decía de qué torneo
            era la tabla. */}
        <View className="flex-row items-center gap-2.5 border-b border-neutral-outline/20 bg-surface-high/50 px-4 py-3">
          <View className="h-8 w-8 items-center justify-center rounded-full bg-brand-primary/15">
            <AppIcon family="material-community" name="trophy" size={17} color="#53E076" />
          </View>

          <View className="flex-1">
            <Text className="font-displayBlack text-[15px] text-neutral-on-surface" numberOfLines={1}>
              Top 3 {formatLabel ?? 'del ranking'}
            </Text>

            {/* `flex-wrap`: con zonas de nombre largo ("Zona Oeste GBA") los tres
                chips no entran en una línea y se recortarían. */}
            <View className="mt-1 flex-row flex-wrap items-center gap-1.5">
              {categoryLabel && <ContextChip label={categoryLabel} icon="account-group" />}
              {context?.zone && <ContextChip label={context.zone} icon="map-marker" />}
              {!categoryLabel && !context?.zone && (
                <Text className="font-ui text-[10px] uppercase tracking-wider text-neutral-outline">
                  Todas las zonas y categorías
                </Text>
              )}
            </View>
          </View>
        </View>

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
