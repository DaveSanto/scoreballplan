import { GameSlot, Schedule, ScheduledGame, TeamScheduleStats } from '../types';

export type SchedulerTeam = {
  id: string;
  name: string;
  isStrong?: boolean;
  homeTarget?: number;
  awayTarget?: number;
};

export type SchedulerConfig = {
  swampGamesPerTeam?: number;
  allowDoubleheaders?: boolean;
};

export type ScheduleResult = Schedule & { error?: boolean };

// ── Helpers ───────────────────────────────────────────────────────────────────

function shuffleIndices(n: number): number[] {
  const arr = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// ── Score function ────────────────────────────────────────────────────────────

function scoreAssignment(
  assignment: number[],   // assignment[slotIdx] = matchupIdx
  flips: boolean[],       // flips[slotIdx] = true means teamB is home
  matchups: [string, string][],
  slots: GameSlot[],
  teams: SchedulerTeam[],
  config: SchedulerConfig
): number {
  const swampTarget = config.swampGamesPerTeam ?? 0;
  let penalty = 0;

  // Same-time conflict detection
  const buckets: Record<string, string[]> = {};
  assignment.forEach((mIdx, sIdx) => {
    const slot = slots[sIdx];
    const [a, b] = matchups[mIdx];
    const homeId = flips[sIdx] ? b : a;
    const awayId = flips[sIdx] ? a : b;
    const key = `${slot.date}|${slot.startTime}`;
    if (!buckets[key]) buckets[key] = [];
    buckets[key].push(homeId, awayId);
  });

  Object.values(buckets).forEach((ids) => {
    const seen: Record<string, number> = {};
    ids.forEach((id) => { seen[id] = (seen[id] ?? 0) + 1; });
    Object.values(seen).forEach((c) => { if (c > 1) penalty += (c - 1) * 5000; });
  });

  // Per-team accumulators
  const home: Record<string, number> = {};
  const away: Record<string, number> = {};
  const swamp: Record<string, number> = {};
  const at630: Record<string, number> = {};

  teams.forEach(({ id }) => { home[id] = away[id] = swamp[id] = at630[id] = 0; });

  assignment.forEach((mIdx, sIdx) => {
    const slot = slots[sIdx];
    const [a, b] = matchups[mIdx];
    const hId = flips[sIdx] ? b : a;
    const aId = flips[sIdx] ? a : b;

    home[hId] = (home[hId] ?? 0) + 1;
    away[aId] = (away[aId] ?? 0) + 1;
    if (slot.isSwamp) {
      swamp[hId] = (swamp[hId] ?? 0) + 1;
      swamp[aId] = (swamp[aId] ?? 0) + 1;
    }
    if (slot.startTime === '6:30 PM') {
      at630[hId] = (at630[hId] ?? 0) + 1;
      at630[aId] = (at630[aId] ?? 0) + 1;
    }
  });

  // Swamp constraint
  if (swampTarget > 0) {
    teams.forEach(({ id }) => {
      penalty += ((swamp[id] ?? 0) - swampTarget) ** 2 * 800;
    });
  }

  teams.forEach((t) => {
    const h = home[t.id] ?? 0;
    const aw = away[t.id] ?? 0;
    const total = h + aw;
    if (total === 0) return;

    // Home/away balance
    if (t.isStrong && t.homeTarget != null && t.awayTarget != null) {
      penalty += (h - t.homeTarget) ** 2 * 100;
      penalty += (aw - t.awayTarget) ** 2 * 100;
    } else {
      penalty += (h - aw) ** 2 * 30;
    }

    // Time-slot balance (prefer equal 6:30 / 8:15 splits)
    const at8 = total - (at630[t.id] ?? 0);
    penalty += ((at630[t.id] ?? 0) - at8) ** 2 * 8;
  });

  return penalty;
}

// ── Main generator ────────────────────────────────────────────────────────────

export function generateSchedule(
  teams: SchedulerTeam[],
  slots: GameSlot[],
  config: SchedulerConfig = {}
): ScheduleResult {
  const regularSlots = slots.filter((s) => !s.isMakeup && !s.isPlayoff);

  // Generate all round-robin matchups
  const matchups: [string, string][] = [];
  for (let i = 0; i < teams.length; i++) {
    for (let j = i + 1; j < teams.length; j++) {
      matchups.push([teams[i].id, teams[j].id]);
    }
  }

  if (teams.length < 2) {
    return { games: [], warnings: ['Need at least 2 teams.'], stats: [], generatedAt: new Date().toISOString(), error: true };
  }
  if (regularSlots.length < matchups.length) {
    return {
      games: [],
      warnings: [`Not enough slots: need ${matchups.length} for a full round-robin, have ${regularSlots.length}.`],
      stats: [],
      generatedAt: new Date().toISOString(),
      error: true,
    };
  }

  const n = matchups.length;
  const activeSlots = regularSlots.slice(0, n);

  // Initial random assignment
  let assignment = shuffleIndices(n);
  let flips = Array.from({ length: n }, () => Math.random() < 0.5);

  let currentScore = scoreAssignment(assignment, flips, matchups, activeSlots, teams, config);
  let bestAssignment = [...assignment];
  let bestFlips = [...flips];
  let bestScore = currentScore;

  // Simulated annealing
  let T = 100.0;
  const T_DECAY = 0.999993;
  const ITERATIONS = 1_200_000;

  for (let iter = 0; iter < ITERATIONS; iter++) {
    T *= T_DECAY;

    const newA = [...assignment];
    const newF = [...flips];
    const r = Math.random();

    if (r < 0.55) {
      // Swap two slot assignments
      const i = Math.floor(Math.random() * n);
      const j = Math.floor(Math.random() * n);
      [newA[i], newA[j]] = [newA[j], newA[i]];
    } else if (r < 0.85) {
      // Flip home/away for one slot
      const i = Math.floor(Math.random() * n);
      newF[i] = !newF[i];
    } else {
      // Swap + flip
      const i = Math.floor(Math.random() * n);
      const j = Math.floor(Math.random() * n);
      [newA[i], newA[j]] = [newA[j], newA[i]];
      newF[Math.floor(Math.random() * n)] = !newF[Math.floor(Math.random() * n)];
    }

    const newScore = scoreAssignment(newA, newF, matchups, activeSlots, teams, config);
    const delta = newScore - currentScore;

    if (delta < 0 || Math.random() < Math.exp(-delta / Math.max(T, 1e-6))) {
      assignment = newA;
      flips = newF;
      currentScore = newScore;
      if (currentScore < bestScore) {
        bestScore = currentScore;
        bestAssignment = [...assignment];
        bestFlips = [...flips];
      }
    }
  }

  // Build output
  const teamMap = Object.fromEntries(teams.map((t) => [t.id, t.name]));

  const games: ScheduledGame[] = bestAssignment.map((mIdx, sIdx) => {
    const slot = activeSlots[sIdx];
    const [a, b] = matchups[mIdx];
    const homeId = bestFlips[sIdx] ? b : a;
    const awayId = bestFlips[sIdx] ? a : b;
    return {
      slotId: slot.id,
      date: slot.date,
      field: slot.field,
      gameNumber: slot.gameNumber,
      startTime: slot.startTime,
      isSwamp: slot.isSwamp,
      homeId,
      home: teamMap[homeId] ?? homeId,
      awayId,
      away: teamMap[awayId] ?? awayId,
      isMakeup: false,
      isPlayoff: false,
    };
  });

  // Sort by date → startTime → field
  games.sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? -1 : 1;
    if (a.startTime !== b.startTime) return a.startTime < b.startTime ? -1 : 1;
    return a.field.localeCompare(b.field);
  });

  // Stats
  const statsMap: Record<string, TeamScheduleStats> = {};
  teams.forEach((t) => {
    statsMap[t.id] = { teamId: t.id, teamName: t.name, totalGames: 0, homeGames: 0, awayGames: 0, swampGames: 0, gamesAt630: 0, gamesAt815: 0 };
  });

  games.forEach((g) => {
    const h = statsMap[g.homeId];
    const aw = statsMap[g.awayId];
    if (h) { h.totalGames++; h.homeGames++; if (g.isSwamp) h.swampGames++; if (g.startTime === '6:30 PM') h.gamesAt630++; else h.gamesAt815++; }
    if (aw) { aw.totalGames++; aw.awayGames++; if (g.isSwamp) aw.swampGames++; if (g.startTime === '6:30 PM') aw.gamesAt630++; else aw.gamesAt815++; }
  });

  // Warnings
  const warnings: string[] = [];
  const dateTeams: Record<string, Record<string, number>> = {};
  games.forEach((g) => {
    if (!dateTeams[g.date]) dateTeams[g.date] = {};
    dateTeams[g.date][g.homeId] = (dateTeams[g.date][g.homeId] ?? 0) + 1;
    dateTeams[g.date][g.awayId] = (dateTeams[g.date][g.awayId] ?? 0) + 1;
  });
  Object.entries(dateTeams).forEach(([date, counts]) => {
    Object.entries(counts).forEach(([id, count]) => {
      if (count > 1) warnings.push(`${teamMap[id] ?? id} has a doubleheader on ${date}`);
    });
  });

  return {
    games,
    warnings,
    stats: Object.values(statsMap),
    generatedAt: new Date().toISOString(),
    error: false,
  };
}

// ── Validation ────────────────────────────────────────────────────────────────

export function validateSchedule(games: ScheduledGame[], teams: SchedulerTeam[]): string[] {
  const issues: string[] = [];
  const n = teams.length;
  const expected = (n * (n - 1)) / 2;

  if (games.length !== expected) {
    issues.push(`Expected ${expected} games, found ${games.length}`);
  }

  // Check all matchups exist
  const seen = new Set<string>();
  games.forEach((g) => {
    const key = [g.homeId, g.awayId].sort().join('|');
    if (seen.has(key)) issues.push(`Duplicate matchup: ${g.home} vs ${g.away}`);
    seen.add(key);
  });

  // Same-time conflicts
  const buckets: Record<string, string[]> = {};
  games.forEach((g) => {
    const key = `${g.date}|${g.startTime}`;
    if (!buckets[key]) buckets[key] = [];
    if (buckets[key].includes(g.homeId) || buckets[key].includes(g.awayId)) {
      issues.push(`Same-time conflict on ${g.date} at ${g.startTime}: ${g.home} vs ${g.away}`);
    }
    buckets[key].push(g.homeId, g.awayId);
  });

  return issues;
}
