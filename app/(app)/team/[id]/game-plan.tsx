import { Ionicons } from '@expo/vector-icons';
import { router, useGlobalSearchParams } from 'expo-router';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useApp } from '../../../../src/store/AppContext';
import { useAuth } from '../../../../src/store/AuthContext';
import { BattingOrderView } from '../../../../src/components/BattingOrderView';
import { createScorecard, subscribeToTeamGames, updateTeamGame } from '../../../../src/firebase/db';
import { ALL_POSITIONS, POSITIONS_BY_FIELD_COUNT, Player, Position, PositionRotation, TeamGame } from '../../../../src/types';
import { generateRotation } from '../../../../src/utils/rotation';

// ── Helpers ───────────────────────────────────────────────────────────────────

const POSITION_OPTIONS: Array<Position | 'BENCH'> = ['BENCH', ...ALL_POSITIONS];
const INNING_OPTIONS = [4, 5, 6, 7, 8, 9];

function buildCells(
  rotation: PositionRotation,
  players: Player[],
  innings: number
): Record<string, Position | 'BENCH'> {
  const result: Record<string, Position | 'BENCH'> = {};
  for (let inning = 1; inning <= innings; inning++) {
    for (const player of players) {
      const key = `${player.id}-${inning}`;
      result[key] = rotation[inning]?.[player.id] ?? 'BENCH';
    }
  }
  return result;
}

function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function formatGameLabel(game: TeamGame, teamName: string): string {
  const d = new Date(game.date + 'T12:00:00');
  const datePart = isNaN(d.getTime())
    ? game.date
    : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const matchup = game.isHome === true
    ? `${teamName} vs. ${game.opponent}`
    : game.isHome === false
    ? `${teamName} @ ${game.opponent}`
    : `${teamName} vs. ${game.opponent} (TBD)`;
  const typePart = (game.gameType && game.gameType !== 'Regular Season') ? ` · ${game.gameType}` : '';
  return `${datePart} · ${matchup}${typePart}`;
}

type Tab = 'order' | 'rotation';

// ── Main screen ───────────────────────────────────────────────────────────────

