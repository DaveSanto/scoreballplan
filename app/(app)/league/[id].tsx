import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../../src/store/AuthContext';
import { useApp } from '../../../src/store/AppContext';
import {
  subscribeToInvitesByLeague,
  createInvite,
  deleteLeagueInvite,
  createTeam as dbCreateTeam,
  updateTeam as dbUpdateTeam,
  saveSchedule,
  updateLeague,
} from '../../../src/firebase/db';
import { generateSchedule } from '../../../src/utils/scheduler';
import { GameSlot, LeagueInvite, Schedule, ScheduledGame, ScheduleConfig, Sport, Team, TeamScheduleStats, DEFAULT_RULES } from '../../../src/types';
import { GameRulesModal } from '../../../src/components/GameRulesModal';

type Tab = 'teams' | 'league-schedule' | 'invites';

const APP_BASE_URL = 'https://scoreball.app';

// ── League CSV helpers ────────────────────────────────────────────────────────

const LEAGUE_CSV_TEMPLATE =
  'Date,Time,Field,Home Team,Away Team\n' +
  'Tuesday June 16,6:30 PM,Main Diamond,Team A,Team B\n' +
  'Tuesday June 23,8:15 PM,Field 2,Team C,Team A';

type ParsedLeagueSchedule = {
  games: ScheduledGame[];
  warnings: string[];
  stats: TeamScheduleStats[];
};

function splitCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  for (const ch of line) {
    if (ch === '"') { inQuotes = !inQuotes; }
    else if (ch === ',' && !inQuotes) { result.push(current.trim()); current = ''; }
    else { current += ch; }
  }
  result.push(current.trim());
  return result;
}

function matchTeamByName(name: string, teams: Team[]): Team | undefined {
  const n = name.trim().toLowerCase();
  return teams.find((t) => t.name.toLowerCase() === n);
}

function computeLeagueStats(games: ScheduledGame[], teams: Team[]): TeamScheduleStats[] {
  const map: Record<string, TeamScheduleStats> = {};
  teams.forEach((t) => {
    map[t.id] = { teamId: t.id, teamName: t.name, totalGames: 0, homeGames: 0, awayGames: 0, swampGames: 0, gamesAt630: 0, gamesAt815: 0 };
  });
  for (const g of games) {
    if (g.homeId && map[g.homeId]) {
      map[g.homeId].totalGames++;
      map[g.homeId].homeGames++;
      if (g.isSwamp) map[g.homeId].swampGames++;
      if (g.startTime.includes('6:30')) map[g.homeId].gamesAt630++;
      else map[g.homeId].gamesAt815++;
    }
    if (g.awayId && map[g.awayId]) {
      map[g.awayId].totalGames++;
      map[g.awayId].awayGames++;
      if (g.isSwamp) map[g.awayId].swampGames++;
      if (g.startTime.includes('6:30')) map[g.awayId].gamesAt630++;
      else map[g.awayId].gamesAt815++;
    }
  }
  return Object.values(map);
}

function parseLeagueScheduleCsv(csv: string, teams: Team[]): ParsedLeagueSchedule {
  const lines = csv.split('\n').map((l) => l.trim()).filter(Boolean);
  if (lines.length < 2) {
    return { games: [], warnings: ['CSV has no data rows.'], stats: [] };
  }
  const warnings: string[] = [];
  const games: ScheduledGame[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = splitCsvLine(lines[i]);
    if (cols.length < 5) {
      warnings.push(`Row ${i + 1}: expected 5 columns, got ${cols.length} — skipped`);
      continue;
    }
    const [date, time, field, homeTeamName, awayTeamName] = cols;
    const homeTeam = matchTeamByName(homeTeamName, teams);
    const awayTeam = matchTeamByName(awayTeamName, teams);
    if (!homeTeam) warnings.push(`Row ${i + 1}: unrecognized home team "${homeTeamName}"`);
    if (!awayTeam) warnings.push(`Row ${i + 1}: unrecognized away team "${awayTeamName}"`);
    games.push({
      slotId: `csv-${Date.now()}-${i}`,
      date: date.trim(),
      field: field.trim(),
      gameNumber: 1,
      startTime: time.trim(),
      isSwamp: false,
      homeId: homeTeam?.id ?? '',
      home: homeTeam?.name ?? homeTeamName,
      awayId: awayTeam?.id ?? '',
      away: awayTeam?.name ?? awayTeamName,
      isMakeup: false,
      isPlayoff: false,
    });
  }
  return { games, warnings, stats: computeLeagueStats(games, teams) };
}

// ── League teams CSV helpers ──────────────────────────────────────────────────

// Columns: Team Name | Manager Email | Cap1 Name | Cap1 Email | Cap1 Phone |
//          Cap2 Name | Cap2 Email | Cap2 Phone | Color 1 | Color 2 |
//          Logo URL | Field Address | Field City | Field State | Field Zip
const LEAGUE_TEAMS_CSV_TEMPLATE =
  'Team Name,Manager Email,Captain 1 Name,Captain 1 Email,Captain 1 Phone,' +
  'Captain 2 Name,Captain 2 Email,Captain 2 Phone,' +
  'Color 1,Color 2,Logo URL,' +
  'Field Address,Field City,Field State,Field Zip\n' +
  'Thunder Hawks,coach@example.com,Alex Smith,captain@example.com,555-0101,' +
  'Jordan Lee,asst@example.com,555-0102,' +
  '#1a5c2e,#ffffff,,' +
  '123 Main St,Springfield,IL,62701\n' +
  'Rolling Pins,manager@example.com,,,,,,,' +
  '#c0392b,#f5f5f5,,,,,';

type ParsedLeagueTeam = {
  teamName: string;
  managerEmail: string;
  captain1Name: string;
  captain1Email: string;
  captain1Phone: string;
  captain2Name: string;
  captain2Email: string;
  captain2Phone: string;
  color1: string;
  color2: string;
  logoUrl: string;
  fieldAddress: string;
  fieldCity: string;
  fieldState: string;
  fieldZip: string;
};

type ParsedLeagueTeamsResult = {
  teams: ParsedLeagueTeam[];
  warnings: string[];
};

function parseLeagueTeamsCsv(csv: string, existingNames: string[]): ParsedLeagueTeamsResult {
  const lines = csv.split('\n').map((l) => l.trim()).filter(Boolean);
  if (lines.length < 2) return { teams: [], warnings: ['CSV has no data rows.'] };
  const warnings: string[] = [];
  const teams: ParsedLeagueTeam[] = [];
  const existingNorm = existingNames.map((n) => n.toLowerCase());
  const seenThisImport = new Set<string>();
  for (let i = 1; i < lines.length; i++) {
    const cols = splitCsvLine(lines[i]);
    const c = (idx: number) => cols[idx]?.trim() ?? '';
    const teamName = c(0);
    if (!teamName) { warnings.push(`Row ${i + 1}: missing team name — skipped`); continue; }
    if (existingNorm.includes(teamName.toLowerCase())) {
      warnings.push(`Row ${i + 1}: "${teamName}" is already in this league — skipped`);
      continue;
    }
    if (seenThisImport.has(teamName.toLowerCase())) {
      warnings.push(`Row ${i + 1}: duplicate team name "${teamName}" — skipped`);
      continue;
    }
    seenThisImport.add(teamName.toLowerCase());
    const managerEmail  = c(1);
    const captain1Name  = c(2);
    const captain1Email = c(3);
    const captain1Phone = c(4);
    const captain2Name  = c(5);
    const captain2Email = c(6);
    const captain2Phone = c(7);
    const color1        = c(8);
    const color2        = c(9);
    const logoUrl       = c(10);
    const fieldAddress  = c(11);
    const fieldCity     = c(12);
    const fieldState    = c(13);
    const fieldZip      = c(14);
    if (!managerEmail && !captain1Email && !captain2Email) {
      warnings.push(`Row ${i + 1}: "${teamName}" has no contact emails — team will be created but no invites sent`);
    }
    teams.push({
      teamName, managerEmail,
      captain1Name, captain1Email, captain1Phone,
      captain2Name, captain2Email, captain2Phone,
      color1, color2, logoUrl,
      fieldAddress, fieldCity, fieldState, fieldZip,
    });
  }
  return { teams, warnings };
}

// ── Main screen ───────────────────────────────────────────────────────────────

