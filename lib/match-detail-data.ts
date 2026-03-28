import { supabase } from '@/lib/supabase';
import { getSupabaseStorageUrl } from '@/lib/supabase-storage';
import type {
  MatchDetailViewData,
  TeamSnippet,
  ProposalEntry,
  MatchParticipantEntry,
  MatchResultEntry,
  ScorerEntry,
  ProfileSnippet,
  WoClaimEntry,
  CancellationRequestEntry,
} from '@/components/matches/types';
import type { Database } from '@/types/supabase';

type MatchStatus = Database['public']['Enums']['match_status'];
type MatchType = Database['public']['Enums']['match_type'];
type TeamFormat = Database['public']['Enums']['team_format'];
type ProposalStatus = Database['public']['Enums']['proposal_status'];
type WoStatus = Database['public']['Enums']['wo_status'];
type TeamRole = 'CAPITAN' | 'SUBCAPITAN' | 'JUGADOR' | 'DIRECTOR_TECNICO';

interface RawTeam {
  id: string;
  name: string;
  shield_url: string | null;
  elo_rating: number;
}

interface RawProposal {
  id: string;
  match_id: string;
  from_team_id: string;
  proposed_by_name: string;
  format: TeamFormat;
  match_type: MatchType;
  scheduled_at: string;
  duration_minutes: number;
  location: string | null;
  venue_id: string | null;
  venue_name: string | null;
  venue_address: string | null;
  venue_lat: number | null;
  venue_lng: number | null;
  signal_amount: number | null;
  total_cost: number | null;
  status: ProposalStatus;
  created_at: string;
}

interface RawScorer {
  profile_id: string;
  full_name: string;
  goals: number;
}

interface RawMvp {
  id: string;
  full_name: string;
  username: string;
  avatar_url: string | null;
}

interface RawResult {
  team_id: string;
  goals_scored: number;
  goals_against: number;
  submitted_at: string;
  scorers: RawScorer[];
  mvp: RawMvp | null;
}

interface RawParticipant {
  profile_id: string;
  full_name: string;
  username: string;
  avatar_url: string | null;
  team_id: string;
  is_guest: boolean;
  did_checkin: boolean;
  checkin_at: string | null;
  is_result_loader: boolean;
}

interface RawWoClaim {
  id: string;
  claiming_team_id: string;
  reason: string | null;
  photo_url: string;
  status: WoStatus;
  admin_notes: string | null;
  created_at: string;
}

interface RawCancellationRequest {
  id: string;
  requested_by_team_id: string;
  reason: string;
  notes: string | null;
  status: 'PENDIENTE' | 'ACEPTADA' | 'RECHAZADA';
  created_at: string;
  is_late: boolean;
}

interface RawDetail {
  id: string;
  status: MatchStatus;
  match_type: MatchType;
  format: TeamFormat | null;
  scheduled_at: string | null;
  duration_minutes: number | null;
  location: string | null;
  venue_id: string | null;
  venue_name: string | null;
  venue_address: string | null;
  venue_lat: number | null;
  venue_lng: number | null;
  signal_amount: number | null;
  total_cost: number | null;
  unique_code: string;
  started_at: string | null;
  finished_at: string | null;
  checkin_team_a_at: string | null;
  checkin_team_b_at: string | null;
  team_a: RawTeam;
  team_b: RawTeam;
  my_team_id: string;
  my_role: TeamRole | null;
  is_result_loader: boolean;
  active_proposal: RawProposal | null;
  my_result: RawResult | null;
  opponent_result: RawResult | null;
  participants: RawParticipant[];
  conversation_id: string | null;
  wo_claim: RawWoClaim | null;
  cancellation_request: RawCancellationRequest | null;
}

function mapTeam(raw: RawTeam): TeamSnippet {
  return {
    id: raw.id,
    name: raw.name,
    shieldUrl: raw.shield_url ? getSupabaseStorageUrl('shields', raw.shield_url) : null,
    eloRating: raw.elo_rating ?? 1000,
  };
}

