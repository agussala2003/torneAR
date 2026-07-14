export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.4"
  }
  public: {
    Tables: {
      badges: {
        Row: {
          criteria_description: string | null
          description: string | null
          entity_type: string
          icon_url: string | null
          id: string
          name: string
          slug: string
        }
        Insert: {
          criteria_description?: string | null
          description?: string | null
          entity_type?: string
          icon_url?: string | null
          id?: string
          name: string
          slug: string
        }
        Update: {
          criteria_description?: string | null
          description?: string | null
          entity_type?: string
          icon_url?: string | null
          id?: string
          name?: string
          slug?: string
        }
        Relationships: []
      }
      cancellation_requests: {
        Row: {
          created_at: string
          id: string
          is_late: boolean
          match_id: string
          notes: string | null
          reason: string
          requested_by_team_id: string
          status: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_late?: boolean
          match_id: string
          notes?: string | null
          reason: string
          requested_by_team_id: string
          status?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_late?: boolean
          match_id?: string
          notes?: string | null
          reason?: string
          requested_by_team_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "cancellation_requests_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cancellation_requests_requested_by_team_id_fkey"
            columns: ["requested_by_team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cancellation_requests_requested_by_team_id_fkey"
            columns: ["requested_by_team_id"]
            isOneToOne: false
            referencedRelation: "v_team_ranking"
            referencedColumns: ["id"]
          },
        ]
      }
      challenges: {
        Row: {
          created_at: string
          created_by: string
          from_team_id: string
          id: string
          match_type: Database["public"]["Enums"]["match_type"] | null
          status: Database["public"]["Enums"]["challenge_status"]
          to_team_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          from_team_id: string
          id?: string
          match_type?: Database["public"]["Enums"]["match_type"] | null
          status?: Database["public"]["Enums"]["challenge_status"]
          to_team_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          from_team_id?: string
          id?: string
          match_type?: Database["public"]["Enums"]["match_type"] | null
          status?: Database["public"]["Enums"]["challenge_status"]
          to_team_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "challenges_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "challenges_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "v_player_stats"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "challenges_from_team_id_fkey"
            columns: ["from_team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "challenges_from_team_id_fkey"
            columns: ["from_team_id"]
            isOneToOne: false
            referencedRelation: "v_team_ranking"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "challenges_to_team_id_fkey"
            columns: ["to_team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "challenges_to_team_id_fkey"
            columns: ["to_team_id"]
            isOneToOne: false
            referencedRelation: "v_team_ranking"
            referencedColumns: ["id"]
          },
        ]
      }
      conversation_reads: {
        Row: {
          conversation_id: string
          last_read_at: string
          profile_id: string
        }
        Insert: {
          conversation_id: string
          last_read_at?: string
          profile_id: string
        }
        Update: {
          conversation_id?: string
          last_read_at?: string
          profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversation_reads_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_reads_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_reads_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "v_player_stats"
            referencedColumns: ["profile_id"]
          },
        ]
      }
      conversations: {
        Row: {
          created_at: string
          id: string
          match_id: string | null
          player_id: string | null
          team_id: string | null
          type: Database["public"]["Enums"]["conversation_type"]
        }
        Insert: {
          created_at?: string
          id?: string
          match_id?: string | null
          player_id?: string | null
          team_id?: string | null
          type: Database["public"]["Enums"]["conversation_type"]
        }
        Update: {
          created_at?: string
          id?: string
          match_id?: string | null
          player_id?: string | null
          team_id?: string | null
          type?: Database["public"]["Enums"]["conversation_type"]
        }
        Relationships: [
          {
            foreignKeyName: "conversations_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "v_player_stats"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "conversations_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "v_team_ranking"
            referencedColumns: ["id"]
          },
        ]
      }
      elo_history: {
        Row: {
          created_at: string
          delta: number
          elo_after: number
          elo_before: number
          id: string
          match_id: string
          season_id: string
          team_id: string
        }
        Insert: {
          created_at?: string
          delta: number
          elo_after: number
          elo_before: number
          id?: string
          match_id: string
          season_id: string
          team_id: string
        }
        Update: {
          created_at?: string
          delta?: number
          elo_after?: number
          elo_before?: number
          id?: string
          match_id?: string
          season_id?: string
          team_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "elo_history_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "elo_history_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "seasons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "elo_history_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "elo_history_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "v_team_ranking"
            referencedColumns: ["id"]
          },
        ]
      }
      market_player_post_applications: {
        Row: {
          applicant_profile_id: string
          created_at: string
          id: string
          post_id: string
          status: string
          team_id: string
          updated_at: string
        }
        Insert: {
          applicant_profile_id: string
          created_at?: string
          id?: string
          post_id: string
          status?: string
          team_id: string
          updated_at?: string
        }
        Update: {
          applicant_profile_id?: string
          created_at?: string
          id?: string
          post_id?: string
          status?: string
          team_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "market_player_post_applications_applicant_profile_id_fkey"
            columns: ["applicant_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "market_player_post_applications_applicant_profile_id_fkey"
            columns: ["applicant_profile_id"]
            isOneToOne: false
            referencedRelation: "v_player_stats"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "market_player_post_applications_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "market_player_posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "market_player_post_applications_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "market_player_post_applications_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "v_team_ranking"
            referencedColumns: ["id"]
          },
        ]
      }
      market_player_posts: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          position: Database["public"]["Enums"]["player_position"]
          post_type: Database["public"]["Enums"]["market_post_type"]
          profile_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          position?: Database["public"]["Enums"]["player_position"]
          post_type: Database["public"]["Enums"]["market_post_type"]
          profile_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          position?: Database["public"]["Enums"]["player_position"]
          post_type?: Database["public"]["Enums"]["market_post_type"]
          profile_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "market_player_posts_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "market_player_posts_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "v_player_stats"
            referencedColumns: ["profile_id"]
          },
        ]
      }
      market_team_post_applications: {
        Row: {
          created_at: string
          id: string
          post_id: string
          profile_id: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          post_id: string
          profile_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          post_id?: string
          profile_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "market_team_post_applications_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "market_team_posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "market_team_post_applications_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "market_team_post_applications_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "v_player_stats"
            referencedColumns: ["profile_id"]
          },
        ]
      }
      market_team_posts: {
        Row: {
          complex: string | null
          created_at: string
          created_by: string
          description: string | null
          id: string
          is_active: boolean
          match_date: string | null
          match_time: string | null
          pitch_type: string | null
          position_wanted: Database["public"]["Enums"]["player_position"]
          team_id: string
          updated_at: string
          zone: string | null
        }
        Insert: {
          complex?: string | null
          created_at?: string
          created_by: string
          description?: string | null
          id?: string
          is_active?: boolean
          match_date?: string | null
          match_time?: string | null
          pitch_type?: string | null
          position_wanted?: Database["public"]["Enums"]["player_position"]
          team_id: string
          updated_at?: string
          zone?: string | null
        }
        Update: {
          complex?: string | null
          created_at?: string
          created_by?: string
          description?: string | null
          id?: string
          is_active?: boolean
          match_date?: string | null
          match_time?: string | null
          pitch_type?: string | null
          position_wanted?: Database["public"]["Enums"]["player_position"]
          team_id?: string
          updated_at?: string
          zone?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "market_team_posts_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "market_team_posts_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "v_player_stats"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "market_team_posts_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "market_team_posts_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "v_team_ranking"
            referencedColumns: ["id"]
          },
        ]
      }
      match_dispute_votes: {
        Row: {
          created_at: string
          id: string
          match_id: string
          profile_id: string
          voted_team_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          match_id: string
          profile_id: string
          voted_team_id: string
        }
        Update: {
          created_at?: string
          id?: string
          match_id?: string
          profile_id?: string
          voted_team_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "match_dispute_votes_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "match_dispute_votes_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "match_dispute_votes_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "v_player_stats"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "match_dispute_votes_voted_team_id_fkey"
            columns: ["voted_team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "match_dispute_votes_voted_team_id_fkey"
            columns: ["voted_team_id"]
            isOneToOne: false
            referencedRelation: "v_team_ranking"
            referencedColumns: ["id"]
          },
        ]
      }
      match_participants: {
        Row: {
          checkin_at: string | null
          checkin_lat: number | null
          checkin_lng: number | null
          did_checkin: boolean
          id: string
          is_guest: boolean
          is_result_loader: boolean
          match_id: string
          profile_id: string
          team_id: string
        }
        Insert: {
          checkin_at?: string | null
          checkin_lat?: number | null
          checkin_lng?: number | null
          did_checkin?: boolean
          id?: string
          is_guest?: boolean
          is_result_loader?: boolean
          match_id: string
          profile_id: string
          team_id: string
        }
        Update: {
          checkin_at?: string | null
          checkin_lat?: number | null
          checkin_lng?: number | null
          did_checkin?: boolean
          id?: string
          is_guest?: boolean
          is_result_loader?: boolean
          match_id?: string
          profile_id?: string
          team_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "match_participants_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "match_participants_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "match_participants_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "v_player_stats"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "match_participants_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "match_participants_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "v_team_ranking"
            referencedColumns: ["id"]
          },
        ]
      }
      match_proposals: {
        Row: {
          created_at: string
          duration_minutes: number
          format: Database["public"]["Enums"]["team_format"]
          from_team_id: string
          id: string
          location: string | null
          location_lat: number | null
          location_lng: number | null
          match_id: string
          match_type: Database["public"]["Enums"]["match_type"]
          proposed_by: string
          scheduled_at: string
          signal_amount: number | null
          status: Database["public"]["Enums"]["proposal_status"]
          total_cost: number | null
          venue_id: string | null
        }
        Insert: {
          created_at?: string
          duration_minutes: number
          format: Database["public"]["Enums"]["team_format"]
          from_team_id: string
          id?: string
          location?: string | null
          location_lat?: number | null
          location_lng?: number | null
          match_id: string
          match_type: Database["public"]["Enums"]["match_type"]
          proposed_by: string
          scheduled_at: string
          signal_amount?: number | null
          status?: Database["public"]["Enums"]["proposal_status"]
          total_cost?: number | null
          venue_id?: string | null
        }
        Update: {
          created_at?: string
          duration_minutes?: number
          format?: Database["public"]["Enums"]["team_format"]
          from_team_id?: string
          id?: string
          location?: string | null
          location_lat?: number | null
          location_lng?: number | null
          match_id?: string
          match_type?: Database["public"]["Enums"]["match_type"]
          proposed_by?: string
          scheduled_at?: string
          signal_amount?: number | null
          status?: Database["public"]["Enums"]["proposal_status"]
          total_cost?: number | null
          venue_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "match_proposals_from_team_id_fkey"
            columns: ["from_team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "match_proposals_from_team_id_fkey"
            columns: ["from_team_id"]
            isOneToOne: false
            referencedRelation: "v_team_ranking"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "match_proposals_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "match_proposals_proposed_by_fkey"
            columns: ["proposed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "match_proposals_proposed_by_fkey"
            columns: ["proposed_by"]
            isOneToOne: false
            referencedRelation: "v_player_stats"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "match_proposals_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "v_venues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "match_proposals_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      match_results: {
        Row: {
          goals_against: number
          goals_scored: number
          id: string
          match_id: string
          mvp_id: string | null
          scorers: Json
          status: Database["public"]["Enums"]["result_status"]
          submitted_at: string
          submitted_by: string
          team_id: string
        }
        Insert: {
          goals_against: number
          goals_scored: number
          id?: string
          match_id: string
          mvp_id?: string | null
          scorers?: Json
          status?: Database["public"]["Enums"]["result_status"]
          submitted_at?: string
          submitted_by: string
          team_id: string
        }
        Update: {
          goals_against?: number
          goals_scored?: number
          id?: string
          match_id?: string
          mvp_id?: string | null
          scorers?: Json
          status?: Database["public"]["Enums"]["result_status"]
          submitted_at?: string
          submitted_by?: string
          team_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "match_results_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "match_results_mvp_id_fkey"
            columns: ["mvp_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "match_results_mvp_id_fkey"
            columns: ["mvp_id"]
            isOneToOne: false
            referencedRelation: "v_player_stats"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "match_results_submitted_by_fkey"
            columns: ["submitted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "match_results_submitted_by_fkey"
            columns: ["submitted_by"]
            isOneToOne: false
            referencedRelation: "v_player_stats"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "match_results_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "match_results_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "v_team_ranking"
            referencedColumns: ["id"]
          },
        ]
      }
      matches: {
        Row: {
          challenge_id: string | null
          checkin_team_a_at: string | null
          checkin_team_b_at: string | null
          created_at: string
          duration_minutes: number | null
          finished_at: string | null
          format: Database["public"]["Enums"]["team_format"] | null
          id: string
          location: string | null
          location_lat: number | null
          location_lng: number | null
          match_type: Database["public"]["Enums"]["match_type"]
          reminder_24h_sent_at: string | null
          scheduled_at: string | null
          season_id: string | null
          signal_amount: number | null
          started_at: string | null
          status: Database["public"]["Enums"]["match_status"]
          team_a_id: string
          team_b_id: string
          total_cost: number | null
          unique_code: string | null
          updated_at: string
          venue_id: string | null
        }
        Insert: {
          challenge_id?: string | null
          checkin_team_a_at?: string | null
          checkin_team_b_at?: string | null
          created_at?: string
          duration_minutes?: number | null
          finished_at?: string | null
          format?: Database["public"]["Enums"]["team_format"] | null
          id?: string
          location?: string | null
          location_lat?: number | null
          location_lng?: number | null
          match_type?: Database["public"]["Enums"]["match_type"]
          reminder_24h_sent_at?: string | null
          scheduled_at?: string | null
          season_id?: string | null
          signal_amount?: number | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["match_status"]
          team_a_id: string
          team_b_id: string
          total_cost?: number | null
          unique_code?: string | null
          updated_at?: string
          venue_id?: string | null
        }
        Update: {
          challenge_id?: string | null
          checkin_team_a_at?: string | null
          checkin_team_b_at?: string | null
          created_at?: string
          duration_minutes?: number | null
          finished_at?: string | null
          format?: Database["public"]["Enums"]["team_format"] | null
          id?: string
          location?: string | null
          location_lat?: number | null
          location_lng?: number | null
          match_type?: Database["public"]["Enums"]["match_type"]
          reminder_24h_sent_at?: string | null
          scheduled_at?: string | null
          season_id?: string | null
          signal_amount?: number | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["match_status"]
          team_a_id?: string
          team_b_id?: string
          total_cost?: number | null
          unique_code?: string | null
          updated_at?: string
          venue_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "matches_challenge_id_fkey"
            columns: ["challenge_id"]
            isOneToOne: false
            referencedRelation: "challenges"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "seasons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_team_a_id_fkey"
            columns: ["team_a_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_team_a_id_fkey"
            columns: ["team_a_id"]
            isOneToOne: false
            referencedRelation: "v_team_ranking"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_team_b_id_fkey"
            columns: ["team_b_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_team_b_id_fkey"
            columns: ["team_b_id"]
            isOneToOne: false
            referencedRelation: "v_team_ranking"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "v_venues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          content: string
          conversation_id: string
          created_at: string
          id: string
          is_read: boolean
          message_type: string
          sender_profile_id: string
          sender_team_id: string | null
        }
        Insert: {
          content: string
          conversation_id: string
          created_at?: string
          id?: string
          is_read?: boolean
          message_type?: string
          sender_profile_id: string
          sender_team_id?: string | null
        }
        Update: {
          content?: string
          conversation_id?: string
          created_at?: string
          id?: string
          is_read?: boolean
          message_type?: string
          sender_profile_id?: string
          sender_team_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_sender_profile_id_fkey"
            columns: ["sender_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_sender_profile_id_fkey"
            columns: ["sender_profile_id"]
            isOneToOne: false
            referencedRelation: "v_player_stats"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "messages_sender_team_id_fkey"
            columns: ["sender_team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_sender_team_id_fkey"
            columns: ["sender_team_id"]
            isOneToOne: false
            referencedRelation: "v_team_ranking"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string | null
          created_at: string
          data: Json
          id: string
          is_read: boolean
          profile_id: string
          pushed_at: string | null
          title: string
          type: Database["public"]["Enums"]["notification_type"]
        }
        Insert: {
          body?: string | null
          created_at?: string
          data?: Json
          id?: string
          is_read?: boolean
          profile_id: string
          pushed_at?: string | null
          title: string
          type: Database["public"]["Enums"]["notification_type"]
        }
        Update: {
          body?: string | null
          created_at?: string
          data?: Json
          id?: string
          is_read?: boolean
          profile_id?: string
          pushed_at?: string | null
          title?: string
          type?: Database["public"]["Enums"]["notification_type"]
        }
        Relationships: [
          {
            foreignKeyName: "notifications_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "v_player_stats"
            referencedColumns: ["profile_id"]
          },
        ]
      }
      profile_badges: {
        Row: {
          badge_id: string
          earned_at: string
          id: string
          profile_id: string
        }
        Insert: {
          badge_id: string
          earned_at?: string
          id?: string
          profile_id: string
        }
        Update: {
          badge_id?: string
          earned_at?: string
          id?: string
          profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "profile_badges_badge_id_fkey"
            columns: ["badge_id"]
            isOneToOne: false
            referencedRelation: "badges"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profile_badges_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profile_badges_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "v_player_stats"
            referencedColumns: ["profile_id"]
          },
        ]
      }
      profiles: {
        Row: {
          auth_user_id: string
          avatar_url: string | null
          created_at: string
          date_of_birth: string | null
          expo_push_token: string | null
          favorite_team: string | null
          full_name: string
          gender: string | null
          id: string
          is_admin: boolean
          preferred_position: Database["public"]["Enums"]["player_position"]
          strong_foot: string | null
          updated_at: string
          username: string
          zone: string | null
        }
        Insert: {
          auth_user_id: string
          avatar_url?: string | null
          created_at?: string
          date_of_birth?: string | null
          expo_push_token?: string | null
          favorite_team?: string | null
          full_name: string
          gender?: string | null
          id?: string
          is_admin?: boolean
          preferred_position?: Database["public"]["Enums"]["player_position"]
          strong_foot?: string | null
          updated_at?: string
          username: string
          zone?: string | null
        }
        Update: {
          auth_user_id?: string
          avatar_url?: string | null
          created_at?: string
          date_of_birth?: string | null
          expo_push_token?: string | null
          favorite_team?: string | null
          full_name?: string
          gender?: string | null
          id?: string
          is_admin?: boolean
          preferred_position?: Database["public"]["Enums"]["player_position"]
          strong_foot?: string | null
          updated_at?: string
          username?: string
          zone?: string | null
        }
        Relationships: []
      }
      result_dispute_votes: {
        Row: {
          created_at: string
          id: string
          match_id: string
          voted_for_team: string
          voter_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          match_id: string
          voted_for_team: string
          voter_id: string
        }
        Update: {
          created_at?: string
          id?: string
          match_id?: string
          voted_for_team?: string
          voter_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "result_dispute_votes_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "result_dispute_votes_voted_for_team_fkey"
            columns: ["voted_for_team"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "result_dispute_votes_voted_for_team_fkey"
            columns: ["voted_for_team"]
            isOneToOne: false
            referencedRelation: "v_team_ranking"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "result_dispute_votes_voter_id_fkey"
            columns: ["voter_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "result_dispute_votes_voter_id_fkey"
            columns: ["voter_id"]
            isOneToOne: false
            referencedRelation: "v_player_stats"
            referencedColumns: ["profile_id"]
          },
        ]
      }
      seasons: {
        Row: {
          created_at: string
          ends_at: string
          id: string
          is_active: boolean
          name: string
          slug: string
          starts_at: string
        }
        Insert: {
          created_at?: string
          ends_at: string
          id?: string
          is_active?: boolean
          name: string
          slug: string
          starts_at: string
        }
        Update: {
          created_at?: string
          ends_at?: string
          id?: string
          is_active?: boolean
          name?: string
          slug?: string
          starts_at?: string
        }
        Relationships: []
      }
      spatial_ref_sys: {
        Row: {
          auth_name: string | null
          auth_srid: number | null
          proj4text: string | null
          srid: number
          srtext: string | null
        }
        Insert: {
          auth_name?: string | null
          auth_srid?: number | null
          proj4text?: string | null
          srid: number
          srtext?: string | null
        }
        Update: {
          auth_name?: string | null
          auth_srid?: number | null
          proj4text?: string | null
          srid?: number
          srtext?: string | null
        }
        Relationships: []
      }
      team_join_requests: {
        Row: {
          created_at: string
          id: string
          profile_id: string
          status: Database["public"]["Enums"]["join_request_status"]
          team_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          profile_id: string
          status?: Database["public"]["Enums"]["join_request_status"]
          team_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          profile_id?: string
          status?: Database["public"]["Enums"]["join_request_status"]
          team_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_join_requests_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_join_requests_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "v_player_stats"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "team_join_requests_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_join_requests_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "v_team_ranking"
            referencedColumns: ["id"]
          },
        ]
      }
      team_members: {
        Row: {
          id: string
          joined_at: string
          profile_id: string
          role: Database["public"]["Enums"]["team_role"]
          team_id: string
        }
        Insert: {
          id?: string
          joined_at?: string
          profile_id: string
          role?: Database["public"]["Enums"]["team_role"]
          team_id: string
        }
        Update: {
          id?: string
          joined_at?: string
          profile_id?: string
          role?: Database["public"]["Enums"]["team_role"]
          team_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_members_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_members_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "v_player_stats"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "team_members_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_members_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "v_team_ranking"
            referencedColumns: ["id"]
          },
        ]
      }
      teams: {
        Row: {
          category: Database["public"]["Enums"]["team_category"]
          created_at: string
          elo_rating: number
          fair_play_score: number
          id: string
          in_ranking: boolean
          invite_code: string
          matches_played: number
          name: string
          preferred_format: Database["public"]["Enums"]["team_format"]
          season_draws: number
          season_goals_against: number
          season_goals_for: number
          season_losses: number
          season_wins: number
          shield_url: string | null
          updated_at: string
          zone: string
        }
        Insert: {
          category: Database["public"]["Enums"]["team_category"]
          created_at?: string
          elo_rating?: number
          fair_play_score?: number
          id?: string
          in_ranking?: boolean
          invite_code?: string
          matches_played?: number
          name: string
          preferred_format: Database["public"]["Enums"]["team_format"]
          season_draws?: number
          season_goals_against?: number
          season_goals_for?: number
          season_losses?: number
          season_wins?: number
          shield_url?: string | null
          updated_at?: string
          zone: string
        }
        Update: {
          category?: Database["public"]["Enums"]["team_category"]
          created_at?: string
          elo_rating?: number
          fair_play_score?: number
          id?: string
          in_ranking?: boolean
          invite_code?: string
          matches_played?: number
          name?: string
          preferred_format?: Database["public"]["Enums"]["team_format"]
          season_draws?: number
          season_goals_against?: number
          season_goals_for?: number
          season_losses?: number
          season_wins?: number
          shield_url?: string | null
          updated_at?: string
          zone?: string
        }
        Relationships: []
      }
      venues: {
        Row: {
          address: string | null
          created_at: string
          formats: Database["public"]["Enums"]["team_format"][]
          id: string
          is_active: boolean
          lat: number
          lng: number
          name: string
          phone: string | null
          updated_at: string
          zone_id: string | null
        }
        Insert: {
          address?: string | null
          created_at?: string
          formats?: Database["public"]["Enums"]["team_format"][]
          id?: string
          is_active?: boolean
          lat: number
          lng: number
          name: string
          phone?: string | null
          updated_at?: string
          zone_id?: string | null
        }
        Update: {
          address?: string | null
          created_at?: string
          formats?: Database["public"]["Enums"]["team_format"][]
          id?: string
          is_active?: boolean
          lat?: number
          lng?: number
          name?: string
          phone?: string | null
          updated_at?: string
          zone_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "venues_zone_id_fkey"
            columns: ["zone_id"]
            isOneToOne: false
            referencedRelation: "v_venues"
            referencedColumns: ["zone_id"]
          },
          {
            foreignKeyName: "venues_zone_id_fkey"
            columns: ["zone_id"]
            isOneToOne: false
            referencedRelation: "zones"
            referencedColumns: ["id"]
          },
        ]
      }
      wo_claims: {
        Row: {
          admin_notes: string | null
          claimed_by: string
          claiming_team_id: string
          created_at: string
          id: string
          match_id: string
          mvp_id: string | null
          photo_url: string
          reason: string | null
          resolved_at: string | null
          resolved_by: string | null
          scorers: Json
          status: Database["public"]["Enums"]["wo_status"]
        }
        Insert: {
          admin_notes?: string | null
          claimed_by: string
          claiming_team_id: string
          created_at?: string
          id?: string
          match_id: string
          mvp_id?: string | null
          photo_url: string
          reason?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          scorers?: Json
          status?: Database["public"]["Enums"]["wo_status"]
        }
        Update: {
          admin_notes?: string | null
          claimed_by?: string
          claiming_team_id?: string
          created_at?: string
          id?: string
          match_id?: string
          mvp_id?: string | null
          photo_url?: string
          reason?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          scorers?: Json
          status?: Database["public"]["Enums"]["wo_status"]
        }
        Relationships: [
          {
            foreignKeyName: "wo_claims_claimed_by_fkey"
            columns: ["claimed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wo_claims_claimed_by_fkey"
            columns: ["claimed_by"]
            isOneToOne: false
            referencedRelation: "v_player_stats"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "wo_claims_claiming_team_id_fkey"
            columns: ["claiming_team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wo_claims_claiming_team_id_fkey"
            columns: ["claiming_team_id"]
            isOneToOne: false
            referencedRelation: "v_team_ranking"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wo_claims_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: true
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wo_claims_mvp_id_fkey"
            columns: ["mvp_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wo_claims_mvp_id_fkey"
            columns: ["mvp_id"]
            isOneToOne: false
            referencedRelation: "v_player_stats"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "wo_claims_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wo_claims_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "v_player_stats"
            referencedColumns: ["profile_id"]
          },
        ]
      }
      zones: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          name: string
          slug: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          slug: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          slug?: string
        }
        Relationships: []
      }
    }
    Views: {
      geography_columns: {
        Row: {
          coord_dimension: number | null
          f_geography_column: unknown
          f_table_catalog: unknown
          f_table_name: unknown
          f_table_schema: unknown
          srid: number | null
          type: string | null
        }
        Relationships: []
      }
      geometry_columns: {
        Row: {
          coord_dimension: number | null
          f_geometry_column: unknown
          f_table_catalog: string | null
          f_table_name: unknown
          f_table_schema: unknown
          srid: number | null
          type: string | null
        }
        Insert: {
          coord_dimension?: number | null
          f_geometry_column?: unknown
          f_table_catalog?: string | null
          f_table_name?: unknown
          f_table_schema?: unknown
          srid?: number | null
          type?: string | null
        }
        Update: {
          coord_dimension?: number | null
          f_geometry_column?: unknown
          f_table_catalog?: string | null
          f_table_name?: unknown
          f_table_schema?: unknown
          srid?: number | null
          type?: string | null
        }
        Relationships: []
      }
      v_player_stats: {
        Row: {
          avatar_url: string | null
          full_name: string | null
          matches_played: number | null
          profile_id: string | null
          total_goals: number | null
          total_mvps: number | null
          total_wins: number | null
          username: string | null
        }
        Relationships: []
      }
      v_team_ranking: {
        Row: {
          category: Database["public"]["Enums"]["team_category"] | null
          draws: number | null
          elo_rating: number | null
          fair_play_score: number | null
          goal_diff: number | null
          goals_against: number | null
          goals_for: number | null
          id: string | null
          in_ranking: boolean | null
          losses: number | null
          name: string | null
          points: number | null
          preferred_format: Database["public"]["Enums"]["team_format"] | null
          shield_url: string | null
          wins: number | null
          zone: string | null
          zone_rank: number | null
        }
        Relationships: []
      }
      v_venues: {
        Row: {
          address: string | null
          formats: Database["public"]["Enums"]["team_format"][] | null
          id: string | null
          is_active: boolean | null
          lat: number | null
          lng: number | null
          name: string | null
          phone: string | null
          zone_id: string | null
          zone_name: string | null
          zone_slug: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      _postgis_deprecate: {
        Args: { newname: string; oldname: string; version: string }
        Returns: undefined
      }
      _postgis_index_extent: {
        Args: { col: string; tbl: unknown }
        Returns: unknown
      }
      _postgis_pgsql_version: { Args: never; Returns: string }
      _postgis_scripts_pgsql_version: { Args: never; Returns: string }
      _postgis_selectivity: {
        Args: { att_name: string; geom: unknown; mode?: string; tbl: unknown }
        Returns: number
      }
      _postgis_stats: {
        Args: { ""?: string; att_name: string; tbl: unknown }
        Returns: string
      }
      _st_3dintersects: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_contains: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_containsproperly: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_coveredby:
        | { Args: { geog1: unknown; geog2: unknown }; Returns: boolean }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      _st_covers:
        | { Args: { geog1: unknown; geog2: unknown }; Returns: boolean }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      _st_crosses: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_dwithin: {
        Args: {
          geog1: unknown
          geog2: unknown
          tolerance: number
          use_spheroid?: boolean
        }
        Returns: boolean
      }
      _st_equals: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      _st_intersects: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_linecrossingdirection: {
        Args: { line1: unknown; line2: unknown }
        Returns: number
      }
      _st_longestline: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      _st_maxdistance: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      _st_orderingequals: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_overlaps: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_sortablehash: { Args: { geom: unknown }; Returns: number }
      _st_touches: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_voronoi: {
        Args: {
          clip?: unknown
          g1: unknown
          return_polygons?: boolean
          tolerance?: number
        }
        Returns: unknown
      }
      _st_within: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      accept_challenge: { Args: { p_challenge_id: string }; Returns: Json }
      addauth: { Args: { "": string }; Returns: boolean }
      addgeometrycolumn:
        | {
            Args: {
              catalog_name: string
              column_name: string
              new_dim: number
              new_srid_in: number
              new_type: string
              schema_name: string
              table_name: string
              use_typmod?: boolean
            }
            Returns: string
          }
        | {
            Args: {
              column_name: string
              new_dim: number
              new_srid: number
              new_type: string
              schema_name: string
              table_name: string
              use_typmod?: boolean
            }
            Returns: string
          }
        | {
            Args: {
              column_name: string
              new_dim: number
              new_srid: number
              new_type: string
              table_name: string
              use_typmod?: boolean
            }
            Returns: string
          }
      apply_match_outcome: {
        Args: {
          p_at?: string
          p_match: Database["public"]["Tables"]["matches"]["Row"]
        }
        Returns: undefined
      }
      calculate_elo_delta: {
        Args: { loser_elo: number; winner_elo: number }
        Returns: number
      }
      checkin_team: {
        Args: {
          p_lat?: number
          p_lng?: number
          p_match_id: string
          p_team_id: string
        }
        Returns: undefined
      }
      claim_wo: {
        Args: {
          p_match_id: string
          p_mvp_id?: string
          p_photo_url: string
          p_reason: string
          p_scorers?: Json
          p_team_id: string
        }
        Returns: string
      }
      close_season: { Args: { p_season_id: string }; Returns: undefined }
      confirm_match_proposal: {
        Args: { p_match_id: string; p_proposal_id: string }
        Returns: undefined
      }
      deactivate_expired_market_posts: { Args: never; Returns: undefined }
      disablelongtransactions: { Args: never; Returns: string }
      dropgeometrycolumn:
        | {
            Args: {
              catalog_name: string
              column_name: string
              schema_name: string
              table_name: string
            }
            Returns: string
          }
        | {
            Args: {
              column_name: string
              schema_name: string
              table_name: string
            }
            Returns: string
          }
        | { Args: { column_name: string; table_name: string }; Returns: string }
      dropgeometrytable:
        | {
            Args: {
              catalog_name: string
              schema_name: string
              table_name: string
            }
            Returns: string
          }
        | { Args: { schema_name: string; table_name: string }; Returns: string }
        | { Args: { table_name: string }; Returns: string }
      enablelongtransactions: { Args: never; Returns: string }
      enqueue_match_reminders: { Args: never; Returns: undefined }
      equals: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      geometry: { Args: { "": string }; Returns: unknown }
      geometry_above: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_below: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_cmp: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      geometry_contained_3d: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_contains: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_contains_3d: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_distance_box: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      geometry_distance_centroid: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      geometry_eq: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_ge: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_gt: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_le: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_left: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_lt: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_overabove: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_overbelow: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_overlaps: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_overlaps_3d: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_overleft: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_overright: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_right: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_same: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_same_3d: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_within: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geomfromewkt: { Args: { "": string }; Returns: unknown }
      get_market_inbox: {
        Args: { p_profile_id: string }
        Returns: {
          created_at: string
          id: string
          last_msg_at: string
          last_msg_content: string
          last_msg_sender: string
          last_read_at: string
          player_avatar: string
          player_full_name: string
          player_id: string
          team_id: string
          team_name: string
          team_shield: string
          type: string
        }[]
      }
      get_match_detail: {
        Args: { p_match_id: string; p_team_id: string }
        Returns: Json
      }
      get_my_matches: {
        Args: { p_team_id: string }
        Returns: {
          checkin_team_a_at: string
          checkin_team_b_at: string
          finished_at: string
          format: Database["public"]["Enums"]["team_format"]
          has_pending_cancellation: boolean
          id: string
          location: string
          match_type: Database["public"]["Enums"]["match_type"]
          proposal_format: Database["public"]["Enums"]["team_format"]
          proposal_from_team_id: string
          proposal_id: string
          proposal_location: string
          proposal_scheduled_at: string
          proposal_status: Database["public"]["Enums"]["proposal_status"]
          result_team_a: number
          result_team_b: number
          scheduled_at: string
          signal_amount: number
          started_at: string
          status: Database["public"]["Enums"]["match_status"]
          team_a_elo: number
          team_a_id: string
          team_a_name: string
          team_a_shield_url: string
          team_b_elo: number
          team_b_id: string
          team_b_name: string
          team_b_shield_url: string
          total_cost: number
          unique_code: string
          venue_id: string
          venue_name: string
        }[]
      }
      get_nearest_venues: {
        Args: { p_lat: number; p_limit?: number; p_lng: number }
        Returns: {
          address: string
          distance_km: number
          formats: Database["public"]["Enums"]["team_format"][]
          id: string
          lat: number
          lng: number
          name: string
          phone: string
          zone_id: string
        }[]
      }
      get_pending_wo_claims: {
        Args: never
        Returns: {
          claim_id: string
          claiming_team_id: string
          claiming_team_name: string
          created_at: string
          match_id: string
          mvp_id: string
          mvp_name: string
          opponent_team_name: string
          photo_url: string
          reason: string
          scheduled_at: string
          scorers: Json
        }[]
      }
      get_player_badges: {
        Args: { p_profile_id: string }
        Returns: {
          criteria_description: string
          entity_type: string
          icon_url: string
          id: string
          is_earned: boolean
          name: string
          slug: string
        }[]
      }
      get_player_leaderboard: {
        Args: { p_season_id?: string; p_stat: string; p_zone?: string }
        Returns: {
          avatar_url: string
          full_name: string
          profile_id: string
          rank_position: number
          team_id: string
          team_name: string
          username: string
          value: number
          zone: string
        }[]
      }
      get_team_badges: {
        Args: { p_team_id: string }
        Returns: {
          criteria_description: string
          entity_type: string
          icon_url: string
          id: string
          is_earned: boolean
          name: string
          slug: string
        }[]
      }
      get_team_challenges_inbox: {
        Args: { p_team_id: string }
        Returns: {
          challenge_id: string
          created_at: string
          creator_name: string
          direction: string
          match_type: Database["public"]["Enums"]["match_type"]
          opponent_elo: number
          opponent_shield_url: string
          opponent_team_id: string
          opponent_team_name: string
          status: string
        }[]
      }
      get_team_h2h: {
        Args: { p_team_a_id: string; p_team_b_id: string }
        Returns: {
          match_id: string
          match_type: Database["public"]["Enums"]["match_type"]
          scheduled_at: string
          status: Database["public"]["Enums"]["match_status"]
          team_a_goals: number
          team_a_id: string
          team_a_name: string
          team_b_goals: number
          team_b_id: string
          team_b_name: string
        }[]
      }
      get_team_ranking: {
        Args: {
          p_category?: Database["public"]["Enums"]["team_category"]
          p_format?: Database["public"]["Enums"]["team_format"]
          p_zone?: string
        }
        Returns: {
          category: Database["public"]["Enums"]["team_category"]
          elo_rating: number
          fair_play_score: number
          matches_played: number
          preferred_format: Database["public"]["Enums"]["team_format"]
          rank_position: number
          season_draws: number
          season_losses: number
          season_wins: number
          shield_url: string
          team_id: string
          team_name: string
          zone: string
        }[]
      }
      get_unread_market_chat_count: {
        Args: { p_profile_id: string }
        Returns: number
      }
      gettransactionid: { Args: never; Returns: unknown }
      is_ranking_match_allowed: {
        Args: { p_season_id: string; p_team_a_id: string; p_team_b_id: string }
        Returns: boolean
      }
      join_match_as_guest: {
        Args: { p_team_side: string; p_unique_code: string }
        Returns: Json
      }
      longtransactionsenabled: { Args: never; Returns: boolean }
      populate_geometry_columns:
        | { Args: { tbl_oid: unknown; use_typmod?: boolean }; Returns: number }
        | { Args: { use_typmod?: boolean }; Returns: string }
      postgis_constraint_dims: {
        Args: { geomcolumn: string; geomschema: string; geomtable: string }
        Returns: number
      }
      postgis_constraint_srid: {
        Args: { geomcolumn: string; geomschema: string; geomtable: string }
        Returns: number
      }
      postgis_constraint_type: {
        Args: { geomcolumn: string; geomschema: string; geomtable: string }
        Returns: string
      }
      postgis_extensions_upgrade: { Args: never; Returns: string }
      postgis_full_version: { Args: never; Returns: string }
      postgis_geos_version: { Args: never; Returns: string }
      postgis_lib_build_date: { Args: never; Returns: string }
      postgis_lib_revision: { Args: never; Returns: string }
      postgis_lib_version: { Args: never; Returns: string }
      postgis_libjson_version: { Args: never; Returns: string }
      postgis_liblwgeom_version: { Args: never; Returns: string }
      postgis_libprotobuf_version: { Args: never; Returns: string }
      postgis_libxml_version: { Args: never; Returns: string }
      postgis_proj_version: { Args: never; Returns: string }
      postgis_scripts_build_date: { Args: never; Returns: string }
      postgis_scripts_installed: { Args: never; Returns: string }
      postgis_scripts_released: { Args: never; Returns: string }
      postgis_svn_version: { Args: never; Returns: string }
      postgis_type_name: {
        Args: {
          coord_dimension: number
          geomname: string
          use_new_name?: boolean
        }
        Returns: string
      }
      postgis_version: { Args: never; Returns: string }
      postgis_wagyu_version: { Args: never; Returns: string }
      recalculate_team_fps: { Args: { p_team_id: string }; Returns: undefined }
      request_match_cancellation: {
        Args: {
          p_match_id: string
          p_notes?: string
          p_reason: string
          p_team_id: string
        }
        Returns: undefined
      }
      resolve_match: { Args: { p_match_id: string }; Returns: undefined }
      resolve_match_dispute: { Args: { p_match_id: string }; Returns: Json }
      resolve_wo_claim: {
        Args: { p_admin_notes?: string; p_approve: boolean; p_claim_id: string }
        Returns: undefined
      }
      respond_to_cancellation_request: {
        Args: { p_accept: boolean; p_request_id: string }
        Returns: string
      }
      search_teams: {
        Args: {
          p_category?: Database["public"]["Enums"]["team_category"]
          p_format?: Database["public"]["Enums"]["team_format"]
          p_max_elo?: number
          p_min_elo?: number
          p_search?: string
          p_zone?: string
        }
        Returns: {
          category: Database["public"]["Enums"]["team_category"]
          elo_rating: number
          fair_play_score: number
          in_ranking: boolean
          matches_played: number
          preferred_format: Database["public"]["Enums"]["team_format"]
          season_draws: number
          season_losses: number
          season_wins: number
          shield_url: string
          team_id: string
          team_name: string
          zone: string
        }[]
      }
      season_reset_elo: { Args: never; Returns: undefined }
      send_challenge: {
        Args: {
          p_from_team_id: string
          p_match_type: string
          p_to_team_id: string
        }
        Returns: Json
      }
      st_3dclosestpoint: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_3ddistance: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      st_3dintersects: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      st_3dlongestline: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_3dmakebox: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_3dmaxdistance: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      st_3dshortestline: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_addpoint: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_angle:
        | { Args: { line1: unknown; line2: unknown }; Returns: number }
        | {
            Args: { pt1: unknown; pt2: unknown; pt3: unknown; pt4?: unknown }
            Returns: number
          }
      st_area:
        | { Args: { geog: unknown; use_spheroid?: boolean }; Returns: number }
        | { Args: { "": string }; Returns: number }
      st_asencodedpolyline: {
        Args: { geom: unknown; nprecision?: number }
        Returns: string
      }
      st_asewkt: { Args: { "": string }; Returns: string }
      st_asgeojson:
        | {
            Args: { geog: unknown; maxdecimaldigits?: number; options?: number }
            Returns: string
          }
        | {
            Args: { geom: unknown; maxdecimaldigits?: number; options?: number }
            Returns: string
          }
        | {
            Args: {
              geom_column?: string
              maxdecimaldigits?: number
              pretty_bool?: boolean
              r: Record<string, unknown>
            }
            Returns: string
          }
        | { Args: { "": string }; Returns: string }
      st_asgml:
        | {
            Args: {
              geog: unknown
              id?: string
              maxdecimaldigits?: number
              nprefix?: string
              options?: number
            }
            Returns: string
          }
        | {
            Args: { geom: unknown; maxdecimaldigits?: number; options?: number }
            Returns: string
          }
        | { Args: { "": string }; Returns: string }
        | {
            Args: {
              geog: unknown
              id?: string
              maxdecimaldigits?: number
              nprefix?: string
              options?: number
              version: number
            }
            Returns: string
          }
        | {
            Args: {
              geom: unknown
              id?: string
              maxdecimaldigits?: number
              nprefix?: string
              options?: number
              version: number
            }
            Returns: string
          }
      st_askml:
        | {
            Args: { geog: unknown; maxdecimaldigits?: number; nprefix?: string }
            Returns: string
          }
        | {
            Args: { geom: unknown; maxdecimaldigits?: number; nprefix?: string }
            Returns: string
          }
        | { Args: { "": string }; Returns: string }
      st_aslatlontext: {
        Args: { geom: unknown; tmpl?: string }
        Returns: string
      }
      st_asmarc21: { Args: { format?: string; geom: unknown }; Returns: string }
      st_asmvtgeom: {
        Args: {
          bounds: unknown
          buffer?: number
          clip_geom?: boolean
          extent?: number
          geom: unknown
        }
        Returns: unknown
      }
      st_assvg:
        | {
            Args: { geog: unknown; maxdecimaldigits?: number; rel?: number }
            Returns: string
          }
        | {
            Args: { geom: unknown; maxdecimaldigits?: number; rel?: number }
            Returns: string
          }
        | { Args: { "": string }; Returns: string }
      st_astext: { Args: { "": string }; Returns: string }
      st_astwkb:
        | {
            Args: {
              geom: unknown
              prec?: number
              prec_m?: number
              prec_z?: number
              with_boxes?: boolean
              with_sizes?: boolean
            }
            Returns: string
          }
        | {
            Args: {
              geom: unknown[]
              ids: number[]
              prec?: number
              prec_m?: number
              prec_z?: number
              with_boxes?: boolean
              with_sizes?: boolean
            }
            Returns: string
          }
      st_asx3d: {
        Args: { geom: unknown; maxdecimaldigits?: number; options?: number }
        Returns: string
      }
      st_azimuth:
        | { Args: { geog1: unknown; geog2: unknown }; Returns: number }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: number }
      st_boundingdiagonal: {
        Args: { fits?: boolean; geom: unknown }
        Returns: unknown
      }
      st_buffer:
        | {
            Args: { geom: unknown; options?: string; radius: number }
            Returns: unknown
          }
        | {
            Args: { geom: unknown; quadsegs: number; radius: number }
            Returns: unknown
          }
      st_centroid: { Args: { "": string }; Returns: unknown }
      st_clipbybox2d: {
        Args: { box: unknown; geom: unknown }
        Returns: unknown
      }
      st_closestpoint: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_collect: { Args: { geom1: unknown; geom2: unknown }; Returns: unknown }
      st_concavehull: {
        Args: {
          param_allow_holes?: boolean
          param_geom: unknown
          param_pctconvex: number
        }
        Returns: unknown
      }
      st_contains: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      st_containsproperly: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      st_coorddim: { Args: { geometry: unknown }; Returns: number }
      st_coveredby:
        | { Args: { geog1: unknown; geog2: unknown }; Returns: boolean }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      st_covers:
        | { Args: { geog1: unknown; geog2: unknown }; Returns: boolean }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      st_crosses: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      st_curvetoline: {
        Args: { flags?: number; geom: unknown; tol?: number; toltype?: number }
        Returns: unknown
      }
      st_delaunaytriangles: {
        Args: { flags?: number; g1: unknown; tolerance?: number }
        Returns: unknown
      }
      st_difference: {
        Args: { geom1: unknown; geom2: unknown; gridsize?: number }
        Returns: unknown
      }
      st_disjoint: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      st_distance:
        | {
            Args: { geog1: unknown; geog2: unknown; use_spheroid?: boolean }
            Returns: number
          }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: number }
      st_distancesphere:
        | { Args: { geom1: unknown; geom2: unknown }; Returns: number }
        | {
            Args: { geom1: unknown; geom2: unknown; radius: number }
            Returns: number
          }
      st_distancespheroid: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      st_dwithin: {
        Args: {
          geog1: unknown
          geog2: unknown
          tolerance: number
          use_spheroid?: boolean
        }
        Returns: boolean
      }
      st_equals: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      st_expand:
        | { Args: { box: unknown; dx: number; dy: number }; Returns: unknown }
        | {
            Args: { box: unknown; dx: number; dy: number; dz?: number }
            Returns: unknown
          }
        | {
            Args: {
              dm?: number
              dx: number
              dy: number
              dz?: number
              geom: unknown
            }
            Returns: unknown
          }
      st_force3d: { Args: { geom: unknown; zvalue?: number }; Returns: unknown }
      st_force3dm: {
        Args: { geom: unknown; mvalue?: number }
        Returns: unknown
      }
      st_force3dz: {
        Args: { geom: unknown; zvalue?: number }
        Returns: unknown
      }
      st_force4d: {
        Args: { geom: unknown; mvalue?: number; zvalue?: number }
        Returns: unknown
      }
      st_generatepoints:
        | { Args: { area: unknown; npoints: number }; Returns: unknown }
        | {
            Args: { area: unknown; npoints: number; seed: number }
            Returns: unknown
          }
      st_geogfromtext: { Args: { "": string }; Returns: unknown }
      st_geographyfromtext: { Args: { "": string }; Returns: unknown }
      st_geohash:
        | { Args: { geog: unknown; maxchars?: number }; Returns: string }
        | { Args: { geom: unknown; maxchars?: number }; Returns: string }
      st_geomcollfromtext: { Args: { "": string }; Returns: unknown }
      st_geometricmedian: {
        Args: {
          fail_if_not_converged?: boolean
          g: unknown
          max_iter?: number
          tolerance?: number
        }
        Returns: unknown
      }
      st_geometryfromtext: { Args: { "": string }; Returns: unknown }
      st_geomfromewkt: { Args: { "": string }; Returns: unknown }
      st_geomfromgeojson:
        | { Args: { "": Json }; Returns: unknown }
        | { Args: { "": Json }; Returns: unknown }
        | { Args: { "": string }; Returns: unknown }
      st_geomfromgml: { Args: { "": string }; Returns: unknown }
      st_geomfromkml: { Args: { "": string }; Returns: unknown }
      st_geomfrommarc21: { Args: { marc21xml: string }; Returns: unknown }
      st_geomfromtext: { Args: { "": string }; Returns: unknown }
      st_gmltosql: { Args: { "": string }; Returns: unknown }
      st_hasarc: { Args: { geometry: unknown }; Returns: boolean }
      st_hausdorffdistance: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      st_hexagon: {
        Args: { cell_i: number; cell_j: number; origin?: unknown; size: number }
        Returns: unknown
      }
      st_hexagongrid: {
        Args: { bounds: unknown; size: number }
        Returns: Record<string, unknown>[]
      }
      st_interpolatepoint: {
        Args: { line: unknown; point: unknown }
        Returns: number
      }
      st_intersection: {
        Args: { geom1: unknown; geom2: unknown; gridsize?: number }
        Returns: unknown
      }
      st_intersects:
        | { Args: { geog1: unknown; geog2: unknown }; Returns: boolean }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      st_isvaliddetail: {
        Args: { flags?: number; geom: unknown }
        Returns: Database["public"]["CompositeTypes"]["valid_detail"]
        SetofOptions: {
          from: "*"
          to: "valid_detail"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      st_length:
        | { Args: { geog: unknown; use_spheroid?: boolean }; Returns: number }
        | { Args: { "": string }; Returns: number }
      st_letters: { Args: { font?: Json; letters: string }; Returns: unknown }
      st_linecrossingdirection: {
        Args: { line1: unknown; line2: unknown }
        Returns: number
      }
      st_linefromencodedpolyline: {
        Args: { nprecision?: number; txtin: string }
        Returns: unknown
      }
      st_linefromtext: { Args: { "": string }; Returns: unknown }
      st_linelocatepoint: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      st_linetocurve: { Args: { geometry: unknown }; Returns: unknown }
      st_locatealong: {
        Args: { geometry: unknown; leftrightoffset?: number; measure: number }
        Returns: unknown
      }
      st_locatebetween: {
        Args: {
          frommeasure: number
          geometry: unknown
          leftrightoffset?: number
          tomeasure: number
        }
        Returns: unknown
      }
      st_locatebetweenelevations: {
        Args: { fromelevation: number; geometry: unknown; toelevation: number }
        Returns: unknown
      }
      st_longestline: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_makebox2d: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_makeline: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_makevalid: {
        Args: { geom: unknown; params: string }
        Returns: unknown
      }
      st_maxdistance: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      st_minimumboundingcircle: {
        Args: { inputgeom: unknown; segs_per_quarter?: number }
        Returns: unknown
      }
      st_mlinefromtext: { Args: { "": string }; Returns: unknown }
      st_mpointfromtext: { Args: { "": string }; Returns: unknown }
      st_mpolyfromtext: { Args: { "": string }; Returns: unknown }
      st_multilinestringfromtext: { Args: { "": string }; Returns: unknown }
      st_multipointfromtext: { Args: { "": string }; Returns: unknown }
      st_multipolygonfromtext: { Args: { "": string }; Returns: unknown }
      st_node: { Args: { g: unknown }; Returns: unknown }
      st_normalize: { Args: { geom: unknown }; Returns: unknown }
      st_offsetcurve: {
        Args: { distance: number; line: unknown; params?: string }
        Returns: unknown
      }
      st_orderingequals: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      st_overlaps: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      st_perimeter: {
        Args: { geog: unknown; use_spheroid?: boolean }
        Returns: number
      }
      st_pointfromtext: { Args: { "": string }; Returns: unknown }
      st_pointm: {
        Args: {
          mcoordinate: number
          srid?: number
          xcoordinate: number
          ycoordinate: number
        }
        Returns: unknown
      }
      st_pointz: {
        Args: {
          srid?: number
          xcoordinate: number
          ycoordinate: number
          zcoordinate: number
        }
        Returns: unknown
      }
      st_pointzm: {
        Args: {
          mcoordinate: number
          srid?: number
          xcoordinate: number
          ycoordinate: number
          zcoordinate: number
        }
        Returns: unknown
      }
      st_polyfromtext: { Args: { "": string }; Returns: unknown }
      st_polygonfromtext: { Args: { "": string }; Returns: unknown }
      st_project: {
        Args: { azimuth: number; distance: number; geog: unknown }
        Returns: unknown
      }
      st_quantizecoordinates: {
        Args: {
          g: unknown
          prec_m?: number
          prec_x: number
          prec_y?: number
          prec_z?: number
        }
        Returns: unknown
      }
      st_reduceprecision: {
        Args: { geom: unknown; gridsize: number }
        Returns: unknown
      }
      st_relate: { Args: { geom1: unknown; geom2: unknown }; Returns: string }
      st_removerepeatedpoints: {
        Args: { geom: unknown; tolerance?: number }
        Returns: unknown
      }
      st_segmentize: {
        Args: { geog: unknown; max_segment_length: number }
        Returns: unknown
      }
      st_setsrid:
        | { Args: { geog: unknown; srid: number }; Returns: unknown }
        | { Args: { geom: unknown; srid: number }; Returns: unknown }
      st_sharedpaths: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_shortestline: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_simplifypolygonhull: {
        Args: { geom: unknown; is_outer?: boolean; vertex_fraction: number }
        Returns: unknown
      }
      st_split: { Args: { geom1: unknown; geom2: unknown }; Returns: unknown }
      st_square: {
        Args: { cell_i: number; cell_j: number; origin?: unknown; size: number }
        Returns: unknown
      }
      st_squaregrid: {
        Args: { bounds: unknown; size: number }
        Returns: Record<string, unknown>[]
      }
      st_srid:
        | { Args: { geog: unknown }; Returns: number }
        | { Args: { geom: unknown }; Returns: number }
      st_subdivide: {
        Args: { geom: unknown; gridsize?: number; maxvertices?: number }
        Returns: unknown[]
      }
      st_swapordinates: {
        Args: { geom: unknown; ords: unknown }
        Returns: unknown
      }
      st_symdifference: {
        Args: { geom1: unknown; geom2: unknown; gridsize?: number }
        Returns: unknown
      }
      st_symmetricdifference: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_tileenvelope: {
        Args: {
          bounds?: unknown
          margin?: number
          x: number
          y: number
          zoom: number
        }
        Returns: unknown
      }
      st_touches: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      st_transform:
        | {
            Args: { from_proj: string; geom: unknown; to_proj: string }
            Returns: unknown
          }
        | {
            Args: { from_proj: string; geom: unknown; to_srid: number }
            Returns: unknown
          }
        | { Args: { geom: unknown; to_proj: string }; Returns: unknown }
      st_triangulatepolygon: { Args: { g1: unknown }; Returns: unknown }
      st_union:
        | { Args: { geom1: unknown; geom2: unknown }; Returns: unknown }
        | {
            Args: { geom1: unknown; geom2: unknown; gridsize: number }
            Returns: unknown
          }
      st_voronoilines: {
        Args: { extend_to?: unknown; g1: unknown; tolerance?: number }
        Returns: unknown
      }
      st_voronoipolygons: {
        Args: { extend_to?: unknown; g1: unknown; tolerance?: number }
        Returns: unknown
      }
      st_within: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      st_wkbtosql: { Args: { wkb: string }; Returns: unknown }
      st_wkttosql: { Args: { "": string }; Returns: unknown }
      st_wrapx: {
        Args: { geom: unknown; move: number; wrap: number }
        Returns: unknown
      }
      submit_dispute_vote: {
        Args: { p_match_id: string; p_voted_team_id: string }
        Returns: undefined
      }
      unlockrows: { Args: { "": string }; Returns: number }
      updategeometrysrid: {
        Args: {
          catalogn_name: string
          column_name: string
          new_srid_in: number
          schema_name: string
          table_name: string
        }
        Returns: string
      }
      verify_push_webhook_secret: {
        Args: { p_candidate: string }
        Returns: boolean
      }
    }
    Enums: {
      challenge_status: "ENVIADA" | "ACEPTADA" | "RECHAZADA" | "CANCELADA"
      conversation_type: "MATCH_CHAT" | "MARKET_DM"
      join_request_status: "PENDIENTE" | "ACEPTADA" | "RECHAZADA"
      market_post_type: "BUSCA_EQUIPO" | "BUSCA_PARTIDO"
      match_status:
        | "PENDIENTE"
        | "CONFIRMADO"
        | "EN_VIVO"
        | "FINALIZADO"
        | "EN_DISPUTA"
        | "WO_A"
        | "WO_B"
        | "CANCELADO"
      match_type: "RANKING" | "AMISTOSO"
      notification_type:
        | "SOLICITUD_UNION_EQUIPO"
        | "SOLICITUD_UNION_ACEPTADA"
        | "SOLICITUD_UNION_RECHAZADA"
        | "DESAFIO_RECIBIDO"
        | "DESAFIO_ACEPTADO"
        | "DESAFIO_RECHAZADO"
        | "PARTIDO_CONFIRMADO"
        | "PARTIDO_CANCELADO"
        | "PARTIDO_FINALIZADO"
        | "RESULTADO_EN_DISPUTA"
        | "RECORDATORIO_PARTIDO_24H"
        | "WO_RECLAMADO"
        | "MENSAJE_NUEVO"
        | "ROL_ACTUALIZADO"
        | "EXPULSADO_EQUIPO"
        | "CANCELACION_SOLICITADA"
        | "CANCELACION_RECHAZADA"
        | "POSTULACION_RECIBIDA"
        | "POSTULACION_RESPONDIDA"
      player_position:
        | "CUALQUIERA"
        | "ARQUERO"
        | "DEFENSOR"
        | "MEDIOCAMPISTA"
        | "DELANTERO"
      proposal_status: "PENDIENTE" | "ACEPTADA" | "RECHAZADA"
      result_status: "PENDIENTE" | "CARGADO" | "CONFIRMADO" | "EN_DISPUTA"
      team_category: "HOMBRES" | "MUJERES" | "MIXTO"
      team_format:
        | "FUTBOL_5"
        | "FUTBOL_6"
        | "FUTBOL_7"
        | "FUTBOL_8"
        | "FUTBOL_9"
        | "FUTBOL_11"
      team_role: "CAPITAN" | "SUBCAPITAN" | "JUGADOR" | "DIRECTOR_TECNICO"
      wo_status: "PENDIENTE_REVISION" | "APROBADO" | "RECHAZADO"
    }
    CompositeTypes: {
      geometry_dump: {
        path: number[] | null
        geom: unknown
      }
      valid_detail: {
        valid: boolean | null
        reason: string | null
        location: unknown
      }
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      challenge_status: ["ENVIADA", "ACEPTADA", "RECHAZADA", "CANCELADA"],
      conversation_type: ["MATCH_CHAT", "MARKET_DM"],
      join_request_status: ["PENDIENTE", "ACEPTADA", "RECHAZADA"],
      market_post_type: ["BUSCA_EQUIPO", "BUSCA_PARTIDO"],
      match_status: [
        "PENDIENTE",
        "CONFIRMADO",
        "EN_VIVO",
        "FINALIZADO",
        "EN_DISPUTA",
        "WO_A",
        "WO_B",
        "CANCELADO",
      ],
      match_type: ["RANKING", "AMISTOSO"],
      notification_type: [
        "SOLICITUD_UNION_EQUIPO",
        "SOLICITUD_UNION_ACEPTADA",
        "SOLICITUD_UNION_RECHAZADA",
        "DESAFIO_RECIBIDO",
        "DESAFIO_ACEPTADO",
        "DESAFIO_RECHAZADO",
        "PARTIDO_CONFIRMADO",
        "PARTIDO_CANCELADO",
        "PARTIDO_FINALIZADO",
        "RESULTADO_EN_DISPUTA",
        "RECORDATORIO_PARTIDO_24H",
        "WO_RECLAMADO",
        "MENSAJE_NUEVO",
        "ROL_ACTUALIZADO",
        "EXPULSADO_EQUIPO",
        "CANCELACION_SOLICITADA",
        "CANCELACION_RECHAZADA",
        "POSTULACION_RECIBIDA",
        "POSTULACION_RESPONDIDA",
      ],
      player_position: [
        "CUALQUIERA",
        "ARQUERO",
        "DEFENSOR",
        "MEDIOCAMPISTA",
        "DELANTERO",
      ],
      proposal_status: ["PENDIENTE", "ACEPTADA", "RECHAZADA"],
      result_status: ["PENDIENTE", "CARGADO", "CONFIRMADO", "EN_DISPUTA"],
      team_category: ["HOMBRES", "MUJERES", "MIXTO"],
      team_format: [
        "FUTBOL_5",
        "FUTBOL_6",
        "FUTBOL_7",
        "FUTBOL_8",
        "FUTBOL_9",
        "FUTBOL_11",
      ],
      team_role: ["CAPITAN", "SUBCAPITAN", "JUGADOR", "DIRECTOR_TECNICO"],
      wo_status: ["PENDIENTE_REVISION", "APROBADO", "RECHAZADO"],
    },
  },
} as const
