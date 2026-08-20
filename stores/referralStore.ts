import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

/**
 * UTM de campaña capturados junto al `ref` (Fase 3 de Marketing & Growth).
 * Independiente de `pendingReferralUsername` a propósito: un link del
 * Content Factory trae los dos juntos, pero conceptualmente son cosas
 * distintas — uno es "quién te invitó" (social, puede no querer mostrarse),
 * el otro es "qué campaña te trajo" (interno, el usuario ni lo ve). Que el
 * usuario edite o borre el campo de código de invitación en el onboarding no
 * tiene por qué borrar también la atribución de marketing.
 */
export interface PendingUtm {
  source: string | null;
  medium: string | null;
  campaign: string | null;
}

interface ReferralStore {
  /**
   * Username crudo capturado de `tornear://login?ref=<username>` (ver
   * `lib/deep-linking.ts` + `app/login.tsx`). Se guarda como string y no se
   * resuelve a un id todavía: `profiles` no tiene grant para `anon`, así que
   * recién se puede resolver con sesión activa — durante el onboarding, no
   * antes (ver `lib/onboarding-data.ts`).
   */
  pendingReferralUsername: string | null;

  setPendingReferralUsername: (username: string | null) => void;

  /**
   * Devuelve el username pendiente y lo limpia del estado de forma atómica,
   * mismo criterio que `useDeepLinkStore.consumePendingDeepLink`: un solo
   * llamante lo consume, los siguientes reciben `null`.
   */
  consumePendingReferralUsername: () => string | null;

  /** UTM pendientes — ver el comentario de `PendingUtm`. */
  pendingUtm: PendingUtm | null;

  setPendingUtm: (utm: PendingUtm | null) => void;

  /** Mismo patrón atómico que `consumePendingReferralUsername`. */
  consumePendingUtm: () => PendingUtm | null;
}

/** Clave en AsyncStorage. Cambiarla descarta los referidos ya capturados. */
const STORAGE_KEY = 'tornear.referral';

/**
 * Store de referidos, persistido en disco.
 *
 * En memoria no alcanzaba: el recorrido real de una invitación es «toco el link
 * → me registro → completo el onboarding», y entre el registro y el final del
 * onboarding hay tres pasos de formulario. Cerrar la app ahí —o que el sistema
 * la mate por memoria, que en Android de gama baja pasa— borraba el username y
 * el referido se perdía en silencio: el capitán que trajo al jugador no sumaba
 * la referencia y nadie se enteraba.
 *
 * `partialize` deja fuera las funciones a propósito. `JSON.stringify` las
 * descarta igual, pero al rehidratar zustand mergea lo guardado sobre el estado
 * inicial: sin esta lista explícita, cualquier campo que se agregue más adelante
 * al store se persistiría por defecto sin que nadie lo haya decidido.
 *
 * La rehidratación de AsyncStorage es asíncrona. No hace falta esperarla: el
 * único lector es `consumePendingReferralUsername()`, que corre al enviar el
 * onboarding —tres pasos de formulario después del arranque— y para entonces
 * una lectura de una sola clave ya terminó hace rato.
 */
export const useReferralStore = create<ReferralStore>()(
  persist(
    (set, get) => ({
      pendingReferralUsername: null,

      setPendingReferralUsername: (username) => set({ pendingReferralUsername: username }),

      consumePendingReferralUsername: () => {
        const username = get().pendingReferralUsername;
        if (username) {
          // El `set` también escribe en AsyncStorage: el referido consumido no
          // puede sobrevivir a un reinicio o se volvería a aplicar en el próximo
          // onboarding de ese dispositivo.
          set({ pendingReferralUsername: null });
        }
        return username;
      },

      pendingUtm: null,

      setPendingUtm: (utm) => set({ pendingUtm: utm }),

      consumePendingUtm: () => {
        const utm = get().pendingUtm;
        if (utm) {
          set({ pendingUtm: null });
        }
        return utm;
      },
    }),
    {
      name: STORAGE_KEY,
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        pendingReferralUsername: state.pendingReferralUsername,
        pendingUtm: state.pendingUtm,
      }),
    },
  ),
);