export default function GamePlanScreen() {
  const { id: teamId } = useGlobalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const { teams, getTeamPlayers, moveBattingOrder, setInnings, getEffectiveRules } = useApp();
  const team = teams.find((t) => t.id === teamId);

  const [activeTab, setActiveTab] = useState<Tab>('order');
  const [games, setGames] = useState<TeamGame[]>([]);
  const [selectedGameId, setSelectedGameId] = useState<string | 'impromptu' | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [startingScorecard, setStartingScorecard] = useState(false);
  const [benchedIds, setBenchedIds] = useState<string[]>([]);

  useEffect(() => {
    if (!teamId) return;
    return subscribeToTeamGames(teamId, (g) =>
      setGames(g.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()))
    );
  }, [teamId]);

  // Sync bench state when selected game changes
  useEffect(() => {
    const game = games.find((g) => g.id === selectedGameId);
    setBenchedIds(game?.benchedPlayerIds ?? []);
  }, [selectedGameId, games]);

  if (!team) {
    return <View style={styles.loader}><ActivityIndicator color="#1a5c2e" /></View>;
  }

  const rules = getEffectiveRules(teamId);
  const teamPlayers = getTeamPlayers(teamId);
  const isAdmin = user?.uid === team.ownerId || (team.coAdminIds ?? []).includes(user?.uid ?? '');
  const today = todayISO();
  const selectedGame = games.find((g) => g.id === selectedGameId);
  const absent = selectedGame?.absentPlayerIds ?? team.absentPlayerIds ?? [];
  // activePlayers excludes both absent (pre-game) and benched (in-game)
  const activePlayers = team.battingOrder
    .map((id) => teamPlayers.find((p) => p.id === id))
    .filter((p): p is Player => !!p && !absent.includes(p.id) && !benchedIds.includes(p.id));

  async function toggleBench(playerId: string) {
    const next = benchedIds.includes(playerId)
      ? benchedIds.filter((id) => id !== playerId)
      : [...benchedIds, playerId];
    setBenchedIds(next);
    if (selectedGameId && selectedGameId !== 'impromptu') {
      await updateTeamGame(teamId, selectedGameId, { benchedPlayerIds: next });
    }
  }

  async function handleStartScorecard() {
    if (!user || !selectedGameId || startingScorecard) return;
    setStartingScorecard(true);
    try {
      const battingOrder = activePlayers.map((p) => ({
        id: p.id,
        name: p.name,
        number: p.number,
      }));
      const id = await createScorecard(user.uid, {
        teamId,
        gameId: selectedGameId === 'impromptu' ? undefined : selectedGameId,
        date: selectedGame?.date ?? today,
        opponent: selectedGame?.opponent ?? 'Scrimmage',
        isHome: selectedGame?.isHome ?? true,
        battingOrder,
        maxInnings: team!.innings,
      });
      router.push(`/(app)/scorecard/${id}`);
    } catch {
      Alert.alert('Error', 'Could not start scoresheet. Please try again.');
    } finally {
      setStartingScorecard(false);
    }
  }

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>

      {/* ── Game selector ── */}
      <View style={styles.selectorWrapper}>
        <Pressable style={styles.selectorBtn} onPress={() => setPickerOpen((o) => !o)}>
          <Ionicons name="calendar-outline" size={15} color="#1a5c2e" />
          <Text style={styles.selectorText} numberOfLines={1}>
            {selectedGameId === 'impromptu'
              ? 'Impromptu Game / Scrimmage'
              : selectedGame
              ? formatGameLabel(selectedGame, team.name)
              : 'Select a game…'}
          </Text>
          <Ionicons name={pickerOpen ? 'chevron-up' : 'chevron-down'} size={14} color="#888" />
        </Pressable>

        {pickerOpen && (
          <View style={styles.picker}>
            <ScrollView style={{ maxHeight: 232 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              {games.length === 0 && (
                <Text style={styles.pickerEmpty}>No games on schedule yet.</Text>
              )}
              {games.map((game) => {
                const isPast = game.date < today;
                const isSelected = game.id === selectedGameId;
                return (
                  <Pressable
                    key={game.id}
                    style={[styles.pickerRow, isSelected && styles.pickerRowActive]}
                    onPress={() => { setSelectedGameId(game.id); setPickerOpen(false); }}
                  >
                    <Text style={[
                      styles.pickerLabel,
                      isPast && styles.pickerLabelPast,
                      isSelected && styles.pickerLabelActive,
                    ]}>
                      {formatGameLabel(game, team.name)}
                    </Text>
                    {isPast && !isSelected && (
                      <Text style={styles.pickerPastTag}>Past</Text>
                    )}
                    {isSelected && <Ionicons name="checkmark" size={14} color="#1a5c2e" />}
                  </Pressable>
                );
              })}
              <Pressable
                style={[styles.pickerRow, styles.pickerImpromptuRow, selectedGameId === 'impromptu' && styles.pickerRowActive]}
                onPress={() => { setSelectedGameId('impromptu'); setPickerOpen(false); }}
              >
                <Ionicons name="flash-outline" size={14} color={selectedGameId === 'impromptu' ? '#1a5c2e' : '#aaa'} />
                <Text style={[styles.pickerLabel, styles.pickerImpromptuLabel, selectedGameId === 'impromptu' && styles.pickerLabelActive]}>
                  Impromptu Game / Scrimmage
                </Text>
                {selectedGameId === 'impromptu' && <Ionicons name="checkmark" size={14} color="#1a5c2e" />}
              </Pressable>
            </ScrollView>
          </View>
        )}
      </View>

      {/* ── Hint ── */}
      <View style={styles.hintBox}>
        <Text style={styles.hintText}>
          {isAdmin
            ? 'Select a game then set your Batting order and line up here based on who is available. In the positions tab, set positions for each player.'
            : 'Check the batting order and where you\'ll be playing.'}
        </Text>
      </View>

      {/* ── Sub-tabs ── */}
      <View style={styles.tabs}>
        {(['order', 'rotation'] as Tab[]).map((t) => (
          <Pressable
            key={t}
            style={[styles.tab, activeTab === t && styles.tabActive]}
            onPress={() => setActiveTab(t)}
          >
            <Text style={[styles.tabText, activeTab === t && styles.tabTextActive]}>
              {t === 'order' ? 'Batting Order' : 'Positions'}
            </Text>
          </Pressable>
        ))}
      </View>

      {activeTab === 'order' ? (
        <BattingOrderView
          players={activePlayers}
          allPlayers={teamPlayers}
          battingOrder={team.battingOrder}
          absentIds={absent}
          benchedIds={benchedIds}
          isAdmin={isAdmin}
          onMove={(from, to) => moveBattingOrder(teamId, from, to)}
          onToggleBench={toggleBench}
        />
      ) : (
        <RotationView
          activePlayers={activePlayers}
          innings={team.innings}
          fieldPlayerCount={rules.fieldPlayerCount}
          onSetInnings={(n) => setInnings(teamId, n)}
        />
      )}

      {/* ── Start Scoresheet footer ── */}
      {selectedGameId && (
        <View style={styles.scoresheetFooter}>
          <Pressable
            style={[styles.scoresheetBtn, startingScorecard && styles.disabled]}
            onPress={handleStartScorecard}
            disabled={startingScorecard}
          >
            {startingScorecard
              ? <ActivityIndicator color="#fff" size="small" />
              : <>
                  <Ionicons name="document-text-outline" size={18} color="#fff" />
                  <Text style={styles.scoresheetBtnText}>Start Scoresheet</Text>
                </>
            }
          </Pressable>
        </View>
      )}
    </SafeAreaView>
  );
}