export default function LeagueScreen() {
  const { id: leagueId } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const { leagues, teams, hiddenTeams, getTeamPlayers, addTeamToLeague, removeTeamFromLeague, unhideTeam, setLeagueRules } = useApp();
  const league = leagues.find((l) => l.id === leagueId);
  const isLeagueOwner = league?.ownerId === user?.uid;
  const isLeagueAdmin = isLeagueOwner || (league?.leagueAssistantAdminIds ?? []).includes(user?.uid ?? '');
  const [activeTab, setActiveTab] = useState<Tab>('teams');
  const [invites, setInvites] = useState<LeagueInvite[]>([]);
  const [rulesModalOpen, setRulesModalOpen] = useState(false);

  useEffect(() => {
    if (!leagueId) return;
    return subscribeToInvitesByLeague(leagueId, setInvites);
  }, [leagueId]);

  if (!league) {
    return <View style={styles.loader}><ActivityIndicator color="#1a5c2e" /></View>;
  }

  const leagueTeams = teams.filter((t) => league.teamIds.includes(t.id));
  const hiddenLeagueTeams = hiddenTeams.filter((t) => league.teamIds.includes(t.id));
  const availableTeams = teams.filter((t) => !league.teamIds.includes(t.id));
  const pendingCount = invites.filter((i) => i.status === 'pending').length;

  const effectiveRules = league?.rules ?? DEFAULT_RULES;
  const formatLabel = `${effectiveRules.fieldPlayerCount}-player field · ${effectiveRules.battingAllPlayers ? 'all bat' : 'starters bat'}`;

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      {/* Format row */}
      <Pressable
        style={styles.formatRow}
        onPress={() => isLeagueAdmin && setRulesModalOpen(true)}
        disabled={!isLeagueAdmin}
      >
        <Ionicons name="options-outline" size={15} color="#1a5c2e" />
        <Text style={styles.formatLabel}>Format: {formatLabel}</Text>
        {isLeagueAdmin && <Ionicons name="chevron-forward" size={14} color="#aaa" />}
      </Pressable>

      <View style={styles.tabs}>
        {(['teams', 'league-schedule', 'invites'] as Tab[]).map((tab) => (
          <Pressable
            key={tab}
            style={[styles.tab, activeTab === tab && styles.tabActive]}
            onPress={() => setActiveTab(tab)}
          >
            <Text style={[styles.tabText, activeTab === tab && styles.tabTextActive]}>
              {tab === 'teams' ? 'Teams' : tab === 'league-schedule' ? 'League Schedule' : 'Capt / Mgr Invites'}
            </Text>
            {tab === 'invites' && pendingCount > 0 && (
              <View style={styles.badgeDot}><Text style={styles.badgeDotText}>{pendingCount}</Text></View>
            )}
          </Pressable>
        ))}
      </View>

      {activeTab === 'teams' && (
        <TeamsTab
          leagueId={leagueId}
          leagueName={league.name}
          leagueSport={league.sport}
          leagueTeams={leagueTeams}
          hiddenLeagueTeams={hiddenLeagueTeams}
          availableTeams={availableTeams}
          getTeamPlayers={getTeamPlayers}
          onAddTeam={(teamId) => addTeamToLeague(leagueId, teamId)}
          onUnhideTeam={unhideTeam}
          onRemoveTeam={(teamId) =>
            Alert.alert('Remove Team', 'Remove this team from the league?', [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Remove', style: 'destructive', onPress: () => removeTeamFromLeague(leagueId, teamId) },
            ])
          }
          onBulkCreateTeams={async (rows) => {
            const uid = user?.uid ?? '';
            const teamIds = await Promise.all(
              rows.map((row) => {
                const hasField = row.fieldAddress || row.fieldCity || row.fieldState || row.fieldZip;
                return dbCreateTeam(
                  { name: row.teamName, sport: league.sport },
                  uid,
                  {
                    captain1Name:  row.captain1Name  || undefined,
                    captain1Phone: row.captain1Phone || undefined,
                    captain2Name:  row.captain2Name  || undefined,
                    captain2Phone: row.captain2Phone || undefined,
                    color1:   row.color1   || undefined,
                    color2:   row.color2   || undefined,
                    logoUrl:  row.logoUrl  || undefined,
                    homeField: hasField ? {
                      address: row.fieldAddress || undefined,
                      city:    row.fieldCity    || undefined,
                      state:   row.fieldState   || undefined,
                      zip:     row.fieldZip     || undefined,
                    } : undefined,
                  }
                );
              })
            );
            const newTeamIds = [...new Set([...league.teamIds, ...teamIds])];
            await Promise.all([
              updateLeague(leagueId, { teamIds: newTeamIds }),
              ...teamIds.map((id) => dbUpdateTeam(id, { leagueId })),
            ]);
            const inviteJobs: Promise<any>[] = [];
            rows.forEach((row, i) => {
              [row.managerEmail, row.captain1Email, row.captain2Email]
                .filter(Boolean)
                .forEach((email) =>
                  inviteJobs.push(createInvite({
                    leagueId,
                    leagueName: league.name,
                    invitedEmail: email!,
                    invitedBy: uid,
                    teamId: teamIds[i],
                    teamName: row.teamName,
                  }))
                );
            });
            await Promise.all(inviteJobs);
          }}
        />
      )}
      {activeTab === 'league-schedule' && (
        <ScheduleTab
          leagueId={leagueId}
          leagueTeams={leagueTeams}
          schedule={league.schedule}
          scheduleConfig={league.scheduleConfig}
        />
      )}
      {activeTab === 'invites' && (
        <InvitesTab
          leagueId={leagueId}
          leagueName={league.name}
          leagueTeams={leagueTeams}
          invites={invites}
          invitedBy={user?.uid ?? ''}
          isAdmin={isLeagueAdmin}
        />
      )}

      <GameRulesModal
        visible={rulesModalOpen}
        rules={effectiveRules}
        title={`${league.name} — Game Format`}
        onSave={(rules) => setLeagueRules(leagueId, rules)}
        onClose={() => setRulesModalOpen(false)}
      />
    </SafeAreaView>
  );
}

// ── Teams tab ─────────────────────────────────────────────────────────────────

