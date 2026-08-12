import { useCallback, useEffect, useMemo, useState } from 'react';
import * as Location from 'expo-location';
import { useAuth } from '@/context/AuthContext';
import { Logger } from '@/lib/logger';
import type { Coordinates } from '@/lib/geo';
import {
  EMPTY_DISTANCE_INDEX,
  fetchMarketDistanceIndex,
  resolveDistanceLabel,
  resolveDistanceMeters,
  type DistanceOrigin,
  type MarketDistanceIndex,
  type PostLocation,
} from '@/lib/market-distance';

/**
 * Único punto de entrada para las distancias que muestra la app.
 *
 * Antes cada pantalla armaba su propio origen: la propuesta de partido pedía el
 * GPS y el Mercado usaba el centroide de la zona del perfil, así que el mismo
 * predio aparecía a "100 m" en una y a "600 m" en la otra. El hook resuelve el
 * origen una sola vez y las tres superficies (Mercado, alta de oferta,
 * propuesta) comparten índice, prioridad y formato de etiqueta.
 *
 * ## GPS: sólo si el permiso ya estaba dado
 *
 * `getLastKnownPositionAsync` y NO `getCurrentPositionAsync`: la última posición
 * conocida es instantánea y no enciende el GPS. Y se consulta únicamente si el
 * permiso YA está concedido —elegir cancha o mirar el Mercado no justifica pedir
 * un permiso nuevo—, así que sin permiso las pantallas se comportan como antes:
 * miden desde la zona del perfil.
 */
export function useDistanceResolver() {
  const { profile } = useAuth();
  const [index, setIndex] = useState<MarketDistanceIndex>(EMPTY_DISTANCE_INDEX);
  const [coords, setCoords] = useState<Coordinates | null>(null);

  useEffect(() => {
    let cancelled = false;

    void fetchMarketDistanceIndex().then((result) => {
      if (!cancelled) setIndex(result);
    });

    void (async () => {
      try {
        const { granted } = await Location.getForegroundPermissionsAsync();
        if (!granted || cancelled) return;

        const position = await Location.getLastKnownPositionAsync();
        if (!position || cancelled) return;

        setCoords({ lat: position.coords.latitude, lng: position.coords.longitude });
      } catch (error) {
        // Degradar al centroide de la zona es exactamente el fallback previsto,
        // asi que la pantalla sigue funcionando. Queda registrado porque desde
        // afuera "midio desde la zona" no se distingue de "midio desde el GPS".
        Logger.warn('No se pudo leer la ultima ubicacion conocida; se mide desde la zona', {
          scope: 'useDistanceResolver.lastKnownPosition',
          error,
        });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const origin = useMemo<DistanceOrigin>(
    () => ({ coords, zone: profile?.zone }),
    [coords, profile?.zone],
  );

  const label = useCallback(
    (post: PostLocation) => resolveDistanceLabel(index, origin, post),
    [index, origin],
  );

  const meters = useCallback(
    (post: PostLocation) => resolveDistanceMeters(index, origin, post),
    [index, origin],
  );

  return {
    /** Etiqueta lista para el badge, o `null` si no hay distancia que mostrar. */
    label,
    /** Metros crudos, para ordenar o comparar. */
    meters,
    /** `true` cuando se mide desde el GPS y no desde el centroide de la zona. */
    hasPreciseOrigin: coords !== null,
  };
}