// ── Position Cell ─────────────────────────────────────────────────────────────

function PositionCell({
  value,
  isLocked,
  isDuplicate,
  onChange,
  onToggleLock,
}: {
  value: Position | 'BENCH';
  isLocked: boolean;
  isDuplicate: boolean;
  onChange: (val: Position | 'BENCH') => void;
  onToggleLock: () => void;
}) {
  const isBench = value === 'BENCH';
  const cellStyle = [
    styles.gridCell,
    styles.gridPosCell,
    isBench && styles.benchCell,
    isLocked && styles.cellLocked,
    isDuplicate && styles.cellDuplicate,
  ];

  function showNativePicker() {
    Alert.alert('Select Position', undefined, [
      ...POSITION_OPTIONS.map((pos) => ({ text: pos, onPress: () => onChange(pos) })),
      { text: 'Cancel', style: 'cancel' as const },
    ]);
  }

  return (
    <View style={cellStyle}>
      <Text style={[styles.posText, isBench && styles.benchText, isDuplicate && styles.posTextDuplicate]}>
        {value}
      </Text>

      {Platform.OS === 'web' ? (
        // @ts-ignore
        <select
          value={value}
          onChange={(e: any) => onChange(e.target.value as Position | 'BENCH')}
          style={{
            position: 'absolute' as any,
            top: 0, left: 0, right: 18, bottom: 0,
            opacity: 0, cursor: 'pointer', zIndex: 1,
          }}
        >
          {POSITION_OPTIONS.map((pos) => (
            // @ts-ignore
            <option key={pos} value={pos}>{pos}</option>
          ))}
        </select>
      ) : (
        <Pressable style={StyleSheet.absoluteFill} onPress={showNativePicker} />
      )}

      <Pressable style={styles.lockBtn} onPress={onToggleLock} hitSlop={6}>
        <Ionicons
          name={isLocked ? 'lock-closed' : 'lock-open-outline'}
          size={10}
          color={isLocked ? '#1a5c2e' : '#bbb'}
        />
      </Pressable>
    </View>
  );
}

// ── Rotation view ─────────────────────────────────────────────────────────────

