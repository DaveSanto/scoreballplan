import { ALL_POSITIONS, InningAssignment, Player, Position, POSITIONS_BY_FIELD_COUNT, PositionRotation } from '../types';

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function assignInning(
  activePlayers: Player[],
  prev: InningAssignment,
  availablePositions: Position[] = ALL_POSITIONS
): InningAssignment {
  const positions = shuffle([...availablePositions]);
  const ids = activePlayers.map((p) => p.id);
  const assignment: InningAssignment = {};

  ids.forEach((id, i) => {
    if (i < positions.length) assignment[id] = positions[i];
  });

  // Resolve back-to-back conflicts via swaps
  for (let pass = 0; pass < 20; pass++) {
    let resolved = true;
    for (let i = 0; i < ids.length; i++) {
      const posI = assignment[ids[i]];
      if (posI && prev[ids[i]] && prev[ids[i]] === posI) {
        resolved = false;
        for (let j = 0; j < ids.length; j++) {
          if (i === j) continue;
          const posJ = assignment[ids[j]];
          if (posI && posJ && prev[ids[i]] !== posJ && prev[ids[j]] !== posI) {
            assignment[ids[i]] = posJ;
            assignment[ids[j]] = posI;
            break;
          }
        }
      }
    }
    if (resolved) break;
  }

  return assignment;
}

export function generateRotation(
  players: Player[],
  innings: number,
  lockedCells?: Record<string, Position | 'BENCH'>,
  fieldPlayerCount = 9
): PositionRotation {
  if (players.length < 1) return {};
  const fieldPositions = POSITIONS_BY_FIELD_COUNT[fieldPlayerCount] ?? ALL_POSITIONS;

  const rotation: PositionRotation = {};
  const benchCount: Record<string, number> = {};
  players.forEach((p) => (benchCount[p.id] = 0));
  let prev: InningAssignment = {};

  for (let inning = 1; inning <= innings; inning++) {
    // Parse locked assignments for this inning
    const lockedThisInning = new Map<string, Position | 'BENCH'>();
    if (lockedCells) {
      for (const [key, val] of Object.entries(lockedCells)) {
        const dashIdx = key.lastIndexOf('-');
        const pid = key.slice(0, dashIdx);
        const inn = parseInt(key.slice(dashIdx + 1), 10);
        if (inn === inning) lockedThisInning.set(pid, val);
      }
    }

    // Collect field positions already taken by locked players
    const lockedFieldPositions = new Set<Position>();
    for (const [, val] of lockedThisInning.entries()) {
      if (val !== 'BENCH') lockedFieldPositions.add(val as Position);
    }

    // Accrue bench counts for locked-bench players
    for (const [pid, val] of lockedThisInning.entries()) {
      if (val === 'BENCH') benchCount[pid]++;
    }

    const unlockedPlayers = players.filter((p) => !lockedThisInning.has(p.id));
    const fieldSlotsLeft = Math.max(0, fieldPlayerCount - lockedFieldPositions.size);
    const availPositions = fieldPositions.filter((p) => !lockedFieldPositions.has(p));

    let activePlayers: Player[];

    if (unlockedPlayers.length <= fieldSlotsLeft) {
      activePlayers = unlockedPlayers;
    } else {
      const sorted = [...unlockedPlayers].sort((a, b) => benchCount[a.id] - benchCount[b.id]);
      const toBench = unlockedPlayers.length - fieldSlotsLeft;
      const benched = sorted.slice(0, toBench).map((p) => p.id);
      benched.forEach((id) => benchCount[id]++);
      activePlayers = unlockedPlayers.filter((p) => !benched.includes(p.id));
    }

    const unlockedAssignment = assignInning(activePlayers, prev, availPositions);

    const assignment: InningAssignment = {};
    for (const [pid, pos] of lockedThisInning.entries()) {
      if (pos !== 'BENCH') assignment[pid] = pos as Position;
    }
    for (const [pid, pos] of Object.entries(unlockedAssignment)) {
      assignment[pid] = pos;
    }

    prev = assignment;
    rotation[inning] = assignment;
  }

  return rotation;
}

export function getPositionForPlayer(
  rotation: PositionRotation,
  inning: number,
  playerId: string
): Position | 'BENCH' | '—' {
  const inningData = rotation[inning];
  if (!inningData) return '—';
  return inningData[playerId] ?? 'BENCH';
}
