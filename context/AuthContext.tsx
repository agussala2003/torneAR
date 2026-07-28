import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Session, User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
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
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('auth_user_id', userId)
        .single();

      if (!error && data) {
        return data;
      }

      return null;
    } catch (e) {
      console.error('Error fetching profile', e);
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
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
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
    await supabase.auth.signOut();
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
