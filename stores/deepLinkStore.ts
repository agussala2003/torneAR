import { create } from 'zustand';

interface DeepLinkStore {
  /**
   * URL cruda (`tornear://...`) que llegó mientras el usuario aún no estaba
   * autenticado o la app no se había hidratado. El guard de `app/_layout.tsx`
   * la consume una vez que la sesión + perfil están listos.
   */
  pendingDeepLink: string | null;

  setPendingDeepLink: (url: string | null) => void;

  /**
   * Devuelve la URL pendiente y la limpia del estado de forma atómica:
   * un único llamante puede consumirla, los siguientes reciben `null`.
   * Pensado para leerse fuera de React vía `useDeepLinkStore.getState()`.
   */
  consumePendingDeepLink: () => string | null;
}

export const useDeepLinkStore = create<DeepLinkStore>((set, get) => ({
  pendingDeepLink: null,

  setPendingDeepLink: (url) => set({ pendingDeepLink: url }),

  consumePendingDeepLink: () => {
    const url = get().pendingDeepLink;
    if (url) {
      set({ pendingDeepLink: null });
    }
    return url;
  },
}));
