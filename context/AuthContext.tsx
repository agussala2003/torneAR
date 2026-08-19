import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Session, User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { Logger } from '@/lib/logger';
import { Database } from '../types/supabase';
import { useTeamStore } from '@/stores/teamStore';

type Profile = Database['public']['Tables']['profiles']['Row'];

type AuthContextType = {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  loading: boolean;
  /**
   * `true` una vez que leímos la sesión inicial de Supabase/SecureStore al
   * arrancar. A diferencia de `loading` (que oscila en cada cambio de auth y
   * durante el fetch del perfil), `hydrated` solo pasa a `true` una vez y no
   * vuelve atrás: es la señal para soltar el SplashScreen nativo.
   */
  hydrated: boolean;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType>({
  session: null,
  user: null,
  profile: null,
  loading: true,
  hydrated: false,
  signOut: async () => {},
  refreshProfile: async () => {},
});

export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [hydrated, setHydrated] = useState(false);
  const syncVersionRef = useRef(0);
  const authUserIdRef = useRef<string | null>(null);

  const fetchProfile = useCallback(async (userId: string) => {
    try {
      // `get_own_profile()`, no `.from('profiles').select('*')`: desde
      // 20260819100000_privacy_and_age_compliance, `date_of_birth` y
      // `expo_push_token` están bloqueadas por columna en la tabla base
      // (nadie puede leer el date_of_birth/token ajeno vía SELECT directo).
      // La RPC es SECURITY DEFINER y sólo devuelve la fila de
      // `auth.uid()` — mismo shape que el `SELECT *` que reemplaza, así
      // que el resto de la app (profile.date_of_birth, profile.expo_push_token,
      // etc.) no cambia.
      //
      // Sin fila para este usuario, la función devuelve NULL (no un error;
      // es el mismo caso "recién registrado, sin perfil todavía" que antes
      // cubría `maybeSingle`).
      const { data, error } = await supabase.rpc('get_own_profile');

      // Devolver null acá manda al usuario a /onboarding (ver app/_layout.tsx).
      // Un fallo de red y "este usuario todavía no completó su perfil" producen
      // la MISMA pantalla, así que sin log no hay forma de distinguir un
      // onboarding legítimo de una sesión que perdió su perfil.
      if (error) {
        Logger.error('No se pudo cargar el perfil del usuario autenticado', {
          scope: 'AuthContext.fetchProfile',
          authUserId: userId,
          error,
        });
        return null;
      }

      if (!data) {
        // Caso esperado, no un fallo: sesión válida sin fila en `profiles`.
        // Se loguea en `info` para poder separarlo del error de arriba cuando
        // alguien reporte "me tira siempre el onboarding".
        Logger.info('Sesión sin perfil: derivando a onboarding', {
          scope: 'AuthContext.fetchProfile',
          authUserId: userId,
        });
        return null;
      }

      return data;
    } catch (e) {
      Logger.error('Excepción cargando el perfil del usuario autenticado', {
        scope: 'AuthContext.fetchProfile',
        authUserId: userId,
        error: e,
      });
      return null;
    }
  }, []);

  /*
   * Lee el id del usuario del ref y no del estado `user`.
   *
   * Con `user?.id` como dependencia, `refreshProfile` cambiaba de identidad en
   * cada login/logout y contaminaba las deps de quien lo consumiera — por
   * ejemplo el `onSubmit` de app/profile-edit.tsx, que nunca llegaba a
   * estabilizarse. `authUserIdRef` ya se mantiene sincronizado en syncAuthState
   * con exactamente el mismo valor, asi que esta version es 100% estable.
   */
  const refreshProfile = useCallback(async () => {
    const userId = authUserIdRef.current;
    if (!userId) return;

    const nextProfile = await fetchProfile(userId);
    setProfile(nextProfile);
  }, [fetchProfile]);

  const syncAuthState = useCallback(async (nextSession: Session | null) => {
    const syncVersion = ++syncVersionRef.current;
    const previousUserId = authUserIdRef.current;
    const nextUserId = nextSession?.user?.id ?? null;

    if (!nextUserId || (previousUserId && previousUserId !== nextUserId)) {
      useTeamStore.getState().clearStore();
    }

    authUserIdRef.current = nextUserId;

    setSession(nextSession);
    setUser(nextSession?.user ?? null);

    if (!nextSession?.user) {
      if (syncVersion === syncVersionRef.current) {
        setProfile(null);
        setLoading(false);
        setHydrated(true);
      }
      return;
    }

    setLoading(true);
    const nextProfile = await fetchProfile(nextSession.user.id);

    if (syncVersion === syncVersionRef.current) {
      setProfile(nextProfile);
      setLoading(false);
      setHydrated(true);
    }
  }, [fetchProfile]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      void syncAuthState(session);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, nextSession) => {
      // Traza de sesión. Es el eje temporal contra el que se leen todos los
      // demás logs: un TOKEN_REFRESHED fallido o un SIGNED_OUT inesperado
      // explican de una la ráfaga de errores que viene inmediatamente después.
      Logger.info('Cambio de estado de autenticación', {
        scope: 'AuthContext',
        event,
        hasSession: nextSession !== null,
      });
      void syncAuthState(nextSession);
    });

    return () => {
      subscription.unsubscribe();
    };
    // `syncAuthState` es estable (useCallback sobre `fetchProfile`, que a su vez
    // no depende de nada), asi que la suscripcion sigue montandose una sola vez.
    // Declararla explicitamente satisface exhaustive-deps sin silenciar la regla.
  }, [syncAuthState]);

  const signOut = useCallback(async () => {
    const { error } = await supabase.auth.signOut();
    if (error) {
      // No se propaga a propósito: el usuario ya decidió salir y la UI local se
      // limpia igual por el onAuthStateChange. Pero si el token queda vivo del
      // lado del servidor, conviene que quede asentado.
      Logger.error('Fallo el cierre de sesión', { scope: 'AuthContext.signOut', error });
    }
  }, []);

  /*
   * Sin este useMemo, el objeto literal creaba una identidad nueva en cada render
   * del provider y React re-renderizaba TODO consumidor de useAuth() — mas de 20
   * archivos — aunque solo hubiera cambiado `loading`. Ahora el value solo cambia
   * cuando cambia alguno de los datos que expone; las tres funciones son estables.
   */
  const value = useMemo(
    () => ({ session, user, profile, loading, hydrated, signOut, refreshProfile }),
    [session, user, profile, loading, hydrated, signOut, refreshProfile],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
