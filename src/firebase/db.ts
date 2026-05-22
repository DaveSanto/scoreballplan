import {
  collection,
  doc,
  addDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  where,
  arrayUnion,
  arrayRemove,
  serverTimestamp,
  Timestamp,
  Unsubscribe,
} from 'firebase/firestore';
import { db } from './config';
import { Team, League, Player, LeagueInvite, TeamInvite, Schedule, ScheduleConfig, TeamGame, Scorecard, ScorecardHalfInning, TeamRole, UserProfile } from '../types';

function stripUndefined(obj: Record<string, any>): Record<string, any> {
  return Object.fromEntries(
    Object.entries(obj)
      .filter(([, v]) => v !== undefined)
      .map(([k, v]) => [k, v !== null && typeof v === 'object' && !Array.isArray(v) ? stripUndefined(v) : v])
  );
}

// ── Teams ─────────────────────────────────────────────────────────────────────

export async function createTeam(
  data: Pick<Team, 'name' | 'sport'>,
  ownerId: string,
  extra?: Partial<Omit<Team, 'id' | 'name' | 'sport' | 'ownerId'>>
): Promise<string> {
  const ref = await addDoc(collection(db, 'teams'), {
    ...stripUndefined(extra ?? {}),
    ...data,
    ownerId,
    playerIds: [],
    battingOrder: [],
    innings: 6,
    leagueId: null,
    rosterVisibility: 'private',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

export async function updateTeam(teamId: string, data: Partial<Omit<Team, 'id'>>): Promise<void> {
  await updateDoc(doc(db, 'teams', teamId), { ...data, updatedAt: serverTimestamp() });
}

export async function deleteTeam(teamId: string): Promise<void> {
  await deleteDoc(doc(db, 'teams', teamId));
}

export async function hideTeamFromView(teamId: string, userId: string): Promise<void> {
  await updateDoc(doc(db, 'teams', teamId), { hiddenFor: arrayUnion(userId) });
}

export async function unhideTeamFromView(teamId: string, userId: string): Promise<void> {
  await updateDoc(doc(db, 'teams', teamId), { hiddenFor: arrayRemove(userId) });
}

export function subscribeToTeams(ownerId: string, onUpdate: (teams: Team[]) => void): Unsubscribe {
  const q = query(collection(db, 'teams'), where('ownerId', '==', ownerId));
  return onSnapshot(q, (snap) => {
    const teams = snap.docs.map((d) => {
      const data = d.data();
      return { id: d.id, ...data, playerIds: data.playerIds ?? [], battingOrder: data.battingOrder ?? [], absentPlayerIds: data.absentPlayerIds ?? [] } as Team;
    });
    onUpdate(teams.sort((a, b) => a.name.localeCompare(b.name)));
  }, () => onUpdate([]));
}

export function subscribeToTeamsByCaptain(captainId: string, onUpdate: (teams: Team[]) => void): Unsubscribe {
  const q = query(collection(db, 'teams'), where('captainId', '==', captainId));
  return onSnapshot(q, (snap) => {
    const teams = snap.docs.map((d) => {
      const data = d.data();
      return { id: d.id, ...data, playerIds: data.playerIds ?? [], battingOrder: data.battingOrder ?? [], absentPlayerIds: data.absentPlayerIds ?? [] } as Team;
    });
    onUpdate(teams);
  });
}

// ── Players ───────────────────────────────────────────────────────────────────

export async function createPlayer(
  data: Omit<Player, 'id'>,
): Promise<string> {
  const ref = await addDoc(collection(db, 'players'), {
    ...stripUndefined(data as Record<string, any>),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

export async function updatePlayer(playerId: string, data: Partial<Omit<Player, 'id'>>): Promise<void> {
  await updateDoc(doc(db, 'players', playerId), {
    ...stripUndefined(data as Record<string, any>),
    updatedAt: serverTimestamp(),
  });
}

export async function deletePlayer(playerId: string): Promise<void> {
  await deleteDoc(doc(db, 'players', playerId));
}

export async function claimPlayer(playerId: string, userId: string): Promise<void> {
  await updateDoc(doc(db, 'players', playerId), {
    claimedBy: userId,
    updatedAt: serverTimestamp(),
  });
}

export async function linkAsGuardian(playerId: string, userId: string): Promise<void> {
  await updateDoc(doc(db, 'players', playerId), {
    guardianId: userId,
    updatedAt: serverTimestamp(),
  });
}

export function subscribeToPlayers(addedBy: string, onUpdate: (players: Player[]) => void): Unsubscribe {
  const q = query(collection(db, 'players'), where('addedBy', '==', addedBy));
  return onSnapshot(q, (snap) => {
    const players = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Player));
    onUpdate(players);
  }, () => onUpdate([]));
}

export function subscribeToClaimedPlayers(claimedBy: string, onUpdate: (players: Player[]) => void): Unsubscribe {
  const q = query(collection(db, 'players'), where('claimedBy', '==', claimedBy));
  return onSnapshot(q, (snap) => {
    const players = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Player));
    onUpdate(players);
  }, () => onUpdate([]));
}

// ── Leagues ───────────────────────────────────────────────────────────────────

export async function createLeague(
  data: Pick<League, 'name' | 'sport' | 'season'>,
  ownerId: string
): Promise<string> {
  const ref = await addDoc(collection(db, 'leagues'), {
    ...data,
    ownerId,
    teamIds: [],
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

export async function updateLeague(leagueId: string, data: Partial<Omit<League, 'id'>>): Promise<void> {
  await updateDoc(doc(db, 'leagues', leagueId), { ...data, updatedAt: serverTimestamp() });
}

export async function deleteLeague(leagueId: string): Promise<void> {
  await deleteDoc(doc(db, 'leagues', leagueId));
}

export async function saveSchedule(leagueId: string, schedule: Schedule, config: ScheduleConfig): Promise<void> {
  await updateDoc(doc(db, 'leagues', leagueId), {
    schedule,
    scheduleConfig: config,
    updatedAt: serverTimestamp(),
  });
}

export function subscribeToLeagues(ownerId: string, onUpdate: (leagues: League[]) => void): Unsubscribe {
  const q = query(collection(db, 'leagues'), where('ownerId', '==', ownerId));
  return onSnapshot(q, (snap) => {
    const leagues = snap.docs.map((d) => ({ id: d.id, ...d.data() } as League));
    onUpdate(leagues.sort((a, b) => a.name.localeCompare(b.name)));
  }, () => onUpdate([]));
}

export function subscribeToLeaguesByAssistantAdmin(userId: string, onUpdate: (leagues: League[]) => void): Unsubscribe {
  const q = query(collection(db, 'leagues'), where('leagueAssistantAdminIds', 'array-contains', userId));
  return onSnapshot(q, (snap) => {
    const leagues = snap.docs.map((d) => ({ id: d.id, ...d.data() } as League));
    onUpdate(leagues.sort((a, b) => a.name.localeCompare(b.name)));
  }, () => onUpdate([]));
}

export async function addLeagueAssistantAdmin(leagueId: string, uid: string): Promise<void> {
  await updateDoc(doc(db, 'leagues', leagueId), { leagueAssistantAdminIds: arrayUnion(uid), updatedAt: serverTimestamp() });
}

export async function removeLeagueAssistantAdmin(leagueId: string, uid: string): Promise<void> {
  await updateDoc(doc(db, 'leagues', leagueId), { leagueAssistantAdminIds: arrayRemove(uid), updatedAt: serverTimestamp() });
}

// ── Team Games (subcollection: teams/{teamId}/games) ─────────────────────────

export async function addTeamGame(teamId: string, data: Omit<TeamGame, 'id'>): Promise<string> {
  const ref = await addDoc(collection(db, 'teams', teamId, 'games'), {
    ...stripUndefined(data as Record<string, any>),
    createdAt: serverTimestamp(),
  });
  return ref.id;
}

export async function updateTeamGame(
  teamId: string,
  gameId: string,
  data: Partial<Omit<TeamGame, 'id'>>
): Promise<void> {
  await updateDoc(doc(db, 'teams', teamId, 'games', gameId), stripUndefined(data as Record<string, any>));
}

export async function deleteTeamGame(teamId: string, gameId: string): Promise<void> {
  await deleteDoc(doc(db, 'teams', teamId, 'games', gameId));
}

export function subscribeToTeamGames(
  teamId: string,
  onUpdate: (games: TeamGame[]) => void
): Unsubscribe {
  return onSnapshot(
    collection(db, 'teams', teamId, 'games'),
    (snap) => {
      const games = snap.docs.map((d) => ({ id: d.id, ...d.data() } as TeamGame));
      onUpdate(games);
    },
    () => onUpdate([])
  );
}

// ── User profile (extra fields beyond Firebase Auth) ─────────────────────────

export function subscribeToUserProfile(
  userId: string,
  onUpdate: (profile: UserProfile) => void
): Unsubscribe {
  return onSnapshot(
    doc(db, 'users', userId),
    (snap) => onUpdate((snap.data() ?? {}) as UserProfile),
    () => onUpdate({})
  );
}

export async function updateUserProfile(userId: string, data: Partial<UserProfile>): Promise<void> {
  await setDoc(doc(db, 'users', userId), data, { merge: true });
}

// ── League Invites ────────────────────────────────────────────────────────────

function generateToken(): string {
  const bytes = new Uint8Array(18);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

export async function createInvite(
  data: Pick<LeagueInvite, 'leagueId' | 'leagueName' | 'invitedEmail' | 'invitedBy' | 'teamId' | 'teamName'>
): Promise<{ id: string; token: string }> {
  const token = generateToken();
  const expiresAt = Timestamp.fromDate(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)); // 7 days
  const ref = await addDoc(collection(db, 'leagueInvites'), {
    ...data,
    status: 'pending',
    token,
    createdAt: serverTimestamp(),
    expiresAt,
  });
  return { id: ref.id, token };
}

export async function getInviteByToken(token: string): Promise<LeagueInvite | null> {
  const q = query(collection(db, 'leagueInvites'), where('token', '==', token));
  const snap = await getDocs(q);
  if (snap.empty) return null;
  const d = snap.docs[0];
  return { id: d.id, ...d.data() } as LeagueInvite;
}

export async function acceptInvite(inviteId: string, acceptedByUid: string, teamId?: string): Promise<void> {
  const invite = await getDoc(doc(db, 'leagueInvites', inviteId));
  if (!invite.exists()) return;
  const data = invite.data() as LeagueInvite;

  await updateDoc(doc(db, 'leagueInvites', inviteId), { status: 'accepted' });

  // Set captainId on the team
  const tid = teamId ?? data.teamId;
  if (tid) {
    await updateTeam(tid, { captainId: acceptedByUid });
  }
}

export async function declineInvite(inviteId: string): Promise<void> {
  await updateDoc(doc(db, 'leagueInvites', inviteId), { status: 'declined' });
}

export async function deleteLeagueInvite(inviteId: string): Promise<void> {
  await deleteDoc(doc(db, 'leagueInvites', inviteId));
}

// ── Team Invites (co-admin access) ────────────────────────────────────────────

export async function createTeamInvite(
  teamId: string,
  teamName: string,
  invitedBy: string,
  role: Exclude<TeamRole, 'owner'> = 'editor'
): Promise<{ id: string; token: string }> {
  const token = generateToken();
  const expiresAt = Timestamp.fromDate(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000));
  const ref = await addDoc(collection(db, 'teamInvites'), {
    teamId,
    teamName,
    invitedBy,
    role,
    status: 'pending',
    token,
    createdAt: serverTimestamp(),
    expiresAt,
  });
  return { id: ref.id, token };
}

export async function getTeamInviteByToken(token: string): Promise<TeamInvite | null> {
  const q = query(collection(db, 'teamInvites'), where('token', '==', token));
  const snap = await getDocs(q);
  if (snap.empty) return null;
  const d = snap.docs[0];
  return { id: d.id, ...d.data() } as TeamInvite;
}

export async function acceptTeamInvite(inviteId: string, acceptedByUid: string, teamId: string): Promise<void> {
  const inviteSnap = await getDoc(doc(db, 'teamInvites', inviteId));
  const role: Exclude<TeamRole, 'owner'> = inviteSnap.exists()
    ? (inviteSnap.data().role ?? 'editor')
    : 'editor';

  await updateDoc(doc(db, 'teamInvites', inviteId), { status: 'accepted' });

  // arrayUnion avoids a read — also works around the permission catch-22 where
  // the invitee isn't yet a member and can't read the team to compute the new array.
  const fieldKey = role === 'editor' ? 'coAdminIds' : role === 'member' ? 'memberIds' : 'viewerIds';
  await updateDoc(doc(db, 'teams', teamId), {
    [fieldKey]: arrayUnion(acceptedByUid),
    updatedAt: serverTimestamp(),
  });
}

export function subscribeToTeamsByViewer(userId: string, onUpdate: (teams: Team[]) => void): Unsubscribe {
  const q = query(collection(db, 'teams'), where('viewerIds', 'array-contains', userId));
  return onSnapshot(q, (snap) => {
    const teams = snap.docs.map((d) => {
      const data = d.data();
      return { id: d.id, ...data, playerIds: data.playerIds ?? [], battingOrder: data.battingOrder ?? [], absentPlayerIds: data.absentPlayerIds ?? [] } as Team;
    });
    onUpdate(teams.sort((a, b) => a.name.localeCompare(b.name)));
  }, () => onUpdate([]));
}

export function subscribeToTeamsByCoAdmin(userId: string, onUpdate: (teams: Team[]) => void): Unsubscribe {
  const q = query(collection(db, 'teams'), where('coAdminIds', 'array-contains', userId));
  return onSnapshot(q, (snap) => {
    const teams = snap.docs.map((d) => {
      const data = d.data();
      return { id: d.id, ...data, playerIds: data.playerIds ?? [], battingOrder: data.battingOrder ?? [], absentPlayerIds: data.absentPlayerIds ?? [] } as Team;
    });
    onUpdate(teams.sort((a, b) => a.name.localeCompare(b.name)));
  }, () => onUpdate([]));
}

export function subscribeToTeamsByMember(userId: string, onUpdate: (teams: Team[]) => void): Unsubscribe {
  const q = query(collection(db, 'teams'), where('memberIds', 'array-contains', userId));
  return onSnapshot(q, (snap) => {
    const teams = snap.docs.map((d) => {
      const data = d.data();
      return { id: d.id, ...data, playerIds: data.playerIds ?? [], battingOrder: data.battingOrder ?? [], absentPlayerIds: data.absentPlayerIds ?? [] } as Team;
    });
    onUpdate(teams.sort((a, b) => a.name.localeCompare(b.name)));
  }, () => onUpdate([]));
}

export function subscribeToInvitesByLeague(
  leagueId: string,
  onUpdate: (invites: LeagueInvite[]) => void
): Unsubscribe {
  const q = query(collection(db, 'leagueInvites'), where('leagueId', '==', leagueId));
  return onSnapshot(q, (snap) => {
    const invites = snap.docs.map((d) => ({ id: d.id, ...d.data() } as LeagueInvite));
    onUpdate(invites.sort((a, b) => (a.invitedEmail < b.invitedEmail ? -1 : 1)));
  });
}

// ── Scorecards ────────────────────────────────────────────────────────────────

function emptyInning(slotCount: number): ScorecardHalfInning {
  return { atBats: Array(slotCount).fill(null), runs: 0, hits: 0, errors: 0 };
}

export async function createScorecard(
  ownerId: string,
  data: Pick<Scorecard, 'opponent' | 'date' | 'isHome' | 'battingOrder' | 'maxInnings'> & {
    teamId?: string;
    gameId?: string;
  }
): Promise<string> {
  const innings = Array.from({ length: data.maxInnings }, () =>
    emptyInning(data.battingOrder.length)
  );
  const ref = await addDoc(collection(db, 'scorecards'), {
    ...stripUndefined(data as Record<string, any>),
    ownerId,
    innings,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

export async function updateScorecard(
  scorecardId: string,
  data: Partial<Omit<Scorecard, 'id'>>
): Promise<void> {
  await updateDoc(doc(db, 'scorecards', scorecardId), {
    ...stripUndefined(data as Record<string, any>),
    updatedAt: serverTimestamp(),
  });
}

export async function deleteScorecard(scorecardId: string): Promise<void> {
  await deleteDoc(doc(db, 'scorecards', scorecardId));
}

export async function getScorecard(scorecardId: string): Promise<Scorecard | null> {
  const snap = await getDoc(doc(db, 'scorecards', scorecardId));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() } as Scorecard;
}

export function subscribeToScorecard(
  scorecardId: string,
  onUpdate: (sc: Scorecard | null) => void
): Unsubscribe {
  return onSnapshot(
    doc(db, 'scorecards', scorecardId),
    (snap) => onUpdate(snap.exists() ? ({ id: snap.id, ...snap.data() } as Scorecard) : null),
    () => onUpdate(null)
  );
}

export function subscribeToTeamScorecards(
  teamId: string,
  onUpdate: (scorecards: Scorecard[]) => void
): Unsubscribe {
  const q = query(collection(db, 'scorecards'), where('teamId', '==', teamId));
  return onSnapshot(
    q,
    (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Scorecard));
      onUpdate(list.sort((a, b) => b.date.localeCompare(a.date)));
    },
    () => onUpdate([])
  );
}

export async function upsertSurveyRoster(surveyId: string, teamId: string, players: string[]): Promise<void> {
  await setDoc(doc(db, 'surveys', surveyId, 'rosters', teamId), { players, updatedAt: serverTimestamp() });
}

export function subscribeToOwnerScorecards(
  ownerId: string,
  onUpdate: (scorecards: Scorecard[]) => void
): Unsubscribe {
  const q = query(collection(db, 'scorecards'), where('ownerId', '==', ownerId));
  return onSnapshot(
    q,
    (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Scorecard));
      onUpdate(list.sort((a, b) => b.date.localeCompare(a.date)));
    },
    () => onUpdate([])
  );
}
