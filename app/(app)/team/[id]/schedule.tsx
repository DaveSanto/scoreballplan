import { Ionicons } from '@expo/vector-icons';
import { useGlobalSearchParams } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useApp } from '../../../../src/store/AppContext';
import { useAuth } from '../../../../src/store/AuthContext';
import { Player, TeamGame, GameType, GAME_TYPES } from '../../../../src/types';
import { parseIcal } from '../../../../src/utils/icalImport';
import { generateIcal } from '../../../../src/utils/icalExport';
import {
  subscribeToTeamGames,
  addTeamGame,
  updateTeamGame as dbUpdateTeamGame,
  deleteTeamGame as dbDeleteTeamGame,
} from '../../../../src/firebase/db';

// ── Game type colors ──────────────────────────────────────────────────────────
const GAME_TYPE_COLORS: Record<string, { bg: string; text: string }> = {
  'Regular Season':          { bg: '#edf6f0', text: '#1a5c2e' },
  'Tournament':              { bg: '#f0eeff', text: '#5b3fd4' },
  'Exhibition':              { bg: '#e8f4fb', text: '#1a6fa0' },
  'Playoff - Wild Card':     { bg: '#fff3e0', text: '#c47000' },
  'Playoff - Divisional':    { bg: '#ffe8cc', text: '#b85c00' },
  'Playoff - Conference':    { bg: '#ffddb8', text: '#a34a00' },
  'Playoff - Semifinal':     { bg: '#ffd0a0', text: '#8f3800' },
  'Playoff - Championship':  { bg: '#fff0b3', text: '#7a5800' },
  'Practice':                { bg: '#f0f0ef', text: '#555' },
  'Scrimmage':               { bg: '#e8f0fe', text: '#3050a8' },
  'Meeting':                 { bg: '#f5f0ff', text: '#6b4fa8' },
  'Rainout (Makeup)':        { bg: '#e8f5f9', text: '#2a7090' },
  'Banquet':                 { bg: '#fce8f3', text: '#a0306a' },
  'Team Party':              { bg: '#ffe8f5', text: '#b03070' },
  'Other':                   { bg: '#f5f5f4', text: '#777' },
};

function gameTypeColor(type?: string) {
  return GAME_TYPE_COLORS[type ?? 'Regular Season'] ?? GAME_TYPE_COLORS['Regular Season'];
}

// ── Grid layout constants ─────────────────────────────────────────────────────
const PLAYER_COL_W = 148;
const GAME_COL_W = 90;
const DATE_ROW_H = 28;
const HEADER_H = 96;
const ROW_H = 48;

// ── Sort ──────────────────────────────────────────────────────────────────────
type SortMode = 'firstName' | 'lastName' | 'number';

const SORT_LABELS: Record<SortMode, string> = {
  firstName: 'First name',
  lastName:  'Last name',
  number:    'Jersey #',
};

function sortPlayerList(players: Player[], sort: SortMode): Player[] {
  const sorted = [...players];
  switch (sort) {
    case 'firstName':
      return sorted.sort((a, b) =>
        a.name.split(' ')[0].localeCompare(b.name.split(' ')[0])
      );
    case 'lastName': {
      const last = (n: string) => (n.includes(' ') ? n.split(' ').slice(-1)[0] : n);
      return sorted.sort((a, b) => last(a.name).localeCompare(last(b.name)));
    }
    case 'number': {
      return sorted.sort((a, b) => {
        const na = parseInt(a.number, 10);
        const nb = parseInt(b.number, 10);
        if (isNaN(na) && isNaN(nb)) return a.number.localeCompare(b.number);
        if (isNaN(na)) return 1;
        if (isNaN(nb)) return -1;
        return na - nb;
      });
    }
  }
}

// ── Date helpers ──────────────────────────────────────────────────────────────
function todayISO(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function formatDateShort(dateStr: string): string {
  // Add noon time to avoid timezone-induced off-by-one-day errors
  const d = new Date(dateStr.includes('T') ? dateStr : dateStr + 'T12:00:00');
  if (!isNaN(d.getTime())) {
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }
  return dateStr.length > 9 ? dateStr.slice(0, 9) : dateStr;
}

function parseDateMs(dateStr: string): number {
  const d = new Date(dateStr.includes('T') ? dateStr : dateStr + 'T12:00:00');
  return isNaN(d.getTime()) ? 0 : d.getTime();
}

function parseTimeMs(timeStr?: string): number {
  if (!timeStr) return Infinity; // no time sorts last
  const m = timeStr.trim().match(/^(\d{1,2}):(\d{2})\s*(am|pm)?$/i);
  if (!m) return Infinity;
  let h = parseInt(m[1], 10);
  const min = parseInt(m[2], 10);
  const meridiem = m[3]?.toLowerCase();
  if (meridiem === 'pm' && h !== 12) h += 12;
  if (meridiem === 'am' && h === 12) h = 0;
  return h * 60 + min;
}

// ── CSV schedule parser ───────────────────────────────────────────────────────
function splitCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  for (const ch of line) {
    if (ch === '"') { inQuotes = !inQuotes; }
    else if (ch === ',' && !inQuotes) { result.push(current); current = ''; }
    else { current += ch; }
  }
  result.push(current);
  return result;
}

function normalizeDateToISO(raw: string): string | null {
  const s = raw.trim();
  // Already YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  // MM/DD/YYYY or M/D/YYYY
  const mdy = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (mdy) return `${mdy[3]}-${mdy[1].padStart(2, '0')}-${mdy[2].padStart(2, '0')}`;
  // MM-DD-YYYY or M-D-YYYY
  const mdyDash = s.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (mdyDash) return `${mdyDash[3]}-${mdyDash[1].padStart(2, '0')}-${mdyDash[2].padStart(2, '0')}`;
  // Try generic parse as a last resort
  const d = new Date(s);
  if (!isNaN(d.getTime())) {
    return d.toISOString().slice(0, 10);
  }
  return null;
}