function mapResult(raw: RawResult): MatchResultEntry {
  const scorers: ScorerEntry[] = (raw.scorers ?? []).map((s) => ({
    profileId: s.profile_id,
    fullName: s.full_name,
    goals: s.goals,
  }));
  let mvp: ProfileSnippet | null = null;
  if (raw.mvp) {
    mvp = {
      id: raw.mvp.id,
      fullName: raw.mvp.full_name,
      username: raw.mvp.username,
      avatarUrl: raw.mvp.avatar_url,
    };
  }
  return {
    teamId: raw.team_id,
    goalsScored: raw.goals_scored,
    goalsAgainst: raw.goals_against,
    submittedAt: raw.submitted_at,
    scorers,
    mvp,
  };
}

export async function fetchMatchDetailViewData(
  matchId: string,
  myTeamId: string,
): Promise<MatchDetailViewData> {
  const { data, error } = await supabase.rpc(
    'get_match_detail' as Parameters<typeof supabase.rpc>[0],
    { p_match_id: matchId, p_team_id: myTeamId },
  );

  if (error) throw error;
  if (!data) throw new Error('Partido no encontrado');

  const raw = (data as unknown) as RawDetail;

  let activeProposal: ProposalEntry | null = null;
  if (raw.active_proposal) {
    const p = raw.active_proposal;
    activeProposal = {
      id: p.id,
      matchId: p.match_id,
      fromTeamId: p.from_team_id,
      proposedByName: p.proposed_by_name,
      format: p.format,
      matchType: p.match_type,
      scheduledAt: p.scheduled_at,
      durationMinutes: p.duration_minutes,
      location: p.location,
      venueId: p.venue_id,
      venueName: p.venue_name,
      venueAddress: p.venue_address,
      venueLat: p.venue_lat,
      venueLng: p.venue_lng,
      signalAmount: p.signal_amount,
      totalCost: p.total_cost,
      status: p.status,
      createdAt: p.created_at,
    };
  }

  const participants: MatchParticipantEntry[] = (raw.participants ?? []).map((p) => ({
    profileId: p.profile_id,
    fullName: p.full_name,
    username: p.username,
    avatarUrl: p.avatar_url,
    teamId: p.team_id,
    isGuest: p.is_guest,
    didCheckin: p.did_checkin,
    checkinAt: p.checkin_at,
    isResultLoader: p.is_result_loader,
  }));

  let woClaim: WoClaimEntry | null = null;
  if (raw.wo_claim) {
    const wc = raw.wo_claim;
    woClaim = {
      id: wc.id,
      claimingTeamId: wc.claiming_team_id,
      reason: (wc.reason ?? 'OTRO') as WoClaimEntry['reason'],
      photoUrl: wc.photo_url,
      status: wc.status,
      adminNotes: wc.admin_notes,
      createdAt: wc.created_at,
    };
  }

  let cancellationRequest: CancellationRequestEntry | null = null;
  if (raw.cancellation_request) {
    const cr = raw.cancellation_request;
    cancellationRequest = {
      id: cr.id,
      requestedByTeamId: cr.requested_by_team_id,
      reason: cr.reason as CancellationRequestEntry['reason'],
      notes: cr.notes,
      status: cr.status,
      createdAt: cr.created_at,
      isLate: cr.is_late,
    };
  }

  return {
    id: raw.id,
    status: raw.status,
    matchType: raw.match_type,
    format: raw.format,
    scheduledAt: raw.scheduled_at,
    durationMinutes: raw.duration_minutes,
    location: raw.location,
    venueId: raw.venue_id,
    venueName: raw.venue_name,
    venueAddress: raw.venue_address,
    venueLat: raw.venue_lat,
    venueLng: raw.venue_lng,
    signalAmount: raw.signal_amount,
    totalCost: raw.total_cost,
    uniqueCode: raw.unique_code,
    startedAt: raw.started_at,
    finishedAt: raw.finished_at,
    checkinTeamAAt: raw.checkin_team_a_at,
    checkinTeamBAt: raw.checkin_team_b_at,
    teamA: mapTeam(raw.team_a),
    teamB: mapTeam(raw.team_b),
    myTeamId: raw.my_team_id,
    myRole: raw.my_role,
    isResultLoader: raw.is_result_loader,
    activeProposal,
    myResult: raw.my_result ? mapResult(raw.my_result) : null,
    opponentResult: raw.opponent_result ? mapResult(raw.opponent_result) : null,
    participants,
    conversationId: raw.conversation_id,
    woClaim,
    cancellationRequest,
  };
}
