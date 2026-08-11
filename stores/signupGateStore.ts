import { create } from 'zustand';

interface SignupGateStore {
  /**
   * Mientras esté en `true`, el guard de `app/_layout.tsx` no redirige a
   * `/onboarding` aunque haya sesión y el perfil esté incompleto.
   */
  isHoldingOnboardingRedirect: boolean;
  holdOnboardingRedirect: () => void;
  releaseOnboardingRedirect: () => void;
}

/**
 * Retención de la redirección post-registro.
 *
 * La confirmación por email está desactivada en Supabase, así que `signUp`
 * devuelve una sesión activa en el acto. El guard reacciona a esa sesión y
 * manda a `/onboarding` de inmediato — por detrás del modal de bienvenida, que
 * se desmontaba junto con la pantalla de login antes de que el usuario llegara
 * a tocar «Aceptar» (auditoría E2E, módulo 1.1).
 *
 * Con esta retención la navegación pasa a ser **consecuencia** de cerrar el
 * modal y no algo que ocurre en paralelo. Sólo afecta a esa transición: si no
 * hay sesión (por ejemplo si algún día se reactiva la confirmación por email),
 * el guard sigue comportándose igual.
 */
export const useSignupGateStore = create<SignupGateStore>((set) => ({
  isHoldingOnboardingRedirect: false,
  holdOnboardingRedirect: () => set({ isHoldingOnboardingRedirect: true }),
  releaseOnboardingRedirect: () => set({ isHoldingOnboardingRedirect: false }),
}));
