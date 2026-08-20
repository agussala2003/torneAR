import { ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { router } from 'expo-router';
import { useAuth } from '@/context/AuthContext';
import { AppIcon } from '@/components/ui/AppIcon';
import { SecondaryHeader } from '@/components/ui/SecondaryHeader';
import {
  MatchShareCard,
  SHARE_CARD_HEIGHT,
  SHARE_CARD_WIDTH,
} from '@/components/match-share/MatchShareCard';
import type { MatchOutcome, MatchShareCardData } from '@/components/match-share/types';

/**
 * Banco de casos límite de `MatchShareCard`, sin pasar por un partido real.
 *
 * `MatchShareCard` no hace fetch — recibe `MatchShareCardData` + `outcome` ya
 * resueltos (ver comentario de `Props` en `MatchShareCard.tsx`) — así que
 * alcanza con construir el dato a mano. Es la única forma práctica de ver los
 * cuatro casos a la vez: forzarlos desde partidos reales exigiría un empate
 * con nombres larguísimos, una goleada de dos dígitos con siete goleadores
 * distintos y un equipo sin escudo, todo cargado a mano en la base.
 *
 * `outcome` se fija a mano por caso y no con `deriveMatchOutcome` — esa
 * función necesita un `myTeamId` real para saber cuál de los dos equipos es
 * "el mío" (ver su comentario en `types.ts`), y estos mocks no tienen esa
 * noción. Acá se asume "mi equipo es teamA" para que el outcome elegido
 * cuente la misma historia que el marcador.
 *
 * Los `shieldUrl`/`avatarUrl` apuntan a Picsum (placeholder público, sin
 * costo) — es intencional: esta pantalla sólo existe en `__DEV__` o detrás del
 * gate de admin, nunca la ve un usuario final, así que no hace falta que las
 * imágenes salgan de Storage.
 */
const CASES: {
  id: string;
  label: string;
  description: string;
  data: MatchShareCardData;
  outcome: MatchOutcome;
}[] = [
  {
    id: 'A',
    label: 'A · Victoria con MVP y goleadores',
    description: 'Camino feliz: escudos, chip de rating, MVP con foto y una lista corta de goleadores (sin truncar).',
    outcome: 'WIN',
    data: {
      teamA: { id: 't1', name: 'Atlético Once Amigos', shieldUrl: 'https://picsum.photos/seed/tornear-a1/200', eloRating: 1284 },
      teamB: { id: 't2', name: 'Deportivo La Loma', shieldUrl: 'https://picsum.photos/seed/tornear-a2/200', eloRating: 1231 },
      scoreA: 3,
      scoreB: 1,
      matchType: 'RANKING',
      finishedAt: new Date().toISOString(),
      eloDelta: { teamId: 't1', delta: 18 },
      mvp: {
        id: 'p1',
        fullName: 'Nicolás Fernández',
        username: 'nico10',
        avatarUrl: 'https://picsum.photos/seed/tornear-mvp1/200',
      },
      scorers: [
        { name: 'J. Pérez', goals: 2 },
        { name: 'M. Gómez', goals: 1 },
      ],
    },
  },
  {
    id: 'B',
    label: 'B · Derrota, DataBlocks vacío',
    description: 'Sin rating (regla de negocio: no se luce un delta negativo), sin MVP y sin goleadores cargados. El bloque completo debe desaparecer sin dejar un hueco, y el acento pasa a azul acero.',
    outcome: 'LOSS',
    data: {
      teamA: { id: 't3', name: 'Barrio FC', shieldUrl: 'https://picsum.photos/seed/tornear-b1/200', eloRating: 1190 },
      teamB: { id: 't4', name: 'Los del Fondo', shieldUrl: 'https://picsum.photos/seed/tornear-b2/200', eloRating: 1256 },
      scoreA: 0,
      scoreB: 2,
      matchType: 'RANKING',
      finishedAt: new Date().toISOString(),
      eloDelta: null,
      mvp: null,
      scorers: null,
    },
  },
  {
    id: 'C',
    label: 'C · Empate, nombres largos',
    description: 'Amistoso (sin rating por diseño), sin MVP ni goleadores, y dos nombres que fuerzan el clamp de 2 líneas. Acento gris neutro.',
    outcome: 'DRAW',
    data: {
      teamA: {
        id: 't5',
        name: 'Los Pibes de la Esquina del Barrio Norte',
        shieldUrl: 'https://picsum.photos/seed/tornear-c1/200',
        eloRating: 1200,
      },
      teamB: {
        id: 't6',
        name: 'Atlético Deportivo Social y Cultural Unidos FC',
        shieldUrl: 'https://picsum.photos/seed/tornear-c2/200',
        eloRating: 1198,
      },
      scoreA: 2,
      scoreB: 2,
      matchType: 'AMISTOSO',
      finishedAt: new Date().toISOString(),
      eloDelta: null,
      mvp: null,
      scorers: null,
    },
  },
  {
    id: 'D',
    label: 'D · Goleada sin escudos, goleadores truncados',
    description: 'Marcador de dos dígitos, ambos equipos cayendo al monograma de iniciales (sin shieldUrl), MVP sin foto y siete goleadores — dispara el techo de ScorersBlock ("+2 más").',
    outcome: 'WIN',
    data: {
      teamA: { id: 't7', name: 'Furia FC', shieldUrl: null, eloRating: 1340 },
      teamB: { id: 't8', name: 'Los Pibes', shieldUrl: null, eloRating: 980 },
      scoreA: 11,
      scoreB: 0,
      matchType: 'RANKING',
      finishedAt: new Date().toISOString(),
      eloDelta: { teamId: 't7', delta: 42 },
      mvp: {
        id: 'p2',
        fullName: 'Tomás Ibáñez',
        username: 'tomi_i',
        avatarUrl: null,
      },
      scorers: [
        { name: 'Tomás Ibáñez', goals: 3 },
        { name: 'Franco Díaz', goals: 2 },
        { name: 'Bruno Álvarez', goals: 2 },
        { name: 'Ezequiel Paz', goals: 1 },
        { name: 'Lautaro Ríos', goals: 1 },
        { name: 'Gastón Molina', goals: 1 },
        { name: 'Ignacio Sosa', goals: 1 },
      ],
    },
  },
];

/** Ancho del preview en pantalla. La tarjeta real sigue siendo
 *  SHARE_CARD_WIDTH x SHARE_CARD_HEIGHT — esto sólo la escala visualmente,
 *  mismo mecanismo que usa `ShareMatchButton` para su modal. */
const PREVIEW_WIDTH = 340;
const PREVIEW_SCALE = PREVIEW_WIDTH / SHARE_CARD_WIDTH;
const PREVIEW_HEIGHT = SHARE_CARD_HEIGHT * PREVIEW_SCALE;

function ScaledCardPreview({ data, outcome }: { data: MatchShareCardData; outcome: MatchOutcome }) {
  return (
    <View
      style={{ width: PREVIEW_WIDTH, height: PREVIEW_HEIGHT, overflow: 'hidden', borderRadius: 20 }}
      className="border border-neutral-outline-variant/40"
    >
      <View
        style={{
          width: SHARE_CARD_WIDTH,
          height: SHARE_CARD_HEIGHT,
          transform: [{ scale: PREVIEW_SCALE }],
          transformOrigin: 'top left',
        }}
        // `collapsable={false}`: mismo motivo que en `ShareMatchButton` — sin
        // esto RN puede aplanar la vista y romper la medición si algún día
        // esta pantalla también captura la tarjeta a imagen para QA visual.
        collapsable={false}
      >
        <MatchShareCard data={data} outcome={outcome} />
      </View>
    </View>
  );
}

/**
 * Banco de pruebas de `MatchShareCard`: los cuatro casos límite del diseño
 * uno debajo del otro, para revisar de un vistazo que ninguno se vea roto.
 *
 * Gate: `__DEV__` (cualquiera en un dev client/Expo Go) o `profile.is_admin`
 * (para poder revisarlo contra un build de producción sin pasar por un dev
 * client). Mismo patrón de "Acceso denegado" que `app/admin/index.tsx` — la
 * pantalla existe siempre pero sólo pinta el contenido real si corresponde,
 * así que no hace falta esconder la ruta del router.
 */
export default function ShareCardPreviewScreen() {
  const { profile } = useAuth();
  const canView = __DEV__ || profile?.is_admin === true;

  if (!canView) {
    return (
      <View className="flex-1 items-center justify-center bg-surface-base px-6">
        <AppIcon family="material-community" name="lock-outline" size={44} color="#869585" />
        <Text className="font-display mt-3 text-xl text-neutral-on-surface">Acceso denegado</Text>
        <Text className="font-ui mt-2 text-center text-neutral-on-surface-variant">
          Esta pantalla es una herramienta de desarrollo, solo para administradores.
        </Text>
        <TouchableOpacity
          onPress={() => router.back()}
          activeOpacity={0.8}
          className="mt-5 rounded-xl bg-surface-high px-5 py-2.5"
        >
          <Text className="font-uiBold text-sm text-neutral-on-surface">Volver</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-surface-base">
      <SecondaryHeader
        title="Preview: tarjeta de resultado"
        subtitle="Casos límite de MatchShareCard — no es una pantalla de producto"
      />

      <ScrollView contentContainerStyle={{ padding: 20, gap: 32 }}>
        {CASES.map((c) => (
          <View key={c.id} className="items-center gap-3">
            <View className="w-full max-w-[340px] gap-1">
              <Text className="font-uiBold text-sm text-neutral-on-surface">{c.label}</Text>
              <Text className="font-ui text-xs leading-4 text-neutral-on-surface-variant">
                {c.description}
              </Text>
            </View>
            <ScaledCardPreview data={c.data} outcome={c.outcome} />
          </View>
        ))}
      </ScrollView>
    </View>
  );
}
