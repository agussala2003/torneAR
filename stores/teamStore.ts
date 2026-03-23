import { create } from 'zustand';
import { supabase } from '@/lib/supabase';

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

      const currentActiveId = get().activeTeamId;
      
      // Check if current active team is still valid (user hasn't left or been kicked)
      const isActiveTeamValid = currentActiveId && formattedTeams.some(t => t.id === currentActiveId);
      
      let newActiveId = currentActiveId;
      let newActiveName = get().activeTeamName;

      // Auto-select the first team if they belong to any but don't have a valid active selection
      if (!isActiveTeamValid && formattedTeams.length > 0) {
        newActiveId = formattedTeams[0].id;
        newActiveName = formattedTeams[0].name;
      } else if (formattedTeams.length === 0) {
        newActiveId = null;
        newActiveName = null;
      }

      set({
        myTeams: formattedTeams,
        activeTeamId: newActiveId,
        activeTeamName: newActiveName,
        isLoading: false,
      });
    } catch (err) {
      console.error('Error fetching teams for store:', err);
      set({ isLoading: false });
    }
  },

  clearStore: () => set({ activeTeamId: null, activeTeamName: null, myTeams: [], isLoading: false }),
}));
