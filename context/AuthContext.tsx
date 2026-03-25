import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
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
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType>({
  session: null,
  user: null,
  profile: null,
  loading: true,
  signOut: async () => {},
  refreshProfile: async () => {},
});

export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const syncVersionRef = useRef(0);
  const authUserIdRef = useRef<string | null>(null);

  const fetchProfile = async (userId: string) => {
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
  };

  const refreshProfile = async () => {
    if (user?.id) {
      const nextProfile = await fetchProfile(user.id);
      setProfile(nextProfile);
    }
  };

  const syncAuthState = async (nextSession: Session | null) => {
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
      }
      return;
    }

    setLoading(true);
    const nextProfile = await fetchProfile(nextSession.user.id);

    if (syncVersion === syncVersionRef.current) {
      setProfile(nextProfile);
      setLoading(false);
    }
  };

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
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider value={{ session, user, profile, loading, signOut, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  );
}
