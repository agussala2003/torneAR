import { View, Text } from 'react-native';
import { Image } from 'expo-image';
import { TeamShield } from '@/components/ui/TeamShield';
import { AppIcon } from '@/components/ui/AppIcon';
import type { MatchShareCardData } from './types';

/**
 * Formato 4:5 — el que Instagram Stories recorta sin recuadrar ni perder
 * contenido de los bordes. Dimensiones fijas y NUNCA `flex-1`/`%` en el
 * contenedor raíz: es lo único que garantiza que la tarjeta se vea igual al
 * capturarse en cualquier pantalla, sin importar el tamaño real del
 * dispositivo que la renderiza.
 */
export const SHARE_CARD_WIDTH = 1080;
export const SHARE_CARD_HEIGHT = 1350;

/**
 * Mismo criterio que el logo del header (`GlobalHeader.tsx`): ancho y alto
 * explícitos, nunca `aspectRatio` con un solo lado — esa combinación deja el
 * logo en 0 de ancho en Yoga (nativo) aunque en web se vea bien.
 */
const WATERMARK_HEIGHT = 44;
const WATERMARK_WIDTH = Math.round(WATERMARK_HEIGHT * (2169 / 725));

const MATCH_TYPE_LABEL: Record<MatchShareCardData['matchType'], string> = {
  RANKING: 'Partido de Ranking',
  AMISTOSO: 'Amistoso',
};

function formatCardDate(iso: string | null): string {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('es-AR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

interface TeamColumnProps {
  name: string;
  shieldUrl: string | null;
  score: number | null;
}

function TeamColumn({ name, shieldUrl, score }: TeamColumnProps) {
  return (
    <View className="w-[380px] items-center gap-6">
      <TeamShield shieldUrl={shieldUrl} size={200} />
      <Text
        className="font-uiBold text-center text-[32px] leading-9 text-neutral-on-surface"
        numberOfLines={2}
      >
        {name}
      </Text>
      <Text className="font-displayBlack text-[96px] leading-[96px] text-neutral-on-surface">
        {score ?? '-'}
      </Text>
    </View>
  );
}

interface Props {
  data: MatchShareCardData;
}

/**
 * Tarjeta 100% presentacional: no hace fetch, no maneja estado, no sabe de
 * `react-native-view-shot` (eso lo orquesta `ShareMatchButton`, fuera de este
 * componente). Sólo recibe `MatchShareCardData` ya resuelto y lo pinta.
 */
export function MatchShareCard({ data }: Props) {
  const { teamA, teamB, scoreA, scoreB, matchType, finishedAt, eloDelta, mvp } = data;

  return (
    <View
      style={{ width: SHARE_CARD_WIDTH, height: SHARE_CARD_HEIGHT }}
      className="items-center justify-between bg-surface-lowest px-12 py-16"
    >
      {/* Encabezado: tipo de partido + fecha */}
      <View className="items-center gap-3">
        <Text className="font-displayBlack text-[30px] uppercase tracking-[8px] text-brand-primary">
          {MATCH_TYPE_LABEL[matchType] ?? matchType}
        </Text>
        {finishedAt && (
          <Text className="font-ui text-[24px] text-neutral-on-surface-variant">
            {formatCardDate(finishedAt)}
          </Text>
        )}
      </View>

      {/* Escudos + chip de rating + MVP, agrupados: si el chip y/o el MVP no
          corresponden (amistoso, derrota, sin MVP cargado) el `gap` sólo se
          aplica entre los hijos que SÍ se renderizan — nada de huecos fijos
          reservados para contenido ausente. El grupo entero se centra en el
          alto disponible vía el `justify-between` del contenedor raíz. */}
      <View className="w-full items-center gap-14">
        <View className="w-full flex-row items-start justify-center gap-8">
          <TeamColumn name={teamA.name} shieldUrl={teamA.shieldUrl} score={scoreA} />
          <Text className="font-displayBlack mt-16 text-[64px] text-neutral-outline">-</Text>
          <TeamColumn name={teamB.name} shieldUrl={teamB.shieldUrl} score={scoreB} />
        </View>

        {/* Chip de rating — condicional, ver MatchShareCardData.eloDelta */}
        {eloDelta && (
          <View className="flex-row items-center gap-3 rounded-full border border-brand-gold/40 bg-brand-gold/15 px-8 py-4">
            <AppIcon family="material-community" name="trending-up" size={30} color="#FABD32" />
            <Text className="font-displayBlack text-[34px] tracking-wide text-brand-gold">
              +{eloDelta.delta} RATING
            </Text>
          </View>
        )}

        {/* MVP — condicional */}
        {mvp && (
          <View className="flex-row items-center gap-4 rounded-full bg-surface-container px-6 py-4">
            {mvp.avatarUrl ? (
              <Image
                source={{ uri: mvp.avatarUrl }}
                style={{ height: 72, width: 72, borderRadius: 36 }}
                contentFit="cover"
              />
            ) : (
              <View className="h-[72px] w-[72px] items-center justify-center rounded-full bg-surface-high">
                <AppIcon family="material-community" name="account" size={38} color="#BCCBB9" />
              </View>
            )}
            <View className="gap-1">
              <Text className="font-ui text-[20px] uppercase tracking-widest text-brand-gold">
                MVP del partido
              </Text>
              <Text className="font-uiBold text-[28px] text-neutral-on-surface" numberOfLines={1}>
                {mvp.fullName}
              </Text>
            </View>
          </View>
        )}
      </View>

      {/* Marca de agua */}
      <View className="flex-row items-center gap-3">
        <Image
          source={require('@/assets/new-images/logo_nombre_derecha.png')}
          contentFit="contain"
          style={{ height: WATERMARK_HEIGHT, width: WATERMARK_WIDTH }}
        />
      </View>
    </View>
  );
}
