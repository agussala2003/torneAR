import type { Database } from '@/types/supabase';

type MatchStatus = Database['public']['Enums']['match_status'];
type MatchType = Database['public']['Enums']['match_type'];
type TeamFormat = Database['public']['Enums']['team_format'];
type ProposalStatus = Database['public']['Enums']['proposal_status'];
type WoStatus = Database['public']['Enums']['wo_status'];

// ─── Shared small types ───────────────────────────────────────────────────────

export interface TeamSnippet {
    id: string;
    name: string;
    shieldUrl: string | null;
    eloRating: number;
}

export interface ProfileSnippet {
    id: string;
    fullName: string;
    username: string;
    avatarUrl: string | null;
}

// ─── Match card (list view) ───────────────────────────────────────────────────

export interface MatchCardEntry {
    id: string;
    status: MatchStatus;
    matchType: MatchType;
    scheduledAt: string | null;
    format: TeamFormat | null;
    venue: string | null;          // venue name or free-text location
    teamA: TeamSnippet;
    teamB: TeamSnippet;
    checkinTeamAAt: string | null;
    checkinTeamBAt: string | null;
    // If there is an active (PENDIENTE) proposal, summarize it
    activeProposal: {
        id: string;
        fromTeamId: string;
        scheduledAt: string;
        format: TeamFormat;
        location: string | null;
        status: ProposalStatus;
    } | null;
    // WO / result summary for history
    resultTeamA: number | null;
    resultTeamB: number | null;
    // Active cancellation request
    hasPendingCancellation: boolean;
}

// ─── Match detail (full screen) ───────────────────────────────────────────────

export interface ProposalEntry {
    id: string;
    matchId: string;
    fromTeamId: string;
    proposedByName: string;
    format: TeamFormat;
    matchType: MatchType;
    scheduledAt: string;
    durationMinutes: number;
    location: string | null;
    venueId: string | null;
    venueName: string | null;
    venueAddress: string | null;
    venueLat: number | null;
    venueLng: number | null;
    signalAmount: number | null;
    totalCost: number | null;
    status: ProposalStatus;
    createdAt: string;
}

export interface MatchParticipantEntry {
    profileId: string;
    fullName: string;
    username: string;
    avatarUrl: string | null;
    teamId: string;
    isGuest: boolean;
    didCheckin: boolean;
    checkinAt: string | null;
    isResultLoader: boolean;
}

export interface ScorerEntry {
    profileId: string;
    fullName: string;
    goals: number;
}

export interface MatchResultEntry {
    teamId: string;
    goalsScored: number;
    goalsAgainst: number;
    scorers: ScorerEntry[];
    mvp: ProfileSnippet | null;
    submittedAt: string;
}

export interface WoClaimEntry {
    id: string;
    claimingTeamId: string;
    reason: 'NO_PRESENTACION' | 'ABANDONO' | 'INCIDENTE_CONDUCTA' | 'CAMPO_NO_DISPONIBLE' | 'FALTA_QUORUM' | 'OTRO';
    photoUrl: string;
    status: WoStatus;
    adminNotes: string | null;
    createdAt: string;
}

export interface CancellationRequestEntry {
    id: string;
    requestedByTeamId: string;
    reason: CancellationReason;
    notes: string | null;
    status: 'PENDIENTE' | 'ACEPTADA' | 'RECHAZADA';
    createdAt: string;
    isLate: boolean;   // true if created < 24h before scheduledAt → FPS penalty applies
}

export type CancellationReason =
    | 'MUTUO_ACUERDO'
    | 'FUERZA_MAYOR'
    | 'LESION'
    | 'CAMPO_NO_DISPONIBLE'
    | 'FALTA_QUORUM'
    | 'UNILATERAL'
    | 'OTRO';

export interface MatchDetailViewData {
    id: string;
    status: MatchStatus;
    matchType: MatchType;
    format: TeamFormat | null;
    scheduledAt: string | null;
    durationMinutes: number | null;
    location: string | null;
    venueId: string | null;
    venueName: string | null;
    venueAddress: string | null;
    venueLat: number | null;
    venueLng: number | null;
    signalAmount: number | null;
    totalCost: number | null;
    uniqueCode: string;
    startedAt: string | null;
    finishedAt: string | null;
    checkinTeamAAt: string | null;
    checkinTeamBAt: string | null;
    teamA: TeamSnippet;
    teamB: TeamSnippet;
    // Context for the current user
    myTeamId: string;
    myRole: 'CAPITAN' | 'SUBCAPITAN' | 'JUGADOR' | 'DIRECTOR_TECNICO' | null;
    isResultLoader: boolean;    // the current user did checkin and can load result
    // Sub-entities
    activeProposal: ProposalEntry | null;
    myResult: MatchResultEntry | null;
    opponentResult: MatchResultEntry | null;
    participants: MatchParticipantEntry[];
    conversationId: string | null;
    woClaim: WoClaimEntry | null;
    cancellationRequest: CancellationRequestEntry | null;
}

// ─── Tab screen view data ─────────────────────────────────────────────────────

export interface MatchesViewData {
    liveMatch: MatchCardEntry | null;
    upcomingMatches: MatchCardEntry[];      // PENDIENTE + CONFIRMADO
    historyMatches: MatchCardEntry[];       // FINALIZADO, EN_DISPUTA, WO_A, WO_B, CANCELADO
    myTeamId: string;
}

// ─── Form types ───────────────────────────────────────────────────────────────

export interface MatchProposalFormData {
    format: TeamFormat;
    matchType: MatchType;
    scheduledAt: Date;
    durationMinutes: number;
    venueId: string | null;
    location: string | null;
    signalAmount: number | null;
    totalCost: number | null;
}

export interface MatchResultFormData {
    goalsScored: number;
    goalsAgainst: number;
    // optional: if provided, sum must equal goalsScored
    scorers: { profileId: string; goals: number }[];
    mvpProfileId: string | null;
}

export interface WoClaimFormData {
    reason: WoClaimEntry['reason'];
    photoBase64: string;
    photoMimeType: string;
    notes: string | null;
}

export interface CancellationFormData {
    reason: CancellationReason;
    notes: string | null;
}