function TeamsTab({
  leagueId,
  leagueName,
  leagueSport,
  leagueTeams,
  hiddenLeagueTeams,
  availableTeams,
  getTeamPlayers,
  onAddTeam,
  onUnhideTeam,
  onRemoveTeam,
  onBulkCreateTeams,
}: {
  leagueId: string;
  leagueName: string;
  leagueSport: Sport;
  leagueTeams: Team[];
  hiddenLeagueTeams: Team[];
  availableTeams: Team[];
  getTeamPlayers: (teamId: string) => any[];
  onAddTeam: (teamId: string) => Promise<void>;
  onUnhideTeam: (teamId: string) => Promise<void>;
  onRemoveTeam: (teamId: string) => void;
  onBulkCreateTeams: (rows: ParsedLeagueTeam[]) => Promise<void>;
}) {
  const [addModal, setAddModal] = useState(false);
  const teamsFileInputRef = useRef<any>(null);
  const [teamsCsvPreview, setTeamsCsvPreview] = useState<ParsedLeagueTeamsResult | null>(null);
  const [teamsCsvModal, setTeamsCsvModal] = useState(false);
  const [teamsImporting, setTeamsImporting] = useState(false);
  const [teamsImportError, setTeamsImportError] = useState<string | null>(null);

  function handleTeamsCsvUpload() {
    if (Platform.OS === 'web') { teamsFileInputRef.current?.click(); }
    else { Alert.alert('Use Web', 'CSV import is available on the web version.'); }
  }

  function handleTeamsFileChange(e: any) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const existing = leagueTeams.map((t) => t.name);
      setTeamsCsvPreview(parseLeagueTeamsCsv(text, existing));
      setTeamsCsvModal(true);
    };
    reader.readAsText(file);
    e.target.value = '';
  }

  function downloadTeamsTemplate() {
    if (Platform.OS === 'web') {
      const blob = new Blob([LEAGUE_TEAMS_CSV_TEMPLATE], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = 'league_teams_template.csv'; a.click();
      URL.revokeObjectURL(url);
    } else {
      Alert.alert('CSV Format', 'Columns: Team Name, Manager Email, Captain 1 Email, Captain 2 Email\n\nThe sport is set to the league\'s sport automatically.');
    }
  }

  async function handleTeamsCsvImport(teams: ParsedLeagueTeam[]) {
    setTeamsImporting(true);
    setTeamsImportError(null);
    try {
      await onBulkCreateTeams(teams);
      setTeamsCsvModal(false);
      setTeamsCsvPreview(null);
    } catch (e: any) {
      const msg: string = e?.message ?? '';
      if (msg.includes('Missing or insufficient permissions')) {
        setTeamsImportError('Permission denied — make sure you\'re signed in as the league admin.');
      } else {
        setTeamsImportError(msg || 'Import failed. Please try again.');
      }
    } finally {
      setTeamsImporting(false);
    }
  }

  return (
    <View style={{ flex: 1 }}>
      {Platform.OS === 'web' && (
        <input type="file" accept=".csv" ref={teamsFileInputRef} style={{ display: 'none' }} onChange={handleTeamsFileChange} />
      )}
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Teams ({leagueTeams.length})</Text>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <View style={styles.csvBtnGroup}>
            <Pressable style={styles.csvBtnGroupLeft} onPress={handleTeamsCsvUpload}>
              <Ionicons name="cloud-upload-outline" size={15} color="#555" />
              <Text style={styles.csvBtnGroupText}>Import CSV</Text>
            </Pressable>
            <View style={styles.csvBtnGroupDivider} />
            <Pressable style={styles.csvBtnGroupRight} onPress={downloadTeamsTemplate} hitSlop={6}>
              <Ionicons name="download-outline" size={15} color="#555" />
            </Pressable>
          </View>
          {availableTeams.length > 0 && (
            <Pressable style={styles.addChip} onPress={() => setAddModal(true)}>
              <Ionicons name="add" size={16} color="#1a5c2e" />
              <Text style={styles.addChipText}>Add Team</Text>
            </Pressable>
          )}
        </View>
      </View>

      {leagueTeams.length === 0 && hiddenLeagueTeams.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="people-outline" size={44} color="#ccc" />
          <Text style={styles.emptyText}>No teams yet.</Text>
          {availableTeams.length > 0 ? (
            <Pressable style={styles.emptyBtn} onPress={() => setAddModal(true)}>
              <Text style={styles.emptyBtnText}>Add a Team</Text>
            </Pressable>
          ) : (
            <>
              <Pressable style={styles.emptyBtn} onPress={handleTeamsCsvUpload}>
                <Text style={styles.emptyBtnText}>Import from CSV</Text>
              </Pressable>
              <Text style={styles.emptyHint}>Or create teams on the dashboard and add them here.</Text>
            </>
          )}
        </View>
      ) : (
        <FlatList
          data={leagueTeams}
          keyExtractor={(t) => t.id}
          contentContainerStyle={styles.list}
          ListFooterComponent={
            hiddenLeagueTeams.length > 0 ? (
              <View style={{ marginTop: 8 }}>
                <Text style={styles.hiddenSectionLabel}>Hidden from your dashboard</Text>
                {hiddenLeagueTeams.map((item) => (
                  <View key={item.id} style={styles.hiddenTeamRow}>
                    <Text style={styles.sportEmoji}>{item.sport === 'softball' ? '🥎' : '⚾'}</Text>
                    <View style={styles.teamInfo}>
                      <Text style={[styles.teamName, { color: '#aaa' }]}>{item.name}</Text>
                      <Text style={styles.teamMeta}>{item.playerIds.length} players</Text>
                    </View>
                    <Pressable
                      style={styles.unhideBtn}
                      onPress={() => onUnhideTeam(item.id)}
                    >
                      <Ionicons name="eye-outline" size={14} color="#1a5c2e" />
                      <Text style={styles.unhideBtnText}>Show</Text>
                    </Pressable>
                  </View>
                ))}
              </View>
            ) : null
          }
          renderItem={({ item }) => (
            <Pressable
              style={styles.teamRow}
              onPress={() => router.push(`/(app)/team/${item.id}`)}
              onLongPress={() => onRemoveTeam(item.id)}
            >
              <Text style={styles.sportEmoji}>{item.sport === 'softball' ? '🥎' : '⚾'}</Text>
              <View style={styles.teamInfo}>
                <Text style={styles.teamName}>{item.name}</Text>
                <Text style={styles.teamMeta}>{getTeamPlayers(item.id).length} players</Text>
              </View>
              {item.captainId && (
                <View style={styles.captainChip}><Text style={styles.captainChipText}>Captain</Text></View>
              )}
              <Ionicons name="chevron-forward" size={18} color="#ccc" />
            </Pressable>
          )}
        />
      )}

      <Modal visible={addModal} animationType="slide" transparent onRequestClose={() => setAddModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Add Team to League</Text>
            <ScrollView style={styles.pickerList}>
              {availableTeams.map((team) => (
                <Pressable
                  key={team.id}
                  style={styles.pickerRow}
                  onPress={async () => { await onAddTeam(team.id); setAddModal(false); }}
                >
                  <Text style={styles.sportEmoji}>{team.sport === 'softball' ? '🥎' : '⚾'}</Text>
                  <Text style={styles.pickerName}>{team.name}</Text>
                  <Ionicons name="add-circle-outline" size={22} color="#1a5c2e" />
                </Pressable>
              ))}
            </ScrollView>
            <Pressable style={styles.doneBtn} onPress={() => setAddModal(false)}>
              <Text style={styles.doneBtnText}>Done</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {teamsCsvPreview && (
        <LeagueTeamsImportModal
          visible={teamsCsvModal}
          parsed={teamsCsvPreview}
          importing={teamsImporting}
          importError={teamsImportError}
          onClose={() => { setTeamsCsvModal(false); setTeamsCsvPreview(null); setTeamsImportError(null); }}
          onDownloadTemplate={downloadTeamsTemplate}
          onImport={() => handleTeamsCsvImport(teamsCsvPreview.teams)}
        />
      )}
    </View>
  );
}

// ── League teams import modal ─────────────────────────────────────────────────

