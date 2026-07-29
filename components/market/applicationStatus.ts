import type { ApplicationStatus } from '@/lib/market-applications-api';

/**
 * Apariencia de los cuatro estados de una postulación, en un solo lugar.
 *
 * Estaba duplicada en `app/market-applications.tsx` (la vista del dueño del
 * aviso) y volvía a hacer falta en "Mis postulaciones" (M4, la vista del
 * postulante). Las dos pantallas muestran el MISMO estado de la MISMA fila: si
 * divergieran, `VISTA` sería "vista" de un lado y otra cosa del otro.
 */
export const APPLICATION_STATUS_LABEL: Record<ApplicationStatus, string> = {
  PENDIENTE: 'Pendiente',
  VISTA: 'Vista',
  ACEPTADA: 'Aceptada',
  RECHAZADA: 'Rechazada',
};

/** `bg` y `text` separados: los pills los combinan en dos nodos distintos. */
export const APPLICATION_STATUS_CLASS: Record<ApplicationStatus, { bg: string; text: string }> = {
  PENDIENTE: { bg: 'bg-warning-tertiary/20', text: 'text-warning-tertiary' },
  VISTA: { bg: 'bg-info-secondary/20', text: 'text-info-secondary' },
  ACEPTADA: { bg: 'bg-brand-primary/20', text: 'text-brand-primary' },
  RECHAZADA: { bg: 'bg-danger-error/20', text: 'text-danger-error' },
};

/**
 * Qué significa el estado **para el postulante**, que es el dato que M4 no
 * tenía. El estado suelto no alcanza: "Vista" sin explicación se lee como
 * "rechazada en silencio", y "Rechazada" sin contexto no distingue un rechazo
 * deliberado de la limpieza automática que dispara aceptar a otro (M5).
 */
export function getApplicationStatusHint(
  status: ApplicationStatus,
  postType: 'TEAM' | 'PLAYER',
): string {
  switch (status) {
    case 'PENDIENTE':
      return postType === 'TEAM'
        ? 'El equipo todavía no abrió la lista de postulantes.'
        : 'El jugador todavía no abrió la lista de postulantes.';
    case 'VISTA':
      return 'Ya vieron tu postulación. Falta que la respondan.';
    case 'ACEPTADA':
      return postType === 'TEAM'
        ? 'Te aceptaron. Confirmá el traspaso desde "Mis solicitudes" para entrar al plantel.'
        : 'Aceptaron a tu equipo. Coordiná el resto por el chat del Mercado.';
    case 'RECHAZADA':
      return 'No quedaste esta vez. También pasa cuando el aviso se cierra porque eligieron a otro.';
  }
}