function parseScheduleCsv(text: string): {
  games: Omit<TeamGame, 'id'>[];
  errors: string[];
} {
  const errors: string[] = [];
  const games: Omit<TeamGame, 'id'>[] = [];
  const lines = text.split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));
  if (lines.length < 2) {
    return { games: [], errors: ['File appears empty or has no data rows.'] };
  }
  for (let i = 1; i < lines.length; i++) {
    const cols = splitCsvLine(lines[i]);
    const rawDate = cols[0]?.trim();
    const opponent = cols[1]?.trim();
    const location = cols[2]?.trim() || undefined;
    const time = cols[3]?.trim() || undefined;
    const homeAway = cols[4]?.trim().toLowerCase() ?? '';
    if (!rawDate || !opponent) {
      errors.push(`Row ${i + 1}: missing date or opponent — skipped.`);
      continue;
    }
    const date = normalizeDateToISO(rawDate);
    if (!date) {
      errors.push(`Row ${i + 1}: unrecognized date "${rawDate}" — skipped. Use YYYY-MM-DD or MM/DD/YYYY.`);
      continue;
    }
    const isHome = homeAway === '' ? null : homeAway.startsWith('h') ? true : homeAway.startsWith('a') ? false : null;
    const rawType = cols[5]?.trim() ?? '';
    const gameType: GameType = (GAME_TYPES as readonly string[]).includes(rawType)
      ? rawType as GameType
      : 'Regular Season';
    games.push({ date, opponent, location, time, isHome, gameType });
  }
  return { games, errors };
}

const CSV_TEMPLATE = `# ScoreBall Schedule Import Template
# Lines starting with # are ignored.
#
# VALID TYPES (column F — must match exactly):
#   Regular Season, Tournament, Exhibition
#   Playoff - Wild Card, Playoff - Divisional, Playoff - Conference
#   Playoff - Semifinal, Playoff - Championship
#   Practice, Scrimmage, Meeting, Rainout (Makeup)
#   Banquet, Team Party, Other
# If left blank or unrecognized, defaults to: Regular Season
#
# HOME/AWAY (column E): Home, Away, TBD (or leave blank for TBD)
# DATE (column A): YYYY-MM-DD or MM/DD/YYYY
Date,Opponent,Location,Time,Home/Away,Type
2026-06-15,Tigers,Central Park,6:30 PM,Home,Regular Season
2026-06-22,Bears,North Field,8:00 PM,Away,Regular Season
`;

