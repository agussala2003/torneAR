import { create } from 'zustand';
import { supabase } from '@/lib/supabase';
import { Logger } from '@/lib/logger';

export type UserTeam = {
  id: string;
  name: string;
  role: string;
};

interface TeamStore {
  activeTeamId: string | null;
  activeTeamName: string | null;
  myTeams: UserTeam[];
  isLoading: boolean;
  
  setActiveTeam: (id: string, name: string) => void;
  fetchMyTeams: (profileId: string) => Promise<void>;
  clearStore: () => void;
}

export const useTeamStore = create<TeamStore>((set, get) => ({
  activeTeamId: null,
  activeTeamName: null,
  myTeams: [],
  isLoading: false,

  setActiveTeam: (id, name) => set({ activeTeamId: id, activeTeamName: name }),

  fetchMyTeams: async (profileId: string) => {
    set({ isLoading: true });
    try {
      // Query team_members and join the teams table to get the names
      const { data, error } = await supabase
        .from('team_members')
        .select(`
          role,
          teams:team_id (
            id,
            name
          )
        `)
        .eq('profile_id', profileId)
        .order('joined_at', { ascending: true }); // Ordered so old teams come first just as a default strategy

      if (error) {
        throw error;
      }

      // Map Supabase response to our flat UserTeam object
      const formattedTeams: UserTeam[] = (data || [])
        .filter((row: any) => row.teams) // filter out invalid joins just in case
        .map((row: any) => {
          // Si por alguna razón la foreign key viene como un arreglo (dependiendo de 1:N relations en SB), tomamos el primero, pero debería ser objeto
          const teamData = Array.isArray(row.teams) ? row.teams[0] : row.teams;
          return {
            id: teamData.id,
            name: teamData.name,
            role: row.role,
          };
        });

      const currentTeams = get().myTeams;
      const currentActiveId = get().activeTeamId;
      const currentActiveName = get().activeTeamName;

      // Check if current active team is still valid (user hasn't left or been kicked)
      const isActiveTeamValid = currentActiveId && formattedTeams.some(t => t.id === currentActiveId);

      let newActiveId = currentActiveId;
      let newActiveName = currentActiveName;

      // Auto-select the first team if they belong to any but don't have a valid active selection
      if (!isActiveTeamValid && formattedTeams.length > 0) {
        newActiveId = formattedTeams[0].id;
        newActiveName = formattedTeams[0].name;
      } else if (formattedTeams.length === 0) {
        newActiveId = null;
        newActiveName = null;
      }

      /*
       * Estabilidad referencial: `formattedTeams` es un array nuevo en cada
       * llamada, aunque el usuario siga en los mismos equipos con los mismos
       * roles. Publicar esa referencia nueva invalidaba todo `useCallback` /
       * `useEffect` que tuviera `myTeams` en sus dependencias, lo que disparaba
       * recargas en cascada (y en Ranking llegaba a pisar los filtros elegidos
       * por el usuario). Si el contenido es logicamente identico conservamos el
       * array anterior: `Object.is(antes, despues)` sigue siendo true y los
       * consumidores no se enteran de un cambio que no existio.
       *
       * UserTeam es plano (id/name/role), asi que alcanza con comparar campo a
       * campo en orden — la query ya viene ordenada por `joined_at`.
       */
      const teamsAreEquivalent =
        currentTeams.length === formattedTeams.length &&
        currentTeams.every((team, index) => {
          const next = formattedTeams[index];
          return team.id === next.id && team.name === next.name && team.role === next.role;
        });

      // Nada cambio: no publicamos un estado nuevo mas alla de apagar el loader.
      if (teamsAreEquivalent && newActiveId === currentActiveId && newActiveName === currentActiveName) {
        set({ isLoading: false });
        return;
      }

      set({
        // Si solo cambio el equipo activo, mantenemos la referencia del plantel.
        myTeams: teamsAreEquivalent ? currentTeams : formattedTeams,
        activeTeamId: newActiveId,
        activeTeamName: newActiveName,
        isLoading: false,
      });
    } catch (err) {
      // El store queda con los equipos viejos (o vacío en la primera carga).
      // Vacío es indistinguible de "este usuario no tiene equipos": toda la app
      // se degrada a la vista de agente libre sin decir por qué.
      Logger.error('No se pudieron cargar los equipos del usuario', {
        scope: 'teamStore.fetchMyTeams',
        profileId,
        error: err,
      });
      set({ isLoading: false });
    }
  },

  clearStore: () => set({ activeTeamId: null, activeTeamName: null, myTeams: [], isLoading: false }),
}));
