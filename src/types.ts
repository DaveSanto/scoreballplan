export type Position = 'P' | 'C' | '1B' | '2B' | '3B' | 'SS' | 'LF' | 'CF' | 'RF';
export const ALL_POSITIONS: Position[] = ['P', 'C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF'];

// ── Scorecard types ────────────────────────────────────────────────────────────

export type PathKey = 'b1' | '12' | '23' | '3h';

export type AtBatRecord = {
  catalyst: string;     // Project Scoresheet notation, e.g. "S7", "K", "43", "W"
  paths: string[];      // darkened basepaths: "b1", "12", "23", "3h"
  scored: boolean;
  rbi: boolean;         // true = circled (RBI run), false = underlined (non-RBI)
  outNumber: number;    // 0 = safe/scored, 1–3 = which out this was
};

export type ScorecardHalfInning = {
  atBats: (AtBatRecord | null)[];   // indexed by batting-order slot (0-based), null = did not bat
  runs: number;
  hits: number;
  errors: number;
};

export type ScorecardBatter = {
  id?: string;         // Player.id if pulled from a team roster
  name: string;
  number: string;      // uniform number
};

export type Scorecard = {
  id: string;
  ownerId: string;
  teamId?: string;
  gameId?: string;
  date: string;        // ISO "2026-06-15"
  opponent: string;
  isHome: boolean;
  battingOrder: ScorecardBatter[];
  innings: ScorecardHalfInning[];  // 0-based index = inning - 1
  maxInnings: number;
  createdAt: any;
  updatedAt: any;
};

export type InningAssignment = Record<string, Position>;
export type PositionRotation = Record<number, InningAssignment>;

export type Sport = 'baseball' | 'softball';
export type Handedness = 'L' | 'R' | 'S';
export type Visibility = 'public' | 'private';

// ── Player (top-level collection) ─────────────────────────────────────────────
export type Player = {
  id: string;
  name: string;
  number: string;
  email?: string;
  bats?: Handedness;
  throws?: 'L' | 'R';
  preferredPositions?: Position[];
  battingAverage?: number | null;
  obp?: number | null;
  era?: number | null;
  addedBy: string;        // uid of user who created this record
  claimedBy?: string;     // uid of player themselves (once they sign up)
  guardianId?: string;    // uid of parent/guardian managing this player
  visibility: Visibility; // controlled by claimedBy; default 'private'
};

// ── Team (top-level collection) ───────────────────────────────────────────────
export type HomeField = {
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
};

export type Team = {
  id: string;
  name: string;
  sport: Sport;
  ownerId: string;
  captainId?: string;          // set when a league invite is accepted
  leagueId?: string | null;
  playerIds: string[];         // refs to players collection
  battingOrder: string[];      // ordered player IDs
  absentPlayerIds: string[];   // sitting out the next game
  innings: number;
  rosterVisibility: Visibility; // captain controls whether league can see roster
  coAdminIds?: string[];        // account holders granted team-editor access by the owner
  viewerIds?: string[];         // account holders with read-only access
  // Contact info (stored from CSV import; invites are separate)
  captain1Name?: string;
  captain1Phone?: string;
  captain2Name?: string;
  captain2Phone?: string;
  // Visual identity
  color1?: string;
  color2?: string;
  logoUrl?: string;
  // Home field
  homeField?: HomeField;
  // Users who hid this team from their dashboard (soft-delete for non-owners)
  hiddenFor?: string[];
};

// ── League (top-level collection) ────────────────────────────────────────────
export type League = {
  id: string;
  name: string;
  sport: Sport;
  season: string;
  ownerId: string;
  teamIds: string[];
  scheduleConfig?: ScheduleConfig;
  schedule?: Schedule;
};

// ── Schedule types ────────────────────────────────────────────────────────────
export type GameSlot = {
  id: string;
  date: string;          // e.g. "Tuesday, June 16"
  field: string;
  gameNumber: 1 | 2;
  startTime: '6:30 PM' | '8:15 PM';
  isSwamp: boolean;      // no lights — 6:30 only
  isMakeup: boolean;
  isPlayoff: boolean;
};

export type ScheduledGame = {
  slotId: string;
  date: string;
  field: string;
  gameNumber: 1 | 2;
  startTime: string;
  isSwamp: boolean;
  homeId: string;
  home: string;
  awayId: string;
  away: string;
  isMakeup: boolean;
  isPlayoff: boolean;
};

export type TeamScheduleStats = {
  teamId: string;
  teamName: string;
  totalGames: number;
  homeGames: number;
  awayGames: number;
  swampGames: number;
  gamesAt630: number;
  gamesAt815: number;
};

export type ScheduleConfig = {
  slots: GameSlot[];
  swampGamesPerTeam: number;
  allowDoubleheaders: boolean;
};

export type Schedule = {
  games: ScheduledGame[];
  warnings: string[];
  stats: TeamScheduleStats[];
  generatedAt: string;
};

// ── Team schedule (team-level games, independent of league) ──────────────────
export type TeamGame = {
  id: string;
  date: string;        // ISO "2026-06-15" preferred; freeform accepted
  opponent: string;
  location?: string;
  time?: string;
  isHome: boolean;
  notes?: string;
  absentPlayerIds?: string[];  // players who marked themselves unavailable for THIS game
};

// ── Team invite (co-admin access) ─────────────────────────────────────────────
export type InviteStatus = 'pending' | 'accepted' | 'declined';
export type TeamRole = 'owner' | 'editor' | 'viewer';

export type TeamInvite = {
  id: string;
  teamId: string;
  teamName: string;
  invitedBy: string;    // uid of team owner
  role: TeamRole;       // 'editor' (can manage) or 'viewer' (read-only)
  status: InviteStatus;
  token: string;
  createdAt: any;
  expiresAt: any;
};

// ── League invite ─────────────────────────────────────────────────────────────

export type LeagueInvite = {
  id: string;
  leagueId: string;
  leagueName: string;
  invitedEmail: string;
  invitedBy: string;    // uid
  teamId?: string;      // pre-assigned team (optional)
  teamName?: string;
  status: InviteStatus;
  token: string;        // unique URL token
  createdAt: any;
  expiresAt: any;
};
