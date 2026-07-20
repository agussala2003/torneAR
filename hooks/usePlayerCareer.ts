import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { fetchPlayerCareer, PlayerCareer } from '@/lib/career-data';

type UsePlayerCareerResult = {
  career: PlayerCareer | null;
  loading: boolean;
  error: boolean;
  reload: () => Promise<void>;
};

// Carga la trayectoria de forma independiente del resto del perfil: la
// sección muestra su propio Skeleton sin bloquear la pantalla completa.
export function usePlayerCareer(profileId: string | null): UsePlayerCareerResult {
  const [career, setCareer] = useState<PlayerCareer | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const reload = useCallback(async () => {
    if (!profileId) {
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      setError(false);
      setCareer(await fetchPlayerCareer(profileId));
    } catch (err) {
      console.error('Player career fetch failed', err);
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [profileId]);

  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload])
  );

  return { career, loading, error, reload };
}
