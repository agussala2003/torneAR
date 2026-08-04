import { useEffect, useState } from 'react';
import { fetchAppVersionPolicy, getCurrentAppVersion } from '@/lib/app-version';
import { isUpdateRequired } from '@/lib/version-compare';
import { Logger } from '@/lib/logger';

export interface ForceUpdateState {
  /** true sólo cuando hay certeza de que este build quedó fuera de circulación. */
  required: boolean;
  currentVersion: string | null;
  latestVersion: string;
  updateUrl: string;
}

const NOT_REQUIRED: ForceUpdateState = {
  required: false,
  currentVersion: null,
  latestVersion: '',
  updateUrl: '',
};

/**
 * Chequeo de versión mínima al arrancar la app.
 *
 * Corre una sola vez por sesión de proceso: la palanca se acciona para sacar de
 * circulación un build, no para pedir actualizaciones cada cinco minutos, y
 * repetir la consulta agregaría latencia al arranque sin cambiar la respuesta.
 *
 * **No bloquea el render.** El estado arranca en "no requerido" y la app pinta
 * normalmente mientras la consulta viaja; si la respuesta dice que hay que
 * actualizar, el modal aparece encima. Esperar a la red antes de pintar
 * convertiría una consulta accesoria en un punto de falla del arranque: sin
 * conexión, la app no abriría.
 */
export function useForceUpdate(): ForceUpdateState {
  const [state, setState] = useState<ForceUpdateState>(NOT_REQUIRED);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const policy = await fetchAppVersionPolicy();
        if (cancelled || !policy) return;

        const currentVersion = getCurrentAppVersion();
        if (!isUpdateRequired(currentVersion, policy.minRequiredVersion)) return;

        Logger.info('Build por debajo de la versión mínima: se fuerza actualización', {
          scope: 'useForceUpdate',
          currentVersion,
          minRequiredVersion: policy.minRequiredVersion,
          platform: policy.platform,
        });

        setState({
          required: true,
          currentVersion,
          latestVersion: policy.latestVersion,
          updateUrl: policy.updateUrl,
        });
      } catch (error) {
        // Cualquier fallo deja la app usable: `fetchAppVersionPolicy` ya
        // absorbe los errores de Supabase, así que llegar acá es un imprevisto
        // y aun así el modo degradado correcto es no bloquear.
        Logger.warn('Falló el chequeo de versión mínima', {
          scope: 'useForceUpdate',
          error,
        });
      }
    })();

    return () => { cancelled = true; };
  }, []);

  return state;
}