function RotationView({
  activePlayers,
  innings,
  fieldPlayerCount = 9,
  onSetInnings,
}: {
  activePlayers: Player[];
  innings: number;
  fieldPlayerCount?: number;
  onSetInnings: (n: number) => void;
}) {
  const [cells, setCells] = useState<Record<string, Position | 'BENCH'>>({});
  const [locked, setLocked] = useState<Set<string>>(new Set());

  const lockedRef = useRef(locked);
  lockedRef.current = locked;
  const cellsRef = useRef(cells);
  cellsRef.current = cells;

  const activePlayerIds = activePlayers.map((p) => p.id).join(',');
  const prevActiveIdsRef = useRef<string | null>(null);
  const prevInningsRef = useRef<number | null>(null);
  const prevFieldPlayerCountRef = useRef<number | null>(null);

  useEffect(() => {
    const playersChanged = prevActiveIdsRef.current !== null && prevActiveIdsRef.current !== activePlayerIds;
    const isFirstRender = prevActiveIdsRef.current === null;
    const inningsChanged = prevInningsRef.current !== null && prevInningsRef.current !== innings;
    const fieldCountChanged = prevFieldPlayerCountRef.current !== null && prevFieldPlayerCountRef.current !== fieldPlayerCount;
    const prevInnings = prevInningsRef.current ?? innings;

    prevActiveIdsRef.current = activePlayerIds;
    prevInningsRef.current = innings;
    prevFieldPlayerCountRef.current = fieldPlayerCount;

    if (activePlayers.length < 1) {
      setCells({});
      if (playersChanged || isFirstRender) setLocked(new Set());
      return;
    }

    // Players changed or field count changed or first render → full randomize reset
    if (isFirstRender || playersChanged || fieldCountChanged) {
      setLocked(new Set());
      const rotation = generateRotation(activePlayers, innings, undefined, fieldPlayerCount);
      setCells(buildCells(rotation, activePlayers, innings));
      return;
    }

    // Innings decreased → just trim existing cells and locked set, no randomization
    if (inningsChanged && innings < prevInnings) {
      setCells((prev) => {
        const trimmed: Record<string, Position | 'BENCH'> = {};
        for (const [key, val] of Object.entries(prev)) {
          const inning = parseInt(key.slice(key.lastIndexOf('-') + 1), 10);
          if (inning <= innings) trimmed[key] = val;
        }
        return trimmed;
      });
      setLocked((prev) => {
        const trimmed = new Set<string>();
        for (const key of prev) {
          const inning = parseInt(key.slice(key.lastIndexOf('-') + 1), 10);
          if (inning <= innings) trimmed.add(key);
        }
        return trimmed;
      });
      return;
    }

    // Innings increased → fill new innings using generateRotation with ALL existing cells locked
    if (inningsChanged && innings > prevInnings) {
      const existingCells = cellsRef.current;
      const lockedCells: Record<string, Position | 'BENCH'> = { ...existingCells };
      const rotation = generateRotation(activePlayers, innings, lockedCells, fieldPlayerCount);
      const newCells = buildCells(rotation, activePlayers, innings);
      // Overlay existing cells so nothing already set ever changes
      Object.assign(newCells, existingCells);
      setCells(newCells);
      return;
    }

    // No structural change (e.g. re-render with same deps) → no-op
  }, [activePlayerIds, innings, fieldPlayerCount]); // eslint-disable-line react-hooks/exhaustive-deps

  const duplicates = useMemo(() => {
    const dupes = new Set<string>();
    for (let inning = 1; inning <= innings; inning++) {
      const posMap = new Map<string, string[]>();
      for (const player of activePlayers) {
        const key = `${player.id}-${inning}`;
        const val = cells[key];
        if (val && val !== 'BENCH') {
          if (!posMap.has(val)) posMap.set(val, []);
          posMap.get(val)!.push(player.id);
        }
      }
      for (const [, pids] of posMap.entries()) {
        if (pids.length > 1) pids.forEach((pid) => dupes.add(`${pid}-${inning}`));
      }
    }
    return dupes;
  }, [cells, activePlayers, innings]);

  const hasDuplicates = duplicates.size > 0;
  const inningNumbers = Array.from({ length: innings }, (_, i) => i + 1);

  const missingByInning = useMemo(() => {
    const expected = POSITIONS_BY_FIELD_COUNT[fieldPlayerCount] ?? ALL_POSITIONS;
    return inningNumbers.map((inning) => {
      const assigned = new Set(
        activePlayers
          .map((p) => cells[`${p.id}-${inning}`])
          .filter((v): v is Position => !!v && v !== 'BENCH')
      );
      return expected.filter((pos) => !assigned.has(pos));
    });
  }, [cells, activePlayers, innings, fieldPlayerCount]); // eslint-disable-line react-hooks/exhaustive-deps

  function handleCellChange(key: string, val: Position | 'BENCH') {
    setCells((prev) => ({ ...prev, [key]: val }));
  }

  function handleToggleLock(key: string) {
    setLocked((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }

  function handleRandomize() {
    const lockedCells: Record<string, Position | 'BENCH'> = {};
    for (const key of locked) {
      if (cells[key] !== undefined) lockedCells[key] = cells[key];
    }
    const rotation = generateRotation(
      activePlayers,
      innings,
      Object.keys(lockedCells).length > 0 ? lockedCells : undefined,
      fieldPlayerCount
    );
    const newCells = buildCells(rotation, activePlayers, innings);
    for (const key of locked) {
      if (lockedCells[key] !== undefined) newCells[key] = lockedCells[key];
    }
    setCells(newCells);
  }

  if (activePlayers.length === 0) {
    return (
      <View style={styles.empty}>
        <Ionicons name="people-outline" size={48} color="#ccc" />
        <Text style={styles.emptyText}>No active players. Manage availability in the Schedule tab.</Text>
      </View>
    );
  }

  return (
    <View style={styles.rotationContainer}>
      <View style={styles.controls}>
        <View style={styles.inningsControl}>
          <Text style={styles.controlLabel}>Innings</Text>
          <View style={styles.inningsPicker}>
            {INNING_OPTIONS.map((n) => (
              <Pressable
                key={n}
                style={[styles.inningChip, innings === n && styles.inningChipActive]}
                onPress={() => onSetInnings(n)}
              >
                <Text style={[styles.inningChipText, innings === n && styles.inningChipTextActive]}>
                  {n}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
        <View style={styles.rotationMeta}>
          <Text style={styles.activeCount}>{activePlayers.length} active</Text>
          {locked.size > 0 && (
            <Pressable style={styles.unlockBtn} onPress={() => setLocked(new Set())}>
              <Ionicons name="lock-open-outline" size={13} color="#666" />
              <Text style={styles.unlockBtnText}>Unlock All</Text>
            </Pressable>
          )}
          <Pressable style={styles.regenBtn} onPress={handleRandomize}>
            <Ionicons name="shuffle" size={16} color="#1a5c2e" />
            <Text style={styles.regenText}>Randomize Positions</Text>
          </Pressable>
          {hasDuplicates && (
            <View style={styles.errorBadge}>
              <Ionicons name="alert-circle" size={13} color="#c0392b" />
              <Text style={styles.errorText}>Duplicate positions</Text>
            </View>
          )}
        </View>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <ScrollView showsVerticalScrollIndicator={false}>
          <View style={styles.grid}>
            <View style={styles.gridRow}>
              <View style={[styles.gridCell, styles.gridHeaderName]}>
                <Text style={styles.gridHeaderText}>Player</Text>
              </View>
              {inningNumbers.map((n) => (
                <View key={n} style={[styles.gridCell, styles.gridHeaderInning]}>
                  <Text style={styles.gridHeaderText}>Inn {n}</Text>
                </View>
              ))}
            </View>
            {activePlayers.map((player, rowIndex) => (
              <View key={player.id} style={[styles.gridRow, rowIndex % 2 === 1 && styles.gridRowAlt]}>
                <View style={[styles.gridCell, styles.gridPlayerName]}>
                  <Text style={styles.gridPlayerText} numberOfLines={1}>
                    {player.name.split(' ')[0]}
                  </Text>
                </View>
                {inningNumbers.map((inning) => {
                  const key = `${player.id}-${inning}`;
                  const val = cells[key] ?? 'BENCH';
                  return (
                    <PositionCell
                      key={inning}
                      value={val}
                      isLocked={locked.has(key)}
                      isDuplicate={duplicates.has(key)}
                      onChange={(v) => handleCellChange(key, v)}
                      onToggleLock={() => handleToggleLock(key)}
                    />
                  );
                })}
              </View>
            ))}

            {/* ── Missing positions footer ── */}
            <View style={styles.gridRow}>
              <View style={[styles.gridCell, styles.gridMissingLabel]}>
                <Text style={styles.gridMissingLabelText}>Open</Text>
              </View>
              {inningNumbers.map((_, idx) => {
                const missing = missingByInning[idx] ?? [];
                const hasMissing = missing.length > 0;
                return (
                  <View
                    key={idx}
                    style={[styles.gridCell, styles.gridMissingCell, hasMissing && styles.gridMissingCellWarn]}
                  >
                    {hasMissing ? (
                      <Text style={styles.gridMissingText} numberOfLines={3}>
                        {missing.join('\n')}
                      </Text>
                    ) : (
                      <Ionicons name="checkmark-circle" size={16} color="#1a5c2e" />
                    )}
                  </View>
                );
              })}
            </View>
          </View>
        </ScrollView>
      </ScrollView>

      {!hasDuplicates && (
        <Text style={styles.hint}>No player repeats a position back-to-back.</Text>
      )}
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f7f7f5' },
  loader: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  // Game selector
  selectorWrapper: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4 },
  selectorBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#fff',
    borderWidth: 1.5,
    borderColor: '#1a5c2e',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  selectorText: { flex: 1, fontSize: 14, fontWeight: '600', color: '#1a1a1a' },
  picker: {
    marginTop: 4,
    backgroundColor: '#fff',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e8e8e6',
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
    overflow: 'hidden',
  },
  pickerEmpty: { color: '#aaa', fontSize: 13, padding: 14, textAlign: 'center' },
  pickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 11,
    paddingHorizontal: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0ef',
    gap: 8,
  },
  pickerRowActive: { backgroundColor: '#edf6f0' },
  pickerLabel: { flex: 1, fontSize: 14, color: '#1a1a1a', fontWeight: '500' },
  pickerLabelPast: { color: '#bbb' },
  pickerLabelActive: { color: '#1a5c2e', fontWeight: '700' },
  pickerPastTag: {
    fontSize: 10, fontWeight: '700', color: '#ccc',
    textTransform: 'uppercase', letterSpacing: 0.5,
  },
  pickerImpromptuRow: { borderTopWidth: 1, borderTopColor: '#e8e8e6', borderBottomWidth: 0 },
  pickerImpromptuLabel: { color: '#888' },

  // Absent note
  absentNote: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginHorizontal: 16,
    marginTop: 6,
    marginBottom: 2,
    backgroundColor: '#fef9f0',
    borderRadius: 8,
    paddingVertical: 7,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: '#f5cba7',
  },
  absentNoteText: { flex: 1, fontSize: 12, color: '#e67e22', fontWeight: '500' },

  // Sub-tabs
  tabs: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginVertical: 10,
    backgroundColor: '#ebebea',
    borderRadius: 10,
    padding: 3,
  },
  tab: { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: 8 },
  tabActive: {
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 2,
  },
  tabText: { fontSize: 13, fontWeight: '500', color: '#888' },
  tabTextActive: { color: '#1a1a1a', fontWeight: '600' },

  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 40 },
  emptyText: { color: '#aaa', fontSize: 15, textAlign: 'center' },

  // Rotation
  rotationContainer: { flex: 1 },
  rotationMeta: { alignItems: 'flex-end', gap: 6 },
  activeCount: { fontSize: 12, color: '#1a5c2e', fontWeight: '600' },
  controls: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: '#eee', backgroundColor: '#fff',
  },
  inningsControl: { gap: 4 },
  controlLabel: {
    fontSize: 11, color: '#888', fontWeight: '500',
    textTransform: 'uppercase', letterSpacing: 0.5,
  },
  inningsPicker: { flexDirection: 'row', gap: 6 },
  inningChip: {
    width: 30, height: 30, borderRadius: 15,
    backgroundColor: '#f0f0ef', alignItems: 'center', justifyContent: 'center',
  },
  inningChipActive: { backgroundColor: '#1a5c2e' },
  inningChipText: { fontSize: 13, fontWeight: '600', color: '#555' },
  inningChipTextActive: { color: '#fff' },
  regenBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    borderWidth: 1.5, borderColor: '#1a5c2e', borderRadius: 8,
    paddingVertical: 7, paddingHorizontal: 12,
  },
  regenText: { color: '#1a5c2e', fontWeight: '600', fontSize: 13 },
  unlockBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    borderWidth: 1, borderColor: '#ccc', borderRadius: 8,
    paddingVertical: 5, paddingHorizontal: 10,
  },
  unlockBtnText: { color: '#555', fontWeight: '500', fontSize: 12 },
  errorBadge: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  errorText: { color: '#c0392b', fontSize: 12, fontWeight: '600' },
  grid: { padding: 12 },
  gridRow: { flexDirection: 'row' },
  gridRowAlt: { backgroundColor: '#f9f9f8' },
  gridCell: {
    height: 48, borderWidth: 0.5, borderColor: '#e0e0de',
    alignItems: 'center', justifyContent: 'center',
  },
  gridHeaderName: { width: 90, backgroundColor: '#1a5c2e' },
  gridHeaderInning: { width: 72, backgroundColor: '#1a5c2e' },
  gridHeaderText: { fontSize: 12, fontWeight: '700', color: '#fff' },
  gridPlayerName: { width: 90, backgroundColor: '#fff', alignItems: 'flex-start', paddingLeft: 8 },
  gridPlayerText: { fontSize: 13, fontWeight: '500', color: '#1a1a1a' },
  gridPosCell: { width: 72, backgroundColor: '#fff' },
  benchCell: { backgroundColor: '#fdf5f5' },
  cellLocked: { backgroundColor: '#edf6f0' },
  cellDuplicate: { backgroundColor: '#fdf0ef' },
  posText: { fontSize: 13, fontWeight: '700', color: '#1a5c2e' },
  benchText: { color: '#c0392b', fontSize: 11 },
  posTextDuplicate: { color: '#c0392b' },
  lockBtn: {
    position: 'absolute', top: 3, right: 3,
    width: 16, height: 16, alignItems: 'center', justifyContent: 'center', zIndex: 2,
  },
  gridMissingLabel: { width: 90, backgroundColor: '#fafaf8', alignItems: 'flex-start', paddingLeft: 8 },
  gridMissingLabelText: { fontSize: 10, fontWeight: '700', color: '#bbb', textTransform: 'uppercase', letterSpacing: 0.4 },
  gridMissingCell: { width: 72, backgroundColor: '#fafaf8', paddingVertical: 4 },
  gridMissingCellWarn: { backgroundColor: '#fff8f0' },
  gridMissingText: { fontSize: 10, fontWeight: '700', color: '#e67e22', textAlign: 'center', lineHeight: 14 },

  hint: { textAlign: 'center', color: '#aaa', fontSize: 12, padding: 12 },

  // Scoresheet footer
  scoresheetFooter: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#eee',
    backgroundColor: '#f7f7f5',
  },
  scoresheetBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#1a5c2e',
    borderRadius: 12,
    paddingVertical: 14,
  },
  scoresheetBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  disabled: { opacity: 0.4 },

  hintBox: {
    marginHorizontal: 16,
    marginTop: 10,
    marginBottom: 4,
    backgroundColor: '#edf6f0',
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  hintText: { fontSize: 13, color: '#555', lineHeight: 18 },
});
