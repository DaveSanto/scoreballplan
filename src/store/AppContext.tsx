import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Team, League, Player, PositionRotation, Sport } from '../types';
import { generateRotation } from '../utils/rotation';
import {
  createTeam as dbCreateTeam,
  updateTeam as dbUpdateTeam,
  deleteTeam as dbDeleteTeam,
  hideTeamFromView as dbHideTeam,
  subscribeToTeams,
  subscribeToTeamsByCoAdmin,
  subscribeToTeamsByViewer,
  createPlayer as dbCreatePlayer,
  updatePlayer as dbUpdatePlayer,
  deletePlayer as dbDeletePlayer,
  claimPlayer as dbClaimPlayer,
  linkAsGuardian as dbLinkAsGuardian,
  subscribeToPlayers,
  subscribeToClaimedPlayers,
  createLeague as dbCreateLeague,
  updateLeague as dbUpdateLeague,
  deleteLeague as dbDeleteLeague,
  subscribeToLeagues,
} from '../firebase/db';

type AppContextType = {
  teams: Team[];
  leagues: League[];
  players: Player[];
  loading: boolean;

  // Teams
  createTeam: (name: string, sport: Sport) => Promise<string>;
  renameTeam: (teamId: string, name: string) => Promise<void>;
  removeTeam: (teamId: string) => Promise<void>;
  hideTeam: (teamId: string) => Promise<void>;

  // Leagues
  createLeague: (name: string, sport: Sport, season: string) => Promise<string>;
  renameLeague: (leagueId: string, name: string) => Promise<void>;
  removeLeague: (leagueId: string) => Promise<void>;
  addTeamToLeague: (leagueId: string, teamId: string) => Promise<void>;
  removeTeamFromLeague: (leagueId: string, teamId: string) => Promise<void>;

  // Players
  getTeamPlayers: (teamId: string) => Player[];
  addPlayer: (teamId: string, name: string, number: string, extra?: Partial<Player>) => Promise<void>;
  bulkAddPlayers: (teamId: string, rows: Array<Partial<Omit<Player, 'id'>> & { name: string }>) => Promise<void>;
  removePlayerFromTeam: (teamId: string, playerId: string) => Promise<void>;
  updatePlayer: (playerId: string, data: Partial<Omit<Player, 'id'>>) => Promise<void>;
  claimPlayer: (playerId: string) => Promise<void>;
  linkAsGuardian: (playerId: string) => Promise<void>;

  // Batting order
  moveBattingOrder: (teamId: string, fromIndex: number, toIndex: number) => Promise<void>;

  // Availability
  togglePlayerAbsence: (teamId: string, playerId: string) => Promise<void>;

  // Rotation
  setInnings: (teamId: string, n: number) => Promise<void>;
  getRotation: (teamId: string) => PositionRotation;
  regenerateRotation: (teamId: string) => void;
};

const AppContext = createContext<AppContextType | null>(null);

const rotationCache = new Map<string, PositionRotation>();

