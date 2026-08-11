import { useState } from 'react';
import { View, Text } from 'react-native';
import { Image } from 'expo-image';
import { getInitials } from '@/lib/market-utils';

interface Props {
  logoUrl: string | null;
  teamName: string;
  size?: number;
}

/**
 * Escudo de un club con degradación a iniciales.
 *
 * El fallback NO es decorativo. Los escudos viven en football-logos.cc y su URL
 * incluye el hash del archivo: el día que ese sitio reconstruya sus assets, los
 * hashes cambian y las 28 URLs pasan a 404 juntas. Con `onError` la pantalla
 * sigue siendo legible (iniciales sobre el color de siempre) en vez de mostrar
 * 28 huecos rotos.
 *
 * Mismo camino para `logoUrl: null`, que es el caso esperado de un club fuera
 * del catálogo.
 */
export function ClubCrest({ logoUrl, teamName, size = 40 }: Props) {
  const [failed, setFailed] = useState(false);
  const showFallback = logoUrl === null || failed;

  return (
    <View
      className="items-center justify-center overflow-hidden rounded-full border border-neutral-outline/20 bg-surface-high"
      style={{ width: size, height: size }}
    >
      {showFallback ? (
        <Text
          className="font-displayBlack text-neutral-on-surface-variant"
          style={{ fontSize: size * 0.36 }}
        >
          {getInitials(teamName)}
        </Text>
      ) : (
        <Image
          source={{ uri: logoUrl }}
          style={{ width: size * 0.82, height: size * 0.82 }}
          contentFit="contain"
          // `expo-image` cachea en disco por defecto: la lista se re-abre sin
          // volver a pegarle a la red.
          transition={150}
          onError={() => setFailed(true)}
          accessibilityLabel={`Escudo de ${teamName}`}
        />
      )}
    </View>
  );
}
