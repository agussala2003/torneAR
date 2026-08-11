import { useEffect, useRef, useState } from 'react';

/** Tiempo mínimo en pantalla de un indicador de carga. */
const DEFAULT_MINIMUM_MS = 500;

/**
 * Mantiene un indicador de carga en pantalla un tiempo mínimo.
 *
 * Cuando Supabase responde en 80 ms el spinner aparecía y desaparecía dentro del
 * mismo pestañeo: en vez de comunicar «estoy trabajando» se leía como un glitch
 * de la interfaz (auditoría E2E, módulo 1.1). Un parpadeo más corto que la
 * animación que lo dibuja es peor que no mostrar nada.
 *
 * Devuelve `true` mientras `active` esté encendido y hasta completar el mínimo
 * desde que se encendió. Si la operación tarda más que el mínimo no agrega
 * ninguna demora: apaga apenas termina.
 *
 * **Es un flag de presentación, no de control.** Los guards de reentrada
 * (`if (loading) return`) tienen que seguir usando el estado real, o el
 * formulario quedaría bloqueado más tiempo del que dura la operación.
 */
export function useMinimumVisible(active: boolean, minimumMs = DEFAULT_MINIMUM_MS): boolean {
  const [visible, setVisible] = useState(active);
  const shownAtRef = useRef<number | null>(active ? Date.now() : null);

  useEffect(() => {
    if (active) {
      // Sólo se sella el arranque la primera vez: si `active` parpadea, el
      // mínimo se cuenta desde que el indicador se vio por primera vez.
      if (shownAtRef.current === null) shownAtRef.current = Date.now();
      setVisible(true);
      return;
    }

    if (shownAtRef.current === null) {
      setVisible(false);
      return;
    }

    const remaining = minimumMs - (Date.now() - shownAtRef.current);
    if (remaining <= 0) {
      shownAtRef.current = null;
      setVisible(false);
      return;
    }

    const timer = setTimeout(() => {
      shownAtRef.current = null;
      setVisible(false);
    }, remaining);

    return () => clearTimeout(timer);
  }, [active, minimumMs]);

  return visible;
}