// ── Main screen ───────────────────────────────────────────────────────────────
export default function ScheduleScreen() {
  const { id: teamId } = useGlobalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const { teams, getTeamPlayers } = useApp();
  const team = teams.find((t) => t.id === teamId);

  // null = subscription hasn't fired yet (loading); [] = loaded but empty
  const [games, setGames] = useState<TeamGame[] | null>(null);
  const [sortBy, setSortBy] = useState<SortMode>('firstName');
  const [sortMenuOpen, setSortMenuOpen] = useState(false);
  const [gameModal, setGameModal] = useState(false);
  const [editingGame, setEditingGame] = useState<TeamGame | null>(null);
  const [csvPreview, setCsvPreview] = useState<ReturnType<typeof parseScheduleCsv> | null>(null);
  const [csvModal, setCsvModal] = useState(false);
  const [clearSeasonConfirm, setClearSeasonConfirm] = useState(false);
  const fileInputRef = useRef<any>(null);
  const headerScrollRef = useRef<ScrollView>(null);
  const bodyScrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    if (!teamId) return;
    // subscribeToTeamGames calls onUpdate([]) on error, so games transitions
    // from null → [] on any response (success or failure), clearing the spinner
    return subscribeToTeamGames(teamId, (g) => {
      setGames(g.sort((a, b) => {
        const dateDiff = parseDateMs(a.date) - parseDateMs(b.date);
        return dateDiff !== 0 ? dateDiff : parseTimeMs(a.time) - parseTimeMs(b.time);
      }));
    });
  }, [teamId]);

  if (!team || games === null) {
    return (
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <View style={styles.loader}><ActivityIndicator color="#1a5c2e" /></View>
      </SafeAreaView>
    );
  }

  const teamPlayers = getTeamPlayers(teamId);
  const sortedPlayers = sortPlayerList(teamPlayers, sortBy);

  // Authorization
  const uid = user?.uid ?? '';
  const isAdmin = uid === team.ownerId || (team.coAdminIds ?? []).includes(uid);
  const isMember = isAdmin || (team.memberIds ?? []).includes(uid);
  // Player this user has claimed as themselves, or any players they're guarding
  const myClaimedPlayer = teamPlayers.find((p) => p.claimedBy === uid);
  const myGuardedPlayerIds = new Set(
    teamPlayers.filter((p) => p.guardianId === uid).map((p) => p.id)
  );

  async function toggleAvailability(game: TeamGame, playerId: string) {
    const current = game.absentPlayerIds ?? [];
    const absentPlayerIds = current.includes(playerId)
      ? current.filter((id) => id !== playerId)
      : [...current, playerId];
    await dbUpdateTeamGame(teamId, game.id, { absentPlayerIds });
  }

  function openAdd() { setEditingGame(null); setGameModal(true); }
  function openEdit(game: TeamGame) { if (!isAdmin) return; setEditingGame(game); setGameModal(true); }

  async function handleSaveGame(data: Omit<TeamGame, 'id'>) {
    if (editingGame) {
      await dbUpdateTeamGame(teamId, editingGame.id, data);
    } else {
      await addTeamGame(teamId, data);
    }
    setGameModal(false);
  }

  async function handleDeleteGame(gameId: string) {
    setGameModal(false);
    try {
      await dbDeleteTeamGame(teamId, gameId);
    } catch (e) {
      console.error('deleteTeamGame failed', e);
      Alert.alert('Error', 'Could not remove game. Please try again.');
    }
  }

  async function handleClearSeasonConfirmed() {
    if (!games) return;
    const future = games.filter((g) => g.date >= new Date().toISOString().slice(0, 10));
    setClearSeasonConfirm(false);
    try {
      await Promise.all(future.map((g) => dbDeleteTeamGame(teamId, g.id)));
    } catch (e) {
      console.error('clearSeason failed', e);
    }
  }

  function handleImportUpload() {
    if (Platform.OS === 'web') {
      fileInputRef.current?.click();
    } else {
      Alert.alert('Import Schedule', 'CSV and iCal import are available on the web version.');
    }
  }

  function handleFileChange(e: any) {
    const file = e.target?.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      if (!text) return;
      const name = (file.name as string).toLowerCase();
      const result = (name.endsWith('.ics') || name.endsWith('.ical'))
        ? parseIcal(text)
        : parseScheduleCsv(text);
      setCsvPreview(result);
      setCsvModal(true);
    };
    reader.readAsText(file);
    e.target.value = '';
  }

  function handleExportIcal() {
    if (Platform.OS !== 'web') {
      Alert.alert('Export Schedule', 'iCal export is available on the web version.');
      return;
    }
    const content = generateIcal(games ?? [], team?.name ?? 'Team');
    const blob = new Blob([content], { type: 'text/calendar' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${(team?.name ?? 'team').replace(/\s+/g, '_')}_schedule.ics`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function downloadTemplate() {
    if (Platform.OS !== 'web') return;
    const blob = new Blob([CSV_TEMPLATE], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'scoreball_schedule_template.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      {Platform.OS === 'web' && (
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,.ics,.ical,text/csv,text/calendar"
          style={{ display: 'none' }}
          onChange={handleFileChange}
        />
      )}

      <View style={styles.hintBox}>
        <Text style={styles.hintText}>
          Indicate what days you will be available (and see who won't be able to make it) here. Also — download your schedule as a .ical file to import it into an electronic calendar.
        </Text>
      </View>

      {games.length === 0 ? (
        <EmptyState onAdd={openAdd} onCsvUpload={handleImportUpload} />
      ) : (
        <>
          {/* Toolbar */}
          <View style={styles.toolbar}>
            <Text style={styles.toolbarCount}>
              {games.length} game{games.length !== 1 ? 's' : ''}
            </Text>
            <Pressable style={styles.sortBtn} onPress={() => setSortMenuOpen((o) => !o)}>
              <Ionicons name="funnel-outline" size={13} color="#1a5c2e" />
              <Text style={styles.sortBtnText}>{SORT_LABELS[sortBy]}</Text>
              <Ionicons name={sortMenuOpen ? 'chevron-up' : 'chevron-down'} size={11} color="#1a5c2e" />
            </Pressable>
          </View>

          {sortMenuOpen && (
            <View style={styles.sortMenu}>
              {(Object.keys(SORT_LABELS) as SortMode[]).map((opt) => (
                <Pressable
                  key={opt}
                  style={[styles.sortMenuItem, sortBy === opt && styles.sortMenuItemActive]}
                  onPress={() => { setSortBy(opt); setSortMenuOpen(false); }}
                >
                  <Text style={[styles.sortMenuItemText, sortBy === opt && styles.sortMenuItemTextActive]}>
                    {SORT_LABELS[opt]}
                  </Text>
                  {sortBy === opt && <Ionicons name="checkmark" size={14} color="#1a5c2e" />}
                </Pressable>
              ))}
            </View>
          )}

          {/* Grid */}
          <View style={styles.gridScroll}>
            {/* Frozen header rows */}
            <View style={styles.gridRow}>
              <View style={[styles.cornerCell, { height: DATE_ROW_H + HEADER_H, width: PLAYER_COL_W }]}>
                <Text style={styles.cornerLabel}>Player</Text>
              </View>
              <ScrollView
                ref={headerScrollRef}
                horizontal
                scrollEnabled={false}
                showsHorizontalScrollIndicator={false}
                style={styles.gameScrollArea}
              >
                <View>
                  {/* Date row */}
                  <View style={{ flexDirection: 'row' }}>
                    {games.map((game) => (
                      <View key={game.id} style={[styles.dateRow, { width: GAME_COL_W, height: DATE_ROW_H }]}>
                        <Text style={styles.dateRowText}>{formatDateShort(game.date)}</Text>
                      </View>
                    ))}
                  </View>
                  {/* Game info row */}
                  <View style={{ flexDirection: 'row' }}>
                    {games.map((game) => (
                      <Pressable
                        key={game.id}
                        style={[
                          styles.gameHeaderCell,
                          { width: GAME_COL_W, height: HEADER_H },
                          (game.gameType && game.gameType !== 'Regular Season')
                            && { backgroundColor: gameTypeColor(game.gameType).bg },
                        ]}
                        onPress={() => openEdit(game)}
                      >
                        <Text style={styles.gameHeaderOpponent} numberOfLines={2}>
                          {game.opponent}
                        </Text>
                        {game.time && (
                          <Text style={styles.gameHeaderTime}>{game.time}</Text>
                        )}
                        <View style={{ flexDirection: 'row', gap: 3, flexWrap: 'wrap' }}>
                          <View style={[styles.haChip, game.isHome === true ? styles.homeChip : game.isHome === false ? styles.awayChip : styles.tbdChip]}>
                            <Text style={[styles.haText, game.isHome === true ? styles.homeText : game.isHome === false ? styles.awayText : styles.tbdText]}>
                              {game.isHome === true ? 'Home' : game.isHome === false ? 'Away' : 'TBD'}
                            </Text>
                          </View>
                          {(game.gameType ?? 'Regular Season') !== 'Regular Season' && (
                            <View style={[styles.haChip, { backgroundColor: gameTypeColor(game.gameType).bg }]}>
                              <Text style={[styles.haText, { color: gameTypeColor(game.gameType).text, flexShrink: 1 }]}>
                                {game.gameType}
                              </Text>
                            </View>
                          )}
                        </View>
                      </Pressable>
                    ))}
                  </View>
                </View>
              </ScrollView>
            </View>

            {/* Scrollable body: player names + data */}
            <ScrollView bounces={false}>
              <View style={styles.gridRow}>
                {/* Fixed left: player names */}
                <View style={{ width: PLAYER_COL_W }}>
                  {sortedPlayers.map((player, i) => (
                    <View
                      key={player.id}
                      style={[styles.playerNameCell, { height: ROW_H }, i % 2 === 1 && styles.altRow]}
                    >
                      <View style={styles.badgeSm}>
                        <Text style={styles.badgeSmNum}>#{player.number || '—'}</Text>
                      </View>
                      <Text style={styles.playerNameText} numberOfLines={1}>{player.name}</Text>
                    </View>
                  ))}
                </View>

                {/* Scrollable right: player data rows */}
                <ScrollView
                  ref={bodyScrollRef}
                  horizontal
                  showsHorizontalScrollIndicator
                  style={styles.gameScrollArea}
                  nestedScrollEnabled
                  scrollEventThrottle={16}
                  onScroll={(e) => {
                    headerScrollRef.current?.scrollTo({
                      x: e.nativeEvent.contentOffset.x,
                      animated: false,
                    });
                  }}
                >
                  <View>
                    {sortedPlayers.map((player, i) => {
                      const isMyRow = player.id === myClaimedPlayer?.id || myGuardedPlayerIds.has(player.id);
                      const canToggle = isAdmin || (isMember && isMyRow);
                      return (
                        <View
                          key={player.id}
                          style={[{ flexDirection: 'row', height: ROW_H }, i % 2 === 1 && styles.altRow]}
                        >
                          {games.map((game) => {
                            const isAbsent = (game.absentPlayerIds ?? []).includes(player.id);
                            return (
                              <Pressable
                                key={game.id}
                                style={[styles.dataCell, { width: GAME_COL_W }]}
                                onPress={canToggle ? () => toggleAvailability(game, player.id) : undefined}
                                disabled={!canToggle}
                              >
                                <View
                                  style={[
                                    styles.availDot,
                                    isAbsent ? styles.availDotOut : styles.availDotIn,
                                    canToggle && styles.availDotTappable,
                                  ]}
                                />
                              </Pressable>
                            );
                          })}
                        </View>
                      );
                    })}
                  </View>
                </ScrollView>
              </View>
            </ScrollView>
          </View>
        </>
      )}

      {/* Legend */}
      {games.length > 0 && (
        <View style={styles.legend}>
          <View style={styles.legendItem}>
            <View style={[styles.availDot, styles.availDotIn, styles.availDotTappable]} />
            <Text style={styles.legendText}>Available</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.availDot, styles.availDotOut, styles.availDotTappable]} />
            <Text style={styles.legendText}>Unavailable</Text>
          </View>
          <Text style={styles.legendHint}>
            {isAdmin ? 'Tap any cell to toggle' : isMember && (myClaimedPlayer || myGuardedPlayerIds.size > 0) ? 'Tap your row to update availability' : 'View only'}
          </Text>
        </View>
      )}

      {/* Footer */}
      {(
        <View style={styles.footer}>
          <View style={styles.csvGroup}>
            <Pressable style={styles.csvBtn} onPress={handleImportUpload}>
              <Ionicons name="cloud-upload-outline" size={18} color="#1a5c2e" />
              <Text style={styles.csvBtnText}>Import</Text>
            </Pressable>
            <Pressable onPress={downloadTemplate}>
              <Text style={styles.templateLink}>CSV template</Text>
            </Pressable>
            <Pressable onPress={handleExportIcal}>
              <Text style={styles.templateLink}>Export .ical</Text>
            </Pressable>
            {isAdmin && games && games.length > 0 && !clearSeasonConfirm && (
              <Pressable onPress={() => setClearSeasonConfirm(true)}>
                <Text style={[styles.templateLink, { color: '#c0392b' }]}>Clear season</Text>
              </Pressable>
            )}
            {isAdmin && clearSeasonConfirm && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Text style={[styles.templateLink, { color: '#c0392b' }]}>Delete all upcoming games?</Text>
                <Pressable onPress={handleClearSeasonConfirmed}>
                  <Text style={[styles.templateLink, { color: '#c0392b', fontWeight: '700' }]}>Yes</Text>
                </Pressable>
                <Pressable onPress={() => setClearSeasonConfirm(false)}>
                  <Text style={styles.templateLink}>No</Text>
                </Pressable>
              </View>
            )}
          </View>
          <Pressable style={styles.addBtn} onPress={openAdd}>
            <Ionicons name="add" size={20} color="#fff" />
            <Text style={styles.addBtnText}>Add Game</Text>
          </Pressable>
        </View>
      )}

      <GameModal
        visible={gameModal}
        game={editingGame}
        onClose={() => setGameModal(false)}
        onSave={handleSaveGame}
        onDelete={
          editingGame
            ? () => handleDeleteGame(editingGame.id)
            : undefined
        }
      />

      <CsvScheduleModal
        visible={csvModal}
        data={csvPreview}
        onClose={() => setCsvModal(false)}
        onImport={async (newGames) => {
          await Promise.all(newGames.map((g) => addTeamGame(teamId, g)));
          setCsvModal(false);
        }}
      />
    </SafeAreaView>
  );
}

// ── Empty state ───────────────────────────────────────────────────────────────
function EmptyState({ onAdd, onCsvUpload }: { onAdd: () => void; onCsvUpload: () => void }) {
  return (
    <View style={styles.emptyContainer}>
      <Ionicons name="calendar-outline" size={56} color="#ccc" />
      <Text style={styles.emptyTitle}>No games yet</Text>
      <Text style={styles.emptyHint}>Import a CSV or iCal file, or add games manually.</Text>
      <View style={styles.emptyActions}>
        <Pressable style={styles.emptySecondaryBtn} onPress={onCsvUpload}>
          <Ionicons name="cloud-upload-outline" size={18} color="#1a5c2e" />
          <Text style={styles.emptySecondaryText}>Import</Text>
        </Pressable>
        <Pressable style={styles.emptyPrimaryBtn} onPress={onAdd}>
          <Ionicons name="add" size={20} color="#fff" />
          <Text style={styles.emptyPrimaryText}>Add Game</Text>
        </Pressable>
      </View>
    </View>
  );
}

// ── Game modal ────────────────────────────────────────────────────────────────
function GameModal({
  visible, game, onClose, onSave, onDelete,
}: {
  visible: boolean;
  game: TeamGame | null;
  onClose: () => void;
  onSave: (data: Omit<TeamGame, 'id'>) => Promise<void>;
  onDelete?: () => void;
}) {
  const [date, setDate] = useState('');
  const [opponent, setOpponent] = useState('');
  const [location, setLocation] = useState('');
  const [time, setTime] = useState('');
  const [isHome, setIsHome] = useState<boolean | null>(null);
  const [gameType, setGameType] = useState<GameType>('Regular Season');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  React.useEffect(() => {
    if (visible) {
      setDate(game?.date ?? '');
      setOpponent(game?.opponent ?? '');
      setLocation(game?.location ?? '');
      setTime(game?.time ?? '');
      setIsHome(game?.isHome ?? null);
      setGameType(game?.gameType ?? 'Regular Season');
      setNotes(game?.notes ?? '');
      setConfirmingDelete(false);
    }
  }, [visible, game]);

  const today = todayISO();

  async function handleSave() {
    if (!opponent.trim() || !date.trim() || saving) return;
    if (date < today) {
      Alert.alert('Invalid Date', 'Game date cannot be in the past.');
      return;
    }
    setSaving(true);
    try {
      await onSave({
        date: date.trim(),
        opponent: opponent.trim(),
        location: location.trim() || undefined,
        time: time.trim() || undefined,
        isHome,
        gameType,
        notes: notes.trim() || undefined,
      });
    } finally {
      setSaving(false);
    }
  }

  const canSave = opponent.trim() && date.trim() && date >= today;

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.modalOverlay}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.modalCard}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>{game ? 'Edit Game' : 'Add Game'}</Text>
            <Pressable onPress={onClose}>
              <Ionicons name="close" size={24} color="#888" />
            </Pressable>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            <Text style={styles.fieldLabel}>Opponent *</Text>
            <TextInput
              style={styles.input}
              value={opponent}
              onChangeText={setOpponent}
              placeholder="Team name"
              autoFocus
            />

            <Text style={styles.fieldLabel}>Date *</Text>
            {Platform.OS === 'web' ? (
              <input
                type="date"
                value={date}
                min={today}
                onChange={(e: any) => setDate(e.target.value)}
                style={{
                  borderWidth: 1,
                  border: '1px solid #ddd',
                  borderRadius: 10,
                  paddingTop: 11,
                  paddingBottom: 11,
                  paddingLeft: 14,
                  paddingRight: 14,
                  fontSize: 16,
                  backgroundColor: '#fafaf8',
                  width: '100%',
                  boxSizing: 'border-box',
                  fontFamily: 'inherit',
                  color: date ? '#1a1a1a' : '#aaa',
                } as any}
              />
            ) : (
              <TextInput
                style={[styles.input, date && date < today && { borderColor: '#c0392b' }]}
                value={date}
                onChangeText={setDate}
                placeholder="YYYY-MM-DD"
                keyboardType="numeric"
              />
            )}

            <Text style={styles.fieldLabel}>Home / Away</Text>
            <View style={styles.chipRow}>
              <Pressable
                style={[styles.toggleChip, isHome === true && styles.toggleChipActive]}
                onPress={() => setIsHome(true)}
              >
                <Text style={[styles.toggleChipText, isHome === true && styles.toggleChipTextActive]}>Home</Text>
              </Pressable>
              <Pressable
                style={[styles.toggleChip, isHome === false && styles.toggleChipActive]}
                onPress={() => setIsHome(false)}
              >
                <Text style={[styles.toggleChipText, isHome === false && styles.toggleChipTextActive]}>Away</Text>
              </Pressable>
              <Pressable
                style={[styles.toggleChip, isHome === null && styles.toggleChipActive]}
                onPress={() => setIsHome(null)}
              >
                <Text style={[styles.toggleChipText, isHome === null && styles.toggleChipTextActive]}>TBD</Text>
              </Pressable>
            </View>

            <Text style={styles.fieldLabel}>Time</Text>
            <TextInput
              style={styles.input}
              value={time}
              onChangeText={setTime}
              placeholder="e.g. 6:30 PM"
            />

            <Text style={styles.fieldLabel}>Location</Text>
            <TextInput
              style={styles.input}
              value={location}
              onChangeText={setLocation}
              placeholder="Field or venue name"
            />

            <Text style={styles.fieldLabel}>Game Type</Text>
            <View style={styles.typeGrid}>
              {GAME_TYPES.map((t) => {
                const active = gameType === t;
                const color = gameTypeColor(t);
                return (
                  <Pressable
                    key={t}
                    style={[styles.typeChip, active && { borderColor: color.text, backgroundColor: color.bg }]}
                    onPress={() => setGameType(t)}
                  >
                    <Text style={[styles.typeChipText, active && { color: color.text, fontWeight: '700' }]}>{t}</Text>
                  </Pressable>
                );
              })}
            </View>

            <Text style={styles.fieldLabel}>Notes</Text>
            <TextInput
              style={[styles.input, { height: 70, textAlignVertical: 'top', paddingTop: 11 }]}
              value={notes}
              onChangeText={setNotes}
              placeholder="Optional notes"
              multiline
            />

            {onDelete && !confirmingDelete && (
              <Pressable style={styles.deleteGameBtn} onPress={() => setConfirmingDelete(true)}>
                <Ionicons name="trash-outline" size={16} color="#c0392b" />
                <Text style={styles.deleteGameBtnText}>Remove Game</Text>
              </Pressable>
            )}
            {onDelete && confirmingDelete && (
              <View style={styles.deleteConfirm}>
                <Text style={styles.deleteConfirmText}>Remove this game?</Text>
                <View style={styles.deleteConfirmBtns}>
                  <Pressable style={styles.deleteConfirmCancel} onPress={() => setConfirmingDelete(false)}>
                    <Text style={styles.deleteConfirmCancelText}>Cancel</Text>
                  </Pressable>
                  <Pressable style={styles.deleteConfirmOk} onPress={onDelete}>
                    <Text style={styles.deleteConfirmOkText}>Remove</Text>
                  </Pressable>
                </View>
              </View>
            )}

            <View style={{ height: 16 }} />
          </ScrollView>

          <View style={styles.modalActions}>
            <Pressable style={[styles.modalBtn, styles.cancelBtn]} onPress={onClose} disabled={saving}>
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </Pressable>
            <Pressable
              style={[styles.modalBtn, styles.saveBtn, (!canSave || saving) && styles.disabled]}
              onPress={handleSave}
              disabled={!canSave || saving}
            >
              {saving
                ? <ActivityIndicator color="#fff" size="small" />
                : <Text style={styles.saveBtnText}>Save</Text>}
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ── CSV schedule preview modal ────────────────────────────────────────────────
function CsvScheduleModal({
  visible, data, onClose, onImport,
}: {
  visible: boolean;
  data: ReturnType<typeof parseScheduleCsv> | null;
  onClose: () => void;
  onImport: (games: Omit<TeamGame, 'id'>[]) => Promise<void>;
}) {
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);

  if (!data) return null;

  async function handleImport() {
    if (importing || !data?.games.length) return;
    setImporting(true);
    setImportError(null);
    try {
      await onImport(data.games);
    } catch (e: any) {
      const msg: string = e?.message ?? '';
      if (msg.includes('Missing or insufficient permissions')) {
        setImportError('Permission denied — make sure you\'re signed in as a team admin.');
      } else {
        setImportError(msg || 'Import failed. Check your CSV and try again.');
      }
    } finally {
      setImporting(false);
    }
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={[styles.modalCard, { maxHeight: '85%' }]}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Import Schedule</Text>
            <Pressable onPress={onClose}>
              <Ionicons name="close" size={24} color="#888" />
            </Pressable>
          </View>

          {data.errors.length > 0 && (
            <View style={styles.csvErrors}>
              {data.errors.map((e, i) => <Text key={i} style={styles.csvError}>⚠ {e}</Text>)}
            </View>
          )}

          {importError && (
            <View style={[styles.csvErrors, { backgroundColor: '#fff0f0', borderColor: '#c0392b' }]}>
              <Text style={[styles.csvError, { color: '#c0392b', fontWeight: '600' }]}>Import failed</Text>
              <Text style={[styles.csvError, { color: '#c0392b' }]}>{importError}</Text>
            </View>
          )}

          {data.games.length === 0 ? (
            <Text style={styles.csvNoRows}>No valid games found in file.</Text>
          ) : (
            <ScrollView style={styles.csvList}>
              <Text style={styles.csvSectionLabel}>
                {data.games.length} game{data.games.length !== 1 ? 's' : ''} to import
              </Text>
              {data.games.map((g, i) => (
                <View key={i} style={styles.csvGameRow}>
                  <Text style={styles.csvGameDate}>{formatDateShort(g.date)}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.csvGameOpponent}>{g.opponent}</Text>
                    <Text style={styles.csvGameMeta}>
                      {g.isHome === true ? 'Home' : g.isHome === false ? 'Away' : 'TBD'}
                      {g.location ? ` · ${g.location}` : ''}
                      {g.time ? ` · ${g.time}` : ''}
                    </Text>
                  </View>
                </View>
              ))}
            </ScrollView>
          )}

          <View style={styles.modalActions}>
            <Pressable style={[styles.modalBtn, styles.cancelBtn]} onPress={onClose}>
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </Pressable>
            {data.games.length > 0 && (
              <Pressable
                style={[styles.modalBtn, styles.saveBtn, importing && styles.disabled]}
                onPress={handleImport}
                disabled={importing}
              >
                {importing
                  ? <ActivityIndicator color="#fff" size="small" />
                  : <Text style={styles.saveBtnText}>Import {data.games.length}</Text>}
              </Pressable>
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f7f7f5' },
  loader: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  // Empty state
  emptyContainer: {
    flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, padding: 32,
  },
  emptyTitle: { fontSize: 17, fontWeight: '600', color: '#999' },
  emptyHint: { fontSize: 13, color: '#bbb', textAlign: 'center' },
  emptyActions: { flexDirection: 'row', gap: 12, marginTop: 20 },
  emptySecondaryBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingVertical: 13, paddingHorizontal: 18,
    borderWidth: 1.5, borderColor: '#1a5c2e', borderRadius: 12,
  },
  emptySecondaryText: { color: '#1a5c2e', fontWeight: '600', fontSize: 14 },
  emptyPrimaryBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingVertical: 13, paddingHorizontal: 18,
    backgroundColor: '#1a5c2e', borderRadius: 12,
  },
  emptyPrimaryText: { color: '#fff', fontWeight: '600', fontSize: 14 },

  // Toolbar
  toolbar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 8,
  },
  toolbarCount: { fontSize: 13, color: '#888' },
  sortBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingVertical: 5, paddingHorizontal: 10,
    borderRadius: 8, borderWidth: 1.5, borderColor: '#1a5c2e',
    backgroundColor: '#edf6f0',
  },
  sortBtnText: { fontSize: 12, fontWeight: '600', color: '#1a5c2e' },
  sortMenu: {
    marginHorizontal: 16, marginBottom: 4,
    backgroundColor: '#fff', borderRadius: 10,
    borderWidth: 1, borderColor: '#e8e8e6',
    shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 }, elevation: 3, overflow: 'hidden',
  },
  sortMenuItem: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 11, paddingHorizontal: 14,
    borderBottomWidth: 1, borderBottomColor: '#f0f0ef',
  },
  sortMenuItemActive: { backgroundColor: '#edf6f0' },
  sortMenuItemText: { fontSize: 14, color: '#333' },
  sortMenuItemTextActive: { fontWeight: '700', color: '#1a5c2e' },

  // Grid
  gridScroll: { flex: 1, borderTopWidth: 1, borderTopColor: '#e5e5e4' },
  gridRow: { flexDirection: 'row' },

  // Left column
  cornerCell: {
    justifyContent: 'flex-end', padding: 10,
    borderRightWidth: 1, borderRightColor: '#e5e5e4',
    borderBottomWidth: 1, borderBottomColor: '#e5e5e4',
    backgroundColor: '#f7f7f5',
  },
  cornerLabel: {
    fontSize: 10, fontWeight: '700', color: '#aaa',
    textTransform: 'uppercase', letterSpacing: 0.5,
  },
  playerNameCell: {
    flexDirection: 'row', alignItems: 'center',
    paddingLeft: 10, paddingRight: 6, gap: 8,
    borderRightWidth: 1, borderRightColor: '#e5e5e4',
    borderBottomWidth: 1, borderBottomColor: '#f0f0ef',
    backgroundColor: '#fff',
  },
  altRow: { backgroundColor: '#fafaf8' },
  badgeSm: {
    width: 30, height: 30, borderRadius: 15,
    backgroundColor: '#1a5c2e',
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  badgeSmNum: { color: '#fff', fontWeight: '700', fontSize: 10 },
  playerNameText: { fontSize: 13, fontWeight: '600', color: '#1a1a1a', flex: 1 },

  // Right scroll area
  gameScrollArea: { flex: 1 },

  // Game header cells
  gameHeaderCell: {
    alignItems: 'center', justifyContent: 'center',
    padding: 6, gap: 2,
    borderRightWidth: 1, borderRightColor: '#e5e5e4',
    borderBottomWidth: 1, borderBottomColor: '#e5e5e4',
    backgroundColor: '#fff',
  },
  dateRow: {
    alignItems: 'center', justifyContent: 'center',
    borderRightWidth: 1, borderRightColor: '#e5e5e4',
    borderBottomWidth: 1, borderBottomColor: '#e5e5e4',
    backgroundColor: '#f7f7f5',
  },
  dateRowText: { fontSize: 11, fontWeight: '700', color: '#1a5c2e' },
  gameHeaderDate: { fontSize: 11, fontWeight: '700', color: '#1a5c2e' },
  gameHeaderOpponent: { fontSize: 11, color: '#333', textAlign: 'center', lineHeight: 14 },
  gameHeaderTime: { fontSize: 10, color: '#888', textAlign: 'center' },
  haChip: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, flexShrink: 1 },
  homeChip: { backgroundColor: '#edf6f0' },
  awayChip: { backgroundColor: '#fef9f0' },
  tbdChip: { backgroundColor: '#f0f0ef' },
  haText: { fontSize: 9, fontWeight: '700' },
  homeText: { color: '#1a5c2e' },
  awayText: { color: '#e67e22' },
  tbdText: { color: '#999' },

  // Data cells
  dataCell: {
    alignItems: 'center', justifyContent: 'center',
    borderRightWidth: 1, borderRightColor: '#ebebea',
    borderBottomWidth: 1, borderBottomColor: '#f0f0ef',
    backgroundColor: 'transparent',
  },
  availDot: { width: 10, height: 10, borderRadius: 5 },
  availDotIn: { backgroundColor: '#c8e6d0' },
  availDotOut: { backgroundColor: '#f5b7b1' },
  availDotTappable: { width: 14, height: 14, borderRadius: 7 },

  // Legend
  legend: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: '#eee',
    backgroundColor: '#fafaf8',
    flexWrap: 'wrap',
  },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendText: { fontSize: 11, color: '#666', fontWeight: '600' },
  legendHint: { fontSize: 11, color: '#aaa', flex: 1, textAlign: 'right' },

  // Footer
  footer: {
    flexDirection: 'row', padding: 16, gap: 10,
    borderTopWidth: 1, borderTopColor: '#eee', backgroundColor: '#f7f7f5',
  },
  csvGroup: { alignItems: 'center', gap: 5 },
  templateLink: { fontSize: 11, color: '#1a5c2e', textDecorationLine: 'underline' },
  csvBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, borderWidth: 1.5, borderColor: '#1a5c2e',
    borderRadius: 12, paddingVertical: 13, paddingHorizontal: 16,
  },
  csvBtnText: { color: '#1a5c2e', fontWeight: '600', fontSize: 14 },
  addBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#1a5c2e', borderRadius: 12, paddingVertical: 13, gap: 6,
  },
  addBtnText: { color: '#fff', fontWeight: '600', fontSize: 15 },

  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  modalCard: {
    backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20,
    padding: 20, maxHeight: '92%',
  },
  modalHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16,
  },
  modalTitle: { fontSize: 20, fontWeight: '700', color: '#1a1a1a' },
  fieldLabel: {
    fontSize: 12, fontWeight: '600', color: '#888',
    textTransform: 'uppercase', letterSpacing: 0.5,
    marginBottom: 6, marginTop: 14,
  },
  input: {
    borderWidth: 1, borderColor: '#ddd', borderRadius: 10,
    paddingVertical: 11, paddingHorizontal: 14,
    fontSize: 16, backgroundColor: '#fafaf8',
  },
  chipRow: { flexDirection: 'row', gap: 8 },
  toggleChip: {
    paddingVertical: 8, paddingHorizontal: 16,
    borderRadius: 8, borderWidth: 1.5, borderColor: '#ddd', backgroundColor: '#fafaf8',
  },
  toggleChipActive: { borderColor: '#1a5c2e', backgroundColor: '#edf6f0' },
  toggleChipText: { fontSize: 14, fontWeight: '500', color: '#888' },
  toggleChipTextActive: { color: '#1a5c2e', fontWeight: '700' },
  typeHeaderChip: { backgroundColor: '#eef2ff' },
  typeHeaderText: { color: '#4a6cf7' },
  typeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 4 },
  typeChip: {
    paddingVertical: 6, paddingHorizontal: 10, borderRadius: 8,
    borderWidth: 1.5, borderColor: '#ddd', backgroundColor: '#fafaf8',
  },
  typeChipActive: { borderColor: '#1a5c2e', backgroundColor: '#edf6f0' },
  typeChipText: { fontSize: 13, fontWeight: '500', color: '#888' },
  typeChipTextActive: { color: '#1a5c2e', fontWeight: '700' },
  deleteGameBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'center',
    paddingVertical: 10, paddingHorizontal: 20, marginTop: 14,
    borderRadius: 10, borderWidth: 1.5, borderColor: '#c0392b',
  },
  deleteGameBtnText: { color: '#c0392b', fontWeight: '600', fontSize: 14 },
  deleteConfirm: {
    marginTop: 14, padding: 14, borderRadius: 10,
    backgroundColor: '#fff5f5', borderWidth: 1.5, borderColor: '#c0392b',
  },
  deleteConfirmText: { color: '#c0392b', fontWeight: '600', fontSize: 14, textAlign: 'center', marginBottom: 10 },
  deleteConfirmBtns: { flexDirection: 'row', gap: 8 },
  deleteConfirmCancel: {
    flex: 1, paddingVertical: 9, borderRadius: 8,
    backgroundColor: '#f0f0ef', alignItems: 'center',
  },
  deleteConfirmCancelText: { color: '#555', fontWeight: '600', fontSize: 14 },
  deleteConfirmOk: {
    flex: 1, paddingVertical: 9, borderRadius: 8,
    backgroundColor: '#c0392b', alignItems: 'center',
  },
  deleteConfirmOkText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  modalActions: { flexDirection: 'row', gap: 10, marginTop: 16 },
  modalBtn: {
    flex: 1, borderRadius: 10, paddingVertical: 14,
    alignItems: 'center', justifyContent: 'center',
  },
  cancelBtn: { backgroundColor: '#f0f0ef' },
  cancelBtnText: { color: '#555', fontWeight: '600', fontSize: 15 },
  saveBtn: { backgroundColor: '#1a5c2e' },
  saveBtnText: { color: '#fff', fontWeight: '600', fontSize: 15 },
  disabled: { opacity: 0.4 },

  // CSV modal
  csvErrors: { backgroundColor: '#fff8f5', borderRadius: 8, padding: 10, marginBottom: 10, gap: 4 },
  csvError: { fontSize: 13, color: '#c0392b' },
  csvNoRows: { color: '#aaa', textAlign: 'center', padding: 20 },
  csvList: { maxHeight: 380 },
  csvSectionLabel: {
    fontSize: 12, fontWeight: '700', color: '#888',
    textTransform: 'uppercase', letterSpacing: 0.5,
    paddingTop: 14, paddingBottom: 6,
  },
  csvGameRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#f0f0ef',
  },
  csvGameDate: { fontSize: 13, fontWeight: '700', color: '#1a5c2e', width: 52, flexShrink: 0 },
  csvGameOpponent: { fontSize: 15, fontWeight: '600', color: '#1a1a1a' },
  csvGameMeta: { fontSize: 12, color: '#888', marginTop: 2 },

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
