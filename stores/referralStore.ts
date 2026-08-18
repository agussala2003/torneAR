import { create } from 'zustand';

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
}

export const useReferralStore = create<ReferralStore>((set, get) => ({
  pendingReferralUsername: null,

  setPendingReferralUsername: (username) => set({ pendingReferralUsername: username }),

  consumePendingReferralUsername: () => {
    const username = get().pendingReferralUsername;
    if (username) {
      set({ pendingReferralUsername: null });
    }
    return username;
  },
}));