export function AppProvider({
  children,
  userId,
}: {
  children: React.ReactNode;
  userId: string;
}) {
  const [teams, setTeams] = useState<Team[]>([]);
  const [leagues, setLeagues] = useState<League[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);
  const loadedRef = useRef({ teams: false, leagues: false, players: false });

  // Refs to hold player arrays from all sources; merged into `players` state
  const ownedPlayersRef = useRef<Player[]>([]);
  const claimedPlayersRef = useRef<Player[]>([]);
  const sharedPlayersRef = useRef<Map<string, Player[]>>(new Map()); // keyed by team owner uid

  const mergeAllPlayers = useCallback(() => {
    const seen = new Set<string>();
    const merged: Player[] = [];
    const all = [
      ...ownedPlayersRef.current,
      ...claimedPlayersRef.current,
      ...[...sharedPlayersRef.current.values()].flat(),
    ];
    for (const p of all) {
      if (!seen.has(p.id)) { seen.add(p.id); merged.push(p); }
    }
    setPlayers(merged);
  }, []);

  useEffect(() => {
    if (!userId) return;

    const checkDone = () => {
      const { teams, leagues, players } = loadedRef.current;
      if (teams && leagues && players) setLoading(false);
    };

    // Merge owned + editor (coAdmin) + viewer teams.
    // Invited teams always sort first so newly accepted invites are immediately visible.
    let ownedTeams: Team[] = [];
    let coAdminTeams: Team[] = [];
    let viewerTeams: Team[] = [];
    let ownedLoaded = false;
    let coAdminLoaded = false;
    let viewerLoaded = false;

    const mergeTeams = () => {
      if (!ownedLoaded || !coAdminLoaded || !viewerLoaded) return;
      const seen = new Set<string>();
      const merged: Team[] = [];
      for (const t of [...coAdminTeams, ...viewerTeams]) {
        if (!seen.has(t.id)) { seen.add(t.id); merged.push(t); }
      }
      for (const t of ownedTeams) {
        if (!seen.has(t.id)) { seen.add(t.id); merged.push(t); }
      }
      // Filter out teams this user has hidden from their view
      setTeams(merged.filter((t) => !(t.hiddenFor ?? []).includes(userId)));
      loadedRef.current.teams = true;
      checkDone();
    };

    const unsubTeams = subscribeToTeams(userId, (t) => {
      ownedTeams = t;
      ownedLoaded = true;
      mergeTeams();
    });

    const unsubCoAdminTeams = subscribeToTeamsByCoAdmin(userId, (t) => {
      coAdminTeams = t;
      coAdminLoaded = true;
      mergeTeams();
    });

    const unsubViewerTeams = subscribeToTeamsByViewer(userId, (t) => {
      viewerTeams = t;
      viewerLoaded = true;
      mergeTeams();
    });

    const unsubLeagues = subscribeToLeagues(userId, (l) => {
      setLeagues(l);
      loadedRef.current.leagues = true;
      checkDone();
    });

    // Subscribe to players added by this user AND players claimed by this user
    const unsubOwned = subscribeToPlayers(userId, (ps) => {
      ownedPlayersRef.current = ps;
      mergeAllPlayers();
      loadedRef.current.players = true;
      checkDone();
    });
    const unsubClaimed = subscribeToClaimedPlayers(userId, (ps) => {
      claimedPlayersRef.current = ps;
      mergeAllPlayers();
      loadedRef.current.players = true;
      checkDone();
    });

    return () => {
      unsubTeams();
      unsubCoAdminTeams();
      unsubViewerTeams();
      unsubLeagues();
      unsubOwned();
      unsubClaimed();
    };
  }, [userId, mergeAllPlayers]);

  // Subscribe to players from shared teams (teams the current user doesn't own).
  // These players were added by the team owner and aren't in owned/claimed subscriptions.
  useEffect(() => {
    if (!userId) return;

    const sharedOwnerIds = new Set(
      teams.filter((t) => t.ownerId !== userId).map((t) => t.ownerId)
    );

    // Unsubscribe from owners whose teams are no longer shared with this user
    const currentOwnerIds = [...sharedPlayersRef.current.keys()];
    for (const ownerId of currentOwnerIds) {
      if (!sharedOwnerIds.has(ownerId)) {
        sharedPlayersRef.current.delete(ownerId);
      }
    }

    if (sharedOwnerIds.size === 0) {
      mergeAllPlayers();
      return;
    }

    const unsubs: Array<() => void> = [];
    for (const ownerId of sharedOwnerIds) {
      const unsub = subscribeToPlayers(ownerId, (ps) => {
        sharedPlayersRef.current.set(ownerId, ps);
        mergeAllPlayers();
      });
      unsubs.push(unsub);
    }

    return () => {
      unsubs.forEach((u) => u());
      // Keep sharedPlayersRef data so it's available until next effect run
    };
  }, [teams, userId, mergeAllPlayers]);

  // ── Teams ────────────────────────────────────────────────────────────────

  const createTeam = useCallback(
    (name: string, sport: Sport) => dbCreateTeam({ name, sport }, userId),
    [userId]
  );

  const renameTeam = useCallback(
    (teamId: string, name: string) => dbUpdateTeam(teamId, { name }),
    []
  );

  const removeTeam = useCallback((teamId: string) => {
    rotationCache.delete(teamId);
    return dbDeleteTeam(teamId);
  }, []);

  const hideTeam = useCallback(
    (teamId: string) => dbHideTeam(teamId, userId),
    [userId]
  );

  // ── Leagues ──────────────────────────────────────────────────────────────

  const createLeague = useCallback(
    (name: string, sport: Sport, season: string) =>
      dbCreateLeague({ name, sport, season }, userId),
    [userId]
  );

  const renameLeague = useCallback(
    (leagueId: string, name: string) => dbUpdateLeague(leagueId, { name }),
    []
  );

  const removeLeague = useCallback((leagueId: string) => dbDeleteLeague(leagueId), []);

  const addTeamToLeague = useCallback(async (leagueId: string, teamId: string) => {
    const league = leagues.find((l) => l.id === leagueId);
    if (!league) return;
    const teamIds = [...new Set([...league.teamIds, teamId])];
    await Promise.all([
      dbUpdateLeague(leagueId, { teamIds }),
      dbUpdateTeam(teamId, { leagueId }),
    ]);
  }, [leagues]);

  const removeTeamFromLeague = useCallback(async (leagueId: string, teamId: string) => {
    const league = leagues.find((l) => l.id === leagueId);
    if (!league) return;
    const teamIds = league.teamIds.filter((id) => id !== teamId);
    await Promise.all([
      dbUpdateLeague(leagueId, { teamIds }),
      dbUpdateTeam(teamId, { leagueId: null }),
    ]);
  }, [leagues]);

  // ── Players ──────────────────────────────────────────────────────────────

  const getTeamPlayers = useCallback(
    (teamId: string): Player[] => {
      const team = teams.find((t) => t.id === teamId);
      if (!team) return [];
      return team.playerIds
        .map((pid) => players.find((p) => p.id === pid))
        .filter((p): p is Player => !!p);
    },
    [teams, players]
  );

  const addPlayer = useCallback(
    async (teamId: string, name: string, number: string, extra?: Partial<Player>) => {
      const team = teams.find((t) => t.id === teamId);
      if (!team) return;
      const playerId = await dbCreatePlayer({
        name,
        number,
        addedBy: userId,
        visibility: 'private',
        ...extra,
      } as Omit<Player, 'id'>);
      const playerIds = [...team.playerIds, playerId];
      const battingOrder = [...team.battingOrder, playerId];
      rotationCache.delete(teamId);
      await dbUpdateTeam(teamId, { playerIds, battingOrder });
    },
    [teams, userId]
  );

  const bulkAddPlayers = useCallback(
    async (teamId: string, rows: Array<Partial<Omit<Player, 'id'>> & { name: string }>) => {
      const team = teams.find((t) => t.id === teamId);
      if (!team || rows.length === 0) return;
      const newIds = await Promise.all(
        rows.map((row) =>
          dbCreatePlayer({ visibility: 'private', number: '', ...row, addedBy: userId } as Omit<Player, 'id'>)
        )
      );
      const playerIds = [...team.playerIds, ...newIds];
      const battingOrder = [...team.battingOrder, ...newIds];
      rotationCache.delete(teamId);
      await dbUpdateTeam(teamId, { playerIds, battingOrder });
    },
    [teams, userId]
  );

  const removePlayerFromTeam = useCallback(
    async (teamId: string, playerId: string) => {
      const team = teams.find((t) => t.id === teamId);
      if (!team) return;
      const playerIds = team.playerIds.filter((id) => id !== playerId);
      const battingOrder = team.battingOrder.filter((id) => id !== playerId);
      rotationCache.delete(teamId);
      await dbUpdateTeam(teamId, { playerIds, battingOrder });
    },
    [teams]
  );

  const updatePlayer = useCallback(
    (playerId: string, data: Partial<Omit<Player, 'id'>>) => dbUpdatePlayer(playerId, data),
    []
  );

  const claimPlayer = useCallback(
    (playerId: string) => dbClaimPlayer(playerId, userId),
    [userId]
  );

  const linkAsGuardian = useCallback(
    (playerId: string) => dbLinkAsGuardian(playerId, userId),
    [userId]
  );

  // ── Batting order ─────────────────────────────────────────────────────────

  const moveBattingOrder = useCallback(
    async (teamId: string, fromIndex: number, toIndex: number) => {
      const team = teams.find((t) => t.id === teamId);
      if (!team) return;
      const battingOrder = [...team.battingOrder];
      const [moved] = battingOrder.splice(fromIndex, 1);
      battingOrder.splice(toIndex, 0, moved);
      await dbUpdateTeam(teamId, { battingOrder });
    },
    [teams]
  );

  // ── Availability ─────────────────────────────────────────────────────────────

  const togglePlayerAbsence = useCallback(
    async (teamId: string, playerId: string) => {
      const team = teams.find((t) => t.id === teamId);
      if (!team) return;
      const absent = team.absentPlayerIds ?? [];
      const absentPlayerIds = absent.includes(playerId)
        ? absent.filter((id) => id !== playerId)
        : [...absent, playerId];
      rotationCache.delete(teamId);
      await dbUpdateTeam(teamId, { absentPlayerIds });
    },
    [teams]
  );

  // ── Rotation ──────────────────────────────────────────────────────────────

  const getRotation = useCallback(
    (teamId: string): PositionRotation => {
      if (rotationCache.has(teamId)) return rotationCache.get(teamId)!;
      const team = teams.find((t) => t.id === teamId);
      if (!team) return {};
      const teamPlayers = getTeamPlayers(teamId);
      const absent = team.absentPlayerIds ?? [];
      const activePlayers = teamPlayers.filter((p) => !absent.includes(p.id));
      if (activePlayers.length < 9) return {};
      const rotation = generateRotation(activePlayers, team.innings);
      rotationCache.set(teamId, rotation);
      return rotation;
    },
    [teams, getTeamPlayers]
  );

  const regenerateRotation = useCallback(
    (teamId: string) => {
      rotationCache.delete(teamId);
      const team = teams.find((t) => t.id === teamId);
      if (!team) return;
      const teamPlayers = getTeamPlayers(teamId);
      const absent = team.absentPlayerIds ?? [];
      const activePlayers = teamPlayers.filter((p) => !absent.includes(p.id));
      if (activePlayers.length < 9) return;
      rotationCache.set(teamId, generateRotation(activePlayers, team.innings));
    },
    [teams, getTeamPlayers]
  );

  const setInnings = useCallback(
    async (teamId: string, n: number) => {
      rotationCache.delete(teamId);
      await dbUpdateTeam(teamId, { innings: n });
    },
    []
  );

  return (
    <AppContext.Provider
      value={{
        teams,
        leagues,
        players,
        loading,
        createTeam,
        renameTeam,
        removeTeam,
        hideTeam,
        createLeague,
        renameLeague,
        removeLeague,
        addTeamToLeague,
        removeTeamFromLeague,
        getTeamPlayers,
        addPlayer,
        bulkAddPlayers,
        removePlayerFromTeam,
        updatePlayer,
        claimPlayer,
        linkAsGuardian,
        moveBattingOrder,
        togglePlayerAbsence,
        setInnings,
        getRotation,
        regenerateRotation,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used inside AppProvider');
  return ctx;
}