function LeagueTeamsImportModal({
  visible,
  parsed,
  importing,
  importError,
  onClose,
  onDownloadTemplate,
  onImport,
}: {
  visible: boolean;
  parsed: ParsedLeagueTeamsResult;
  importing: boolean;
  importError: string | null;
  onClose: () => void;
  onDownloadTemplate: () => void;
  onImport: () => void;
}) {
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={[styles.modalCard, { maxHeight: '88%' }]}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>
              Import Teams ({parsed.teams.length})
            </Text>
            <Pressable onPress={onClose}>
              <Ionicons name="close" size={22} color="#888" />
            </Pressable>
          </View>

          {parsed.warnings.length > 0 && (
            <View style={styles.csvWarnBox}>
              <Text style={styles.warningTitle}>{parsed.warnings.length} warning{parsed.warnings.length !== 1 ? 's' : ''}</Text>
              {parsed.warnings.map((w, i) => (
                <Text key={i} style={styles.warningText}>• {w}</Text>
              ))}
            </View>
          )}

          {importError && (
            <View style={[styles.csvWarnBox, { backgroundColor: '#fff0f0' }]}>
              <Text style={[styles.warningTitle, { color: '#c0392b' }]}>Import failed</Text>
              <Text style={[styles.warningText, { color: '#c0392b' }]}>{importError}</Text>
            </View>
          )}

          {parsed.teams.length === 0 ? (
            <View style={styles.empty}>
              <Text style={styles.emptyText}>No new teams to import.</Text>
              <Text style={styles.emptyHint}>Check for duplicate team names or empty rows.</Text>
              <Pressable style={[styles.emptyBtn, { marginTop: 8 }]} onPress={onDownloadTemplate}>
                <Text style={styles.emptyBtnText}>Download Template</Text>
              </Pressable>
            </View>
          ) : (
            <ScrollView style={{ flex: 1, marginVertical: 8 }}>
              {parsed.teams.map((team, i) => {
                const inviteEmails = [team.managerEmail, team.captain1Email, team.captain2Email].filter(Boolean);
                const hasField = team.fieldCity || team.fieldAddress;
                const fieldLine = [team.fieldAddress, team.fieldCity, team.fieldState, team.fieldZip].filter(Boolean).join(', ');
                return (
                  <View key={i} style={styles.teamsImportRow}>
                    {/* Color swatches */}
                    {(team.color1 || team.color2) && (
                      <View style={{ flexDirection: 'row', gap: 3, marginRight: 8 }}>
                        {team.color1 ? <View style={{ width: 16, height: 16, borderRadius: 8, backgroundColor: team.color1, borderWidth: 1, borderColor: '#ddd' }} /> : null}
                        {team.color2 ? <View style={{ width: 16, height: 16, borderRadius: 8, backgroundColor: team.color2, borderWidth: 1, borderColor: '#ddd' }} /> : null}
                      </View>
                    )}
                    <View style={{ flex: 1, gap: 2 }}>
                      <Text style={styles.teamsImportName}>{team.teamName}</Text>

                      {/* Manager */}
                      {team.managerEmail ? (
                        <Text style={styles.teamsImportContact}>Manager: {team.managerEmail}</Text>
                      ) : null}

                      {/* Captain 1 */}
                      {(team.captain1Name || team.captain1Email || team.captain1Phone) ? (
                        <Text style={styles.teamsImportContact}>
                          Cap 1: {[team.captain1Name, team.captain1Email, team.captain1Phone].filter(Boolean).join(' · ')}
                        </Text>
                      ) : null}

                      {/* Captain 2 */}
                      {(team.captain2Name || team.captain2Email || team.captain2Phone) ? (
                        <Text style={styles.teamsImportContact}>
                          Cap 2: {[team.captain2Name, team.captain2Email, team.captain2Phone].filter(Boolean).join(' · ')}
                        </Text>
                      ) : null}

                      {/* Home field */}
                      {hasField ? (
                        <Text style={styles.teamsImportContact}>Field: {fieldLine}</Text>
                      ) : null}

                      {inviteEmails.length === 0 && (
                        <Text style={[styles.teamsImportContact, { color: '#e67e22' }]}>No contacts — invite later</Text>
                      )}
                    </View>
                    <View style={styles.teamsImportBadge}>
                      <Text style={styles.teamsImportBadgeText}>
                        {inviteEmails.length} invite{inviteEmails.length !== 1 ? 's' : ''}
                      </Text>
                    </View>
                  </View>
                );
              })}
            </ScrollView>
          )}

          <Pressable style={styles.templateLink} onPress={onDownloadTemplate}>
            <Text style={styles.templateLinkText}>Download template</Text>
          </Pressable>

          <View style={styles.modalActions}>
            <Pressable style={[styles.modalBtn, styles.cancelBtn]} onPress={onClose}>
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </Pressable>
            <Pressable
              style={[styles.modalBtn, styles.saveBtn, (importing || parsed.teams.length === 0) && styles.disabled]}
              onPress={onImport}
              disabled={importing || parsed.teams.length === 0}
            >
              {importing
                ? <ActivityIndicator color="#fff" size="small" />
                : <Text style={styles.saveBtnText}>Create {parsed.teams.length} Team{parsed.teams.length !== 1 ? 's' : ''}</Text>}
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ── Schedule tab ──────────────────────────────────────────────────────────────

function ScheduleTab({
  leagueId,
  leagueTeams,
  schedule,
  scheduleConfig,
}: {
  leagueId: string;
  leagueTeams: Team[];
  schedule?: Schedule;
  scheduleConfig?: ScheduleConfig;
}) {
  const [slots, setSlots] = useState<GameSlot[]>(scheduleConfig?.slots ?? []);
  const [swampTarget, setSwampTarget] = useState(scheduleConfig?.swampGamesPerTeam ?? 0);
  const [allowDoubleheaders, setAllowDoubleheaders] = useState(scheduleConfig?.allowDoubleheaders ?? false);
  const [showSlotModal, setShowSlotModal] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [localSchedule, setLocalSchedule] = useState(schedule);
  const [view, setView] = useState<'configure' | 'schedule'>(schedule ? 'schedule' : 'configure');

  const fileInputRef = useRef<any>(null);
  const [csvPreview, setCsvPreview] = useState<ParsedLeagueSchedule | null>(null);
  const [csvModal, setCsvModal] = useState(false);
  const [importing, setImporting] = useState(false);

  useEffect(() => {
    if (scheduleConfig) {
      setSlots(scheduleConfig.slots ?? []);
      setSwampTarget(scheduleConfig.swampGamesPerTeam ?? 0);
      setAllowDoubleheaders(scheduleConfig.allowDoubleheaders ?? false);
    }
    if (schedule) { setLocalSchedule(schedule); setView('schedule'); }
  }, [scheduleConfig, schedule]);

  const regularSlots = slots.filter((s) => !s.isMakeup && !s.isPlayoff);
  const expectedGames = (leagueTeams.length * (leagueTeams.length - 1)) / 2;

  async function handleGenerate() {
    if (leagueTeams.length < 2) {
      Alert.alert('Not enough teams', 'Add at least 2 teams to the league.');
      return;
    }
    if (regularSlots.length < expectedGames) {
      Alert.alert(
        'Not enough slots',
        `A full round-robin needs ${expectedGames} regular slots. You have ${regularSlots.length}.`
      );
      return;
    }
    setGenerating(true);
    setTimeout(async () => {
      try {
        const schedulerTeams = leagueTeams.map((t) => ({ id: t.id, name: t.name }));
        const result = generateSchedule(schedulerTeams, slots, { swampGamesPerTeam: swampTarget, allowDoubleheaders });
        if (result.error) {
          Alert.alert('Cannot generate', result.warnings.join('\n'));
          return;
        }
        const config: ScheduleConfig = { slots, swampGamesPerTeam: swampTarget, allowDoubleheaders };
        const { error: _err, ...scheduleData } = result;
        await saveSchedule(leagueId, scheduleData, config);
        setLocalSchedule(scheduleData);
        setView('schedule');
        if (result.warnings.length > 0) {
          Alert.alert('Done', `Schedule generated with ${result.warnings.length} warning(s):\n${result.warnings.slice(0, 5).join('\n')}`);
        }
      } catch (e: any) {
        Alert.alert('Error', e?.message ?? 'Failed to generate schedule.');
      } finally {
        setGenerating(false);
      }
    }, 50);
  }

  async function saveSlots(newSlots: GameSlot[]) {
    setSlots(newSlots);
    await updateLeague(leagueId, {
      scheduleConfig: { slots: newSlots, swampGamesPerTeam: swampTarget, allowDoubleheaders },
    });
  }

  function handleCsvUpload() {
    if (Platform.OS === 'web') {
      fileInputRef.current?.click();
    } else {
      Alert.alert('Use Web', 'CSV import is available on the web version.');
    }
  }

  function handleFileChange(e: any) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      setCsvPreview(parseLeagueScheduleCsv(text, leagueTeams));
      setCsvModal(true);
    };
    reader.readAsText(file);
    e.target.value = '';
  }

  function downloadTemplate() {
    if (Platform.OS === 'web') {
      const blob = new Blob([LEAGUE_CSV_TEMPLATE], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'league_schedule_template.csv';
      a.click();
      URL.revokeObjectURL(url);
    } else {
      Alert.alert('CSV Format', 'Columns: Date, Time, Field, Home Team, Away Team\n\nExample:\nTuesday June 16,6:30 PM,Main Diamond,Team A,Team B');
    }
  }

  async function handleCsvImport(parsed: ParsedLeagueSchedule) {
    setImporting(true);
    try {
      const sched: Schedule = {
        games: parsed.games,
        warnings: parsed.warnings,
        stats: parsed.stats,
        generatedAt: new Date().toISOString(),
      };
      const config: ScheduleConfig = { slots, swampGamesPerTeam: swampTarget, allowDoubleheaders };
      await saveSchedule(leagueId, sched, config);
      setLocalSchedule(sched);
      setCsvModal(false);
      setCsvPreview(null);
      setView('schedule');
    } catch (e: any) {
      Alert.alert('Error', e?.message ?? 'Failed to save schedule.');
    } finally {
      setImporting(false);
    }
  }

  if (view === 'schedule' && localSchedule) {
    return (
      <View style={{ flex: 1 }}>
        {Platform.OS === 'web' && (
          <input type="file" accept=".csv" ref={fileInputRef} style={{ display: 'none' }} onChange={handleFileChange} />
        )}
        <View style={styles.schedHeader}>
          <Text style={styles.schedTitle}>{localSchedule.games.length} games · {leagueTeams.length} teams</Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <View style={styles.csvBtnGroup}>
              <Pressable style={styles.csvBtnGroupLeft} onPress={handleCsvUpload}>
                <Ionicons name="cloud-upload-outline" size={14} color="#555" />
                <Text style={styles.csvBtnGroupText}>Import CSV</Text>
              </Pressable>
              <View style={styles.csvBtnGroupDivider} />
              <Pressable style={styles.csvBtnGroupRight} onPress={downloadTemplate} hitSlop={6}>
                <Ionicons name="download-outline" size={14} color="#555" />
              </Pressable>
            </View>
            <Pressable style={styles.reconfigBtn} onPress={() => setView('configure')}>
              <Ionicons name="settings-outline" size={14} color="#1a5c2e" />
              <Text style={styles.reconfigBtnText}>Reconfigure</Text>
            </Pressable>
          </View>
        </View>
        <ScheduleView schedule={localSchedule} />
        {csvPreview && (
          <CsvLeagueScheduleModal
            visible={csvModal}
            parsed={csvPreview}
            importing={importing}
            onClose={() => { setCsvModal(false); setCsvPreview(null); }}
            onImport={() => handleCsvImport(csvPreview)}
          />
        )}
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      {Platform.OS === 'web' && (
        <input type="file" accept=".csv" ref={fileInputRef} style={{ display: 'none' }} onChange={handleFileChange} />
      )}
      <ScrollView contentContainerStyle={styles.configScroll}>
        <View style={styles.configCard}>
          <Text style={styles.configCardLabel}>Import from CSV</Text>
          <Text style={styles.configHint}>Upload a CSV with columns: Date, Time, Field, Home Team, Away Team.</Text>
          <View style={styles.csvImportRow}>
            <Pressable style={[styles.addChip, { flex: 1, justifyContent: 'center' }]} onPress={handleCsvUpload}>
              <Ionicons name="cloud-upload-outline" size={15} color="#1a5c2e" />
              <Text style={styles.addChipText}>Choose CSV File</Text>
            </Pressable>
            <Pressable style={[styles.addChip, { flex: 1, justifyContent: 'center', borderColor: '#888' }]} onPress={downloadTemplate}>
              <Ionicons name="download-outline" size={15} color="#888" />
              <Text style={[styles.addChipText, { color: '#888' }]}>Download Template</Text>
            </Pressable>
          </View>
        </View>
        <View style={styles.orDivider}>
          <View style={styles.orLine} />
          <Text style={styles.orText}>OR generate automatically</Text>
          <View style={styles.orLine} />
        </View>
        <View style={styles.configCard}>
          <Text style={styles.configCardLabel}>Teams in league</Text>
        <Text style={styles.configCardValue}>
          {leagueTeams.length} teams · {expectedGames} games needed for round-robin
        </Text>
      </View>

      <View style={styles.configCard}>
        <View style={styles.configCardHeader}>
          <Text style={styles.configCardLabel}>
            Game Slots ({regularSlots.length} regular)
          </Text>
          <Pressable onPress={() => setShowSlotModal(true)}>
            <Ionicons name="add-circle-outline" size={22} color="#1a5c2e" />
          </Pressable>
        </View>
        {slots.length === 0 ? (
          <Text style={styles.configHint}>No slots yet — tap + to add.</Text>
        ) : (
          slots.slice(0, 8).map((slot) => (
            <View key={slot.id} style={styles.slotRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.slotDate}>{slot.date}</Text>
                <Text style={styles.slotMeta}>{slot.field} · {slot.startTime}{slot.isSwamp ? ' · Swamp' : ''}{slot.isMakeup ? ' · Makeup' : ''}{slot.isPlayoff ? ' · Playoff' : ''}</Text>
              </View>
              <Pressable onPress={() => saveSlots(slots.filter((s) => s.id !== slot.id))} hitSlop={8}>
                <Ionicons name="close-circle-outline" size={18} color="#ccc" />
              </Pressable>
            </View>
          ))
        )}
        {slots.length > 8 && (
          <Text style={styles.configHint}>…and {slots.length - 8} more slots</Text>
        )}
      </View>

      <View style={styles.configCard}>
        <Text style={styles.configCardLabel}>Options</Text>
        <View style={styles.optionRow}>
          <Text style={styles.optionLabel}>Swamp games per team</Text>
          <View style={styles.stepper}>
            <Pressable style={styles.stepBtn} onPress={() => setSwampTarget((n) => Math.max(0, n - 1))}>
              <Text style={styles.stepBtnText}>−</Text>
            </Pressable>
            <Text style={styles.stepValue}>{swampTarget}</Text>
            <Pressable style={styles.stepBtn} onPress={() => setSwampTarget((n) => n + 1)}>
              <Text style={styles.stepBtnText}>+</Text>
            </Pressable>
          </View>
        </View>
        <View style={styles.optionRow}>
          <Text style={styles.optionLabel}>Allow doubleheaders</Text>
          <Pressable
            style={[styles.togglePill, allowDoubleheaders && styles.togglePillOn]}
            onPress={() => setAllowDoubleheaders((v) => !v)}
          >
            <Text style={[styles.togglePillText, allowDoubleheaders && styles.togglePillTextOn]}>
              {allowDoubleheaders ? 'Yes' : 'No'}
            </Text>
          </Pressable>
        </View>
      </View>

      <Pressable
        style={[styles.generateBtn, (generating || leagueTeams.length < 2) && styles.disabled]}
        onPress={handleGenerate}
        disabled={generating || leagueTeams.length < 2}
      >
        {generating ? (
          <ActivityIndicator color="#fff" size="small" />
        ) : (
          <>
            <Ionicons name="flash" size={18} color="#fff" />
            <Text style={styles.generateBtnText}>Generate Schedule</Text>
          </>
        )}
      </Pressable>
      {generating && <Text style={styles.generatingHint}>Running optimizer… this takes a moment.</Text>}

        <SlotModal
          visible={showSlotModal}
          onClose={() => setShowSlotModal(false)}
          onAdd={(slot) => {
            const newSlots = [...slots, slot];
            saveSlots(newSlots);
            setShowSlotModal(false);
          }}
        />
      </ScrollView>
      {csvPreview && (
        <CsvLeagueScheduleModal
          visible={csvModal}
          parsed={csvPreview}
          importing={importing}
          onClose={() => { setCsvModal(false); setCsvPreview(null); }}
          onImport={() => handleCsvImport(csvPreview)}
        />
      )}
    </View>
  );
}

function ScheduleView({ schedule }: { schedule: Schedule }) {
  const [showStats, setShowStats] = useState(false);

  const grouped: Record<string, typeof schedule.games> = {};
  schedule.games.forEach((g) => {
    if (!grouped[g.date]) grouped[g.date] = [];
    grouped[g.date].push(g);
  });

  if (showStats) {
    return (
      <ScrollView contentContainerStyle={styles.statsList}>
        <Pressable style={styles.backBtn} onPress={() => setShowStats(false)}>
          <Ionicons name="arrow-back" size={16} color="#1a5c2e" />
          <Text style={styles.backBtnText}>Games</Text>
        </Pressable>
        <View style={styles.statsHeader}>
          {['Team', 'G', 'H', 'A', 'Swamp', '6:30', '8:15'].map((h) => (
            <Text key={h} style={[styles.statsCell, h === 'Team' && styles.statsCellTeam]}>{h}</Text>
          ))}
        </View>
        {schedule.stats.map((s) => (
          <View key={s.teamId} style={styles.statsRow}>
            <Text style={[styles.statsCell, styles.statsCellTeam]} numberOfLines={1}>{s.teamName}</Text>
            <Text style={styles.statsCell}>{s.totalGames}</Text>
            <Text style={styles.statsCell}>{s.homeGames}</Text>
            <Text style={styles.statsCell}>{s.awayGames}</Text>
            <Text style={styles.statsCell}>{s.swampGames}</Text>
            <Text style={styles.statsCell}>{s.gamesAt630}</Text>
            <Text style={styles.statsCell}>{s.gamesAt815}</Text>
          </View>
        ))}
      </ScrollView>
    );
  }

  return (
    <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
      {Object.entries(grouped).map(([date, games]) => (
        <View key={date}>
          <Text style={styles.dateHeader}>{date}</Text>
          {games.map((g) => (
            <View key={g.slotId} style={styles.gameRow}>
              <Text style={styles.gameTime}>{g.startTime}</Text>
              <View style={styles.gameMatchup}>
                <Text style={styles.gameHome} numberOfLines={1}>{g.home}</Text>
                <Text style={styles.gameVs}>vs</Text>
                <Text style={styles.gameAway} numberOfLines={1}>{g.away}</Text>
              </View>
              <Text style={styles.gameField} numberOfLines={1}>{g.field}</Text>
              {g.isSwamp && <Text style={styles.swampTag}>S</Text>}
            </View>
          ))}
        </View>
      ))}
      {schedule.warnings.length > 0 && (
        <View style={styles.warningBox}>
          <Text style={styles.warningTitle}>Warnings ({schedule.warnings.length})</Text>
          {schedule.warnings.map((w, i) => <Text key={i} style={styles.warningText}>• {w}</Text>)}
        </View>
      )}
      <Pressable style={styles.statsBtn} onPress={() => setShowStats(true)}>
        <Ionicons name="bar-chart-outline" size={16} color="#1a5c2e" />
        <Text style={styles.statsBtnText}>Team Stats</Text>
      </Pressable>
    </ScrollView>
  );
}

// ── CSV league schedule modal ─────────────────────────────────────────────────

function CsvLeagueScheduleModal({
  visible,
  parsed,
  importing,
  onClose,
  onImport,
}: {
  visible: boolean;
  parsed: ParsedLeagueSchedule;
  importing: boolean;
  onClose: () => void;
  onImport: () => void;
}) {
  const hasUnmatched = parsed.games.some((g) => !g.homeId || !g.awayId);

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={[styles.modalCard, { maxHeight: '85%' }]}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Preview ({parsed.games.length} game{parsed.games.length !== 1 ? 's' : ''})</Text>
            <Pressable onPress={onClose}>
              <Ionicons name="close" size={22} color="#888" />
            </Pressable>
          </View>

          {parsed.warnings.length > 0 && (
            <View style={styles.csvWarnBox}>
              <Text style={styles.warningTitle}>{parsed.warnings.length} warning{parsed.warnings.length !== 1 ? 's' : ''}</Text>
              {parsed.warnings.slice(0, 5).map((w, i) => (
                <Text key={i} style={styles.warningText}>• {w}</Text>
              ))}
              {parsed.warnings.length > 5 && (
                <Text style={styles.warningText}>…and {parsed.warnings.length - 5} more</Text>
              )}
            </View>
          )}

          {parsed.games.length === 0 ? (
            <View style={styles.empty}>
              <Text style={styles.emptyText}>No games parsed.</Text>
              <Text style={styles.emptyHint}>Check that your CSV has at least one data row and 5 columns.</Text>
            </View>
          ) : (
            <ScrollView style={{ flex: 1, marginVertical: 8 }}>
              {parsed.games.map((g, i) => (
                <View key={g.slotId} style={styles.csvGamePreviewRow}>
                  <Text style={styles.slotDate}>
                    {g.date} · {g.startTime}
                  </Text>
                  <Text style={styles.slotMeta}>
                    {g.home}{!g.homeId ? ' ⚠' : ''} vs {g.away}{!g.awayId ? ' ⚠' : ''} · {g.field}
                  </Text>
                </View>
              ))}
            </ScrollView>
          )}

          {hasUnmatched && (
            <View style={styles.csvErrorBox}>
              <Text style={styles.warningText}>⚠ Some team names didn't match league teams. Those games will be saved without team IDs.</Text>
            </View>
          )}

          <View style={styles.modalActions}>
            <Pressable style={[styles.modalBtn, styles.cancelBtn]} onPress={onClose}>
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </Pressable>
            <Pressable
              style={[styles.modalBtn, styles.saveBtn, (importing || parsed.games.length === 0) && styles.disabled]}
              onPress={onImport}
              disabled={importing || parsed.games.length === 0}
            >
              {importing
                ? <ActivityIndicator color="#fff" size="small" />
                : <Text style={styles.saveBtnText}>Import Schedule</Text>}
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ── Slot modal ────────────────────────────────────────────────────────────────

function SlotModal({
  visible,
  onClose,
  onAdd,
}: {
  visible: boolean;
  onClose: () => void;
  onAdd: (slot: GameSlot) => void;
}) {
  const [date, setDate] = useState('');
  const [field, setField] = useState('');
  const [startTime, setStartTime] = useState<'6:30 PM' | '8:15 PM'>('6:30 PM');
  const [gameNumber, setGameNumber] = useState<1 | 2>(1);
  const [isSwamp, setIsSwamp] = useState(false);
  const [isMakeup, setIsMakeup] = useState(false);
  const [isPlayoff, setIsPlayoff] = useState(false);

  function reset() {
    setDate(''); setField(''); setStartTime('6:30 PM'); setGameNumber(1);
    setIsSwamp(false); setIsMakeup(false); setIsPlayoff(false);
  }

  function handleAdd() {
    if (!date.trim() || !field.trim()) return;
    onAdd({
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      date: date.trim(),
      field: field.trim(),
      gameNumber,
      startTime,
      isSwamp,
      isMakeup,
      isPlayoff,
    });
    reset();
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={() => { onClose(); reset(); }}>
      <KeyboardAvoidingView
        style={styles.modalOverlay}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.modalCard}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Add Game Slot</Text>
            <Pressable onPress={() => { onClose(); reset(); }}>
              <Ionicons name="close" size={22} color="#888" />
            </Pressable>
          </View>

          <Text style={styles.fieldLabel}>Date</Text>
          <TextInput
            style={styles.input}
            value={date}
            onChangeText={setDate}
            placeholder="e.g. Tuesday, June 16"
            autoFocus
          />

          <Text style={styles.fieldLabel}>Field</Text>
          <TextInput
            style={styles.input}
            value={field}
            onChangeText={setField}
            placeholder="e.g. Main Diamond"
          />

          <Text style={styles.fieldLabel}>Start Time</Text>
          <View style={styles.chipRow}>
            {(['6:30 PM', '8:15 PM'] as const).map((t) => (
              <Pressable
                key={t}
                style={[styles.chip, startTime === t && styles.chipActive]}
                onPress={() => setStartTime(t)}
              >
                <Text style={[styles.chipText, startTime === t && styles.chipTextActive]}>{t}</Text>
              </Pressable>
            ))}
          </View>

          <Text style={styles.fieldLabel}>Game #</Text>
          <View style={styles.chipRow}>
            {([1, 2] as const).map((n) => (
              <Pressable
                key={n}
                style={[styles.chip, gameNumber === n && styles.chipActive]}
                onPress={() => setGameNumber(n)}
              >
                <Text style={[styles.chipText, gameNumber === n && styles.chipTextActive]}>Game {n}</Text>
              </Pressable>
            ))}
          </View>

          <View style={styles.flagRow}>
            {[
              { label: 'Swamp', value: isSwamp, set: setIsSwamp },
              { label: 'Makeup', value: isMakeup, set: setIsMakeup },
              { label: 'Playoff', value: isPlayoff, set: setIsPlayoff },
            ].map(({ label, value, set }) => (
              <Pressable
                key={label}
                style={[styles.flagChip, value && styles.flagChipActive]}
                onPress={() => set(!value)}
              >
                <Text style={[styles.flagChipText, value && styles.flagChipTextActive]}>{label}</Text>
              </Pressable>
            ))}
          </View>

          <View style={styles.modalActions}>
            <Pressable style={[styles.modalBtn, styles.cancelBtn]} onPress={() => { onClose(); reset(); }}>
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </Pressable>
            <Pressable
              style={[styles.modalBtn, styles.saveBtn, (!date.trim() || !field.trim()) && styles.disabled]}
              onPress={handleAdd}
              disabled={!date.trim() || !field.trim()}
            >
              <Text style={styles.saveBtnText}>Add Slot</Text>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ── Invites tab ───────────────────────────────────────────────────────────────

function InvitesTab({
  leagueId,
  leagueName,
  leagueTeams,
  invites,
  invitedBy,
  isAdmin,
}: {
  leagueId: string;
  leagueName: string;
  leagueTeams: Team[];
  invites: LeagueInvite[];
  invitedBy: string;
  isAdmin: boolean;
}) {
  const [inviteModal, setInviteModal] = useState(false);
  const [sending, setSending] = useState(false);
  const [sentLink, setSentLink] = useState<string | null>(null);

  async function handleSendInvite(email: string, teamId?: string) {
    setSending(true);
    try {
      const team = leagueTeams.find((t) => t.id === teamId);
      const { token } = await createInvite({
        leagueId,
        leagueName,
        invitedEmail: email,
        invitedBy,
        teamId: teamId,
        teamName: team?.name,
      });
      const link = `${APP_BASE_URL}/invite/${token}`;
      setSentLink(link);
      setInviteModal(false);

      // Share the link
      if (Platform.OS === 'web') {
        await navigator.clipboard?.writeText(link);
        Alert.alert('Link Copied', `Invite link copied to clipboard.\n\n${link}`);
      } else {
        await Share.share({ message: `Join ${leagueName} on ScoreBall:\n${link}` });
      }
    } catch (e: any) {
      Alert.alert('Error', e?.message ?? 'Failed to create invite.');
    } finally {
      setSending(false);
    }
  }

  const pending = invites.filter((i) => i.status === 'pending');
  const accepted = invites.filter((i) => i.status === 'accepted');
  const declined = invites.filter((i) => i.status === 'declined');

  return (
    <View style={{ flex: 1 }}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Invites</Text>
        <Pressable style={styles.addChip} onPress={() => setInviteModal(true)}>
          <Ionicons name="mail-outline" size={15} color="#1a5c2e" />
          <Text style={styles.addChipText}>Invite Captain</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.list}>
        {invites.length === 0 && (
          <View style={styles.empty}>
            <Ionicons name="mail-outline" size={44} color="#ccc" />
            <Text style={styles.emptyText}>No invites sent yet.</Text>
            <Text style={styles.emptyHint}>Invite team captains to join and manage their roster.</Text>
          </View>
        )}

        {pending.length > 0 && <Text style={styles.inviteGroupLabel}>Pending</Text>}
        {pending.map((inv) => (
          <InviteRow
            key={inv.id}
            invite={inv}
            isAdmin={isAdmin}
            onCancel={async () => {
              Alert.alert('Cancel Invite', `Cancel invite to ${inv.invitedEmail}?`, [
                { text: 'No', style: 'cancel' },
                {
                  text: 'Cancel Invite', style: 'destructive',
                  onPress: async () => {
                    try { await deleteLeagueInvite(inv.id); }
                    catch (e: any) { Alert.alert('Error', e?.message ?? 'Failed to cancel invite.'); }
                  },
                },
              ]);
            }}
          />
        ))}

        {accepted.length > 0 && <Text style={styles.inviteGroupLabel}>Accepted</Text>}
        {accepted.map((inv) => <InviteRow key={inv.id} invite={inv} isAdmin={false} onCancel={() => {}} />)}

        {declined.length > 0 && <Text style={styles.inviteGroupLabel}>Declined</Text>}
        {declined.map((inv) => <InviteRow key={inv.id} invite={inv} isAdmin={false} onCancel={() => {}} />)}
      </ScrollView>

      <InviteFormModal
        visible={inviteModal}
        leagueTeams={leagueTeams}
        sending={sending}
        onClose={() => setInviteModal(false)}
        onSend={handleSendInvite}
      />
    </View>
  );
}

function InviteRow({ invite, isAdmin, onCancel }: { invite: LeagueInvite; isAdmin: boolean; onCancel: () => void }) {
  const statusColor = invite.status === 'accepted' ? '#1a5c2e' : invite.status === 'declined' ? '#c0392b' : '#f39c12';

  return (
    <View style={styles.inviteRow}>
      <View style={{ flex: 1 }}>
        <Text style={styles.inviteEmail}>{invite.invitedEmail}</Text>
        {invite.teamName && <Text style={styles.inviteMeta}>{invite.teamName}</Text>}
      </View>
      <View style={[styles.statusChip, { backgroundColor: `${statusColor}18` }]}>
        <Text style={[styles.statusChipText, { color: statusColor }]}>
          {invite.status.charAt(0).toUpperCase() + invite.status.slice(1)}
        </Text>
      </View>
      {isAdmin && invite.status === 'pending' && (
        <Pressable onPress={onCancel} style={{ marginLeft: 8, padding: 4 }} hitSlop={8}>
          <Ionicons name="trash-outline" size={18} color="#c0392b" />
        </Pressable>
      )}
    </View>
  );
}

function InviteFormModal({
  visible,
  leagueTeams,
  sending,
  onClose,
  onSend,
}: {
  visible: boolean;
  leagueTeams: Team[];
  sending: boolean;
  onClose: () => void;
  onSend: (email: string, teamId?: string) => Promise<void>;
}) {
  const [email, setEmail] = useState('');
  const [selectedTeamId, setSelectedTeamId] = useState<string | undefined>(undefined);

  function reset() { setEmail(''); setSelectedTeamId(undefined); }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={() => { onClose(); reset(); }}>
      <KeyboardAvoidingView
        style={styles.modalOverlay}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.modalCard}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Invite Captain</Text>
            <Pressable onPress={() => { onClose(); reset(); }}>
              <Ionicons name="close" size={22} color="#888" />
            </Pressable>
          </View>

          <Text style={styles.fieldLabel}>Captain's Email</Text>
          <TextInput
            style={styles.input}
            value={email}
            onChangeText={setEmail}
            placeholder="captain@example.com"
            keyboardType="email-address"
            autoCapitalize="none"
            autoFocus
          />

          <Text style={styles.fieldLabel}>Assign Team (optional)</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
            {leagueTeams.map((team) => (
              <Pressable
                key={team.id}
                style={[styles.chip, selectedTeamId === team.id && styles.chipActive]}
                onPress={() => setSelectedTeamId(selectedTeamId === team.id ? undefined : team.id)}
              >
                <Text style={[styles.chipText, selectedTeamId === team.id && styles.chipTextActive]}>
                  {team.name}
                </Text>
              </Pressable>
            ))}
          </ScrollView>

          <Text style={styles.inviteHint}>
            We'll generate a link you can share via text, email, or however you like.
          </Text>

          <View style={styles.modalActions}>
            <Pressable style={[styles.modalBtn, styles.cancelBtn]} onPress={() => { onClose(); reset(); }}>
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </Pressable>
            <Pressable
              style={[styles.modalBtn, styles.saveBtn, (!email.trim() || sending) && styles.disabled]}
              onPress={async () => { await onSend(email.trim(), selectedTeamId); reset(); }}
              disabled={!email.trim() || sending}
            >
              {sending
                ? <ActivityIndicator color="#fff" size="small" />
                : <Text style={styles.saveBtnText}>Create Link</Text>}
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f7f7f5' },
  loader: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  // Format row
  formatRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginHorizontal: 16,
    marginTop: 10,
    marginBottom: 2,
    backgroundColor: '#edf6f0',
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  formatLabel: { flex: 1, fontSize: 13, color: '#1a5c2e', fontWeight: '500' },

  // Tab bar
  tabs: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginVertical: 10,
    backgroundColor: '#ebebea',
    borderRadius: 10,
    padding: 3,
  },
  tab: { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: 8, flexDirection: 'row', justifyContent: 'center', gap: 4 },
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
  badgeDot: { backgroundColor: '#e74c3c', borderRadius: 8, minWidth: 16, height: 16, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  badgeDotText: { color: '#fff', fontSize: 10, fontWeight: '700' },

  // Section header
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, marginBottom: 10 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#1a1a1a' },
  addChip: { flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1.5, borderColor: '#1a5c2e', borderRadius: 20, paddingVertical: 5, paddingHorizontal: 12 },
  addChipText: { color: '#1a5c2e', fontWeight: '600', fontSize: 13 },

  // Lists
  list: { paddingHorizontal: 16, gap: 8, paddingBottom: 40 },
  teamRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 12, paddingVertical: 14, paddingHorizontal: 16, gap: 12, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 3, shadowOffset: { width: 0, height: 1 }, elevation: 1 },
  sportEmoji: { fontSize: 22 },
  teamInfo: { flex: 1 },
  teamName: { fontSize: 15, fontWeight: '600', color: '#1a1a1a' },
  teamMeta: { fontSize: 12, color: '#888', marginTop: 2 },
  captainChip: { backgroundColor: '#edf6f0', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  captainChipText: { fontSize: 11, color: '#1a5c2e', fontWeight: '600' },

  // Empty state
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 40 },
  emptyText: { color: '#aaa', fontSize: 15, textAlign: 'center', fontWeight: '600' },
  emptyHint: { color: '#bbb', fontSize: 13, textAlign: 'center' },
  emptyBtn: { borderWidth: 1.5, borderColor: '#1a5c2e', borderRadius: 10, paddingVertical: 8, paddingHorizontal: 20 },
  emptyBtnText: { color: '#1a5c2e', fontWeight: '600', fontSize: 14 },

  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  modalCard: { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, maxHeight: '92%' },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
  modalTitle: { fontSize: 20, fontWeight: '700', color: '#1a1a1a' },
  modalActions: { flexDirection: 'row', gap: 10, marginTop: 16 },
  modalBtn: { flex: 1, borderRadius: 10, paddingVertical: 14, alignItems: 'center', justifyContent: 'center' },
  cancelBtn: { backgroundColor: '#f0f0ef' },
  cancelBtnText: { color: '#555', fontWeight: '600', fontSize: 15 },
  saveBtn: { backgroundColor: '#1a5c2e' },
  saveBtnText: { color: '#fff', fontWeight: '600', fontSize: 15 },
  disabled: { opacity: 0.4 },

  pickerList: { marginBottom: 16, maxHeight: 300 },
  pickerRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#f0f0ef' },
  pickerName: { flex: 1, fontSize: 16, fontWeight: '500', color: '#1a1a1a' },
  doneBtn: { backgroundColor: '#1a5c2e', borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  doneBtnText: { color: '#fff', fontWeight: '600', fontSize: 15 },

  // Schedule configure
  configScroll: { padding: 16, gap: 12, paddingBottom: 40 },
  configCard: { backgroundColor: '#fff', borderRadius: 14, padding: 16, gap: 10, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 4, shadowOffset: { width: 0, height: 1 }, elevation: 1 },
  configCardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  configCardLabel: { fontSize: 12, fontWeight: '700', color: '#888', textTransform: 'uppercase', letterSpacing: 0.5 },
  configCardValue: { fontSize: 15, color: '#1a1a1a' },
  configHint: { fontSize: 13, color: '#bbb' },
  slotRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6, borderTopWidth: 1, borderTopColor: '#f5f5f4' },
  slotDate: { fontSize: 13, fontWeight: '600', color: '#1a1a1a' },
  slotMeta: { fontSize: 12, color: '#888' },
  optionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 6 },
  optionLabel: { fontSize: 15, color: '#1a1a1a' },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  stepBtn: { width: 30, height: 30, borderRadius: 15, borderWidth: 1.5, borderColor: '#ddd', alignItems: 'center', justifyContent: 'center' },
  stepBtnText: { fontSize: 18, color: '#555', lineHeight: 22 },
  stepValue: { fontSize: 16, fontWeight: '600', color: '#1a1a1a', minWidth: 24, textAlign: 'center' },
  togglePill: { paddingVertical: 5, paddingHorizontal: 14, borderRadius: 20, borderWidth: 1.5, borderColor: '#ddd', backgroundColor: '#fafaf8' },
  togglePillOn: { borderColor: '#1a5c2e', backgroundColor: '#edf6f0' },
  togglePillText: { fontSize: 13, color: '#888', fontWeight: '600' },
  togglePillTextOn: { color: '#1a5c2e' },
  generateBtn: { backgroundColor: '#1a5c2e', borderRadius: 14, paddingVertical: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  generateBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  generatingHint: { textAlign: 'center', color: '#aaa', fontSize: 13 },

  // Schedule view
  schedHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#eee', backgroundColor: '#fff' },
  schedTitle: { fontSize: 14, fontWeight: '600', color: '#1a1a1a' },
  reconfigBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1.5, borderColor: '#1a5c2e', borderRadius: 8, paddingVertical: 5, paddingHorizontal: 10 },
  reconfigBtnText: { fontSize: 12, color: '#1a5c2e', fontWeight: '600' },
  dateHeader: { fontSize: 13, fontWeight: '700', color: '#888', paddingHorizontal: 16, paddingTop: 14, paddingBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 },
  gameRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', marginHorizontal: 12, marginBottom: 6, borderRadius: 10, paddingVertical: 10, paddingHorizontal: 12, gap: 8, shadowColor: '#000', shadowOpacity: 0.03, shadowRadius: 3, shadowOffset: { width: 0, height: 1 }, elevation: 1 },
  gameTime: { fontSize: 11, fontWeight: '700', color: '#1a5c2e', width: 52 },
  gameMatchup: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6 },
  gameHome: { flex: 1, fontSize: 13, fontWeight: '600', color: '#1a1a1a', textAlign: 'right' },
  gameVs: { fontSize: 11, color: '#aaa', fontWeight: '500' },
  gameAway: { flex: 1, fontSize: 13, fontWeight: '400', color: '#555' },
  gameField: { fontSize: 11, color: '#aaa', maxWidth: 70 },
  swampTag: { fontSize: 10, fontWeight: '700', color: '#1a5c2e', backgroundColor: '#edf6f0', paddingHorizontal: 5, paddingVertical: 2, borderRadius: 4 },
  warningBox: { marginHorizontal: 12, marginTop: 12, backgroundColor: '#fff8f0', borderRadius: 10, padding: 14, gap: 4 },
  warningTitle: { fontSize: 13, fontWeight: '700', color: '#e67e22' },
  warningText: { fontSize: 12, color: '#c0392b' },
  statsBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 16, marginHorizontal: 16, borderWidth: 1.5, borderColor: '#1a5c2e', borderRadius: 10, paddingVertical: 12 },
  statsBtnText: { color: '#1a5c2e', fontWeight: '600', fontSize: 14 },
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 16, paddingVertical: 12 },
  backBtnText: { fontSize: 14, color: '#1a5c2e', fontWeight: '600' },
  statsList: { paddingBottom: 40 },
  statsHeader: { flexDirection: 'row', backgroundColor: '#1a5c2e', paddingVertical: 8, paddingHorizontal: 16 },
  statsRow: { flexDirection: 'row', paddingVertical: 8, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: '#f0f0ef' },
  statsCell: { width: 36, fontSize: 12, textAlign: 'center', color: '#555', fontWeight: '500' },
  statsCellTeam: { flex: 1, textAlign: 'left', color: '#1a1a1a', fontWeight: '600' },

  // Slot form fields
  fieldLabel: { fontSize: 12, fontWeight: '600', color: '#888', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6, marginTop: 14 },
  input: { borderWidth: 1, borderColor: '#ddd', borderRadius: 10, paddingVertical: 11, paddingHorizontal: 14, fontSize: 16, backgroundColor: '#fafaf8' },
  chipRow: { flexDirection: 'row', gap: 8 },
  chip: { paddingVertical: 8, paddingHorizontal: 16, borderRadius: 8, borderWidth: 1.5, borderColor: '#ddd', backgroundColor: '#fafaf8' },
  chipActive: { borderColor: '#1a5c2e', backgroundColor: '#edf6f0' },
  chipText: { fontSize: 14, fontWeight: '500', color: '#888' },
  chipTextActive: { color: '#1a5c2e', fontWeight: '700' },
  flagRow: { flexDirection: 'row', gap: 8, marginTop: 14 },
  flagChip: { paddingVertical: 7, paddingHorizontal: 14, borderRadius: 8, borderWidth: 1.5, borderColor: '#ddd', backgroundColor: '#fafaf8' },
  flagChipActive: { borderColor: '#e67e22', backgroundColor: '#fef9f0' },
  flagChipText: { fontSize: 13, fontWeight: '500', color: '#888' },
  flagChipTextActive: { color: '#e67e22', fontWeight: '700' },

  // Invites
  inviteGroupLabel: { fontSize: 12, fontWeight: '700', color: '#aaa', textTransform: 'uppercase', letterSpacing: 0.5, paddingHorizontal: 4, paddingTop: 8, paddingBottom: 4 },
  inviteRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 12, paddingVertical: 14, paddingHorizontal: 16, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 3, shadowOffset: { width: 0, height: 1 }, elevation: 1 },
  inviteEmail: { fontSize: 15, fontWeight: '600', color: '#1a1a1a' },
  inviteMeta: { fontSize: 12, color: '#888', marginTop: 2 },
  statusChip: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  statusChipText: { fontSize: 12, fontWeight: '700' },
  inviteHint: { fontSize: 13, color: '#aaa', marginTop: 10, lineHeight: 18 },

  // Stats header text
  statsHeaderText: { flex: 1, fontSize: 11, fontWeight: '700', color: '#fff', textAlign: 'center' },
  statsHeaderTeamText: { flex: 1, fontSize: 11, fontWeight: '700', color: '#fff', textAlign: 'left' },

  // CSV import
  csvImportRow: { flexDirection: 'row', gap: 10, marginTop: 8 },
  orDivider: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  orLine: { flex: 1, height: 1, backgroundColor: '#e0e0de' },
  orText: { fontSize: 12, color: '#aaa', fontWeight: '600' },
  csvWarnBox: { backgroundColor: '#fff8f0', borderRadius: 10, padding: 10, marginBottom: 8, gap: 4 },
  csvErrorBox: { backgroundColor: '#fff0f0', borderRadius: 10, padding: 10, marginTop: 4 },
  csvGamePreviewRow: { paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#f5f5f4' },

  // Split CSV button group (upload | download)
  csvBtnGroup: { flexDirection: 'row', alignItems: 'center', borderWidth: 1.5, borderColor: '#ccc', borderRadius: 8, overflow: 'hidden' },
  csvBtnGroupLeft: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 5, paddingHorizontal: 10 },
  csvBtnGroupText: { fontSize: 12, fontWeight: '600', color: '#555' },
  csvBtnGroupDivider: { width: 1, height: '100%', backgroundColor: '#ddd' },
  csvBtnGroupRight: { paddingVertical: 5, paddingHorizontal: 8 },

  // Hidden league teams
  hiddenSectionLabel: { fontSize: 11, fontWeight: '700', color: '#bbb', textTransform: 'uppercase', letterSpacing: 0.5, paddingHorizontal: 4, paddingBottom: 6, marginTop: 4 },
  hiddenTeamRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fafaf8', borderRadius: 12, paddingVertical: 12, paddingHorizontal: 16, gap: 12, marginBottom: 8, borderWidth: 1, borderColor: '#ebebea' },
  unhideBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1.5, borderColor: '#1a5c2e', borderRadius: 8, paddingVertical: 5, paddingHorizontal: 10 },
  unhideBtnText: { fontSize: 12, color: '#1a5c2e', fontWeight: '600' },

  // League teams import
  teamsImportRow: { flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#f5f5f4', gap: 8 },
  teamsImportName: { fontSize: 15, fontWeight: '600', color: '#1a1a1a' },
  teamsImportContact: { fontSize: 12, color: '#888' },
  teamsImportBadge: { backgroundColor: '#edf6f0', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4, marginTop: 2 },
  teamsImportBadgeText: { fontSize: 11, fontWeight: '700', color: '#1a5c2e' },
  templateLink: { alignItems: 'center', paddingVertical: 8 },
  templateLinkText: { fontSize: 13, color: '#1a5c2e', textDecorationLine: 'underline' },
});
