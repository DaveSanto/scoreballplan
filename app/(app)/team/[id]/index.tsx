import { Ionicons } from '@expo/vector-icons';
import { useGlobalSearchParams } from 'expo-router';
import React, { useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
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
import { Share } from 'react-native';
import { useApp } from '../../../../src/store/AppContext';
import { useAuth } from '../../../../src/store/AuthContext';
import { ALL_POSITIONS, Handedness, Player, Position } from '../../../../src/types';
import { parseCsv, CSV_TEMPLATE_EXAMPLE, CsvRow } from '../../../../src/utils/csvImport';

const PREF_LABELS = ['A', 'B', 'C', 'D'];

type SortOption = 'batting' | 'firstName' | 'lastName' | 'number' | 'avg' | 'obp';

const SORT_LABELS: Record<SortOption, string> = {
  batting:   'Batting order',
  firstName: 'First name',
  lastName:  'Last name',
  number:    'Jersey #',
  avg:       'AVG',
  obp:       'OBP',
};

function sortPlayers(players: Player[], battingOrder: string[], sort: SortOption): Player[] {
  if (sort === 'batting') {
    return battingOrder.map((id) => players.find((p) => p.id === id)).filter(Boolean) as Player[];
  }
  const sorted = [...players];
  switch (sort) {
    case 'firstName':
      sorted.sort((a, b) => a.name.split(' ')[0].localeCompare(b.name.split(' ')[0]));
      break;
    case 'lastName': {
      const last = (n: string) => n.includes(' ') ? n.split(' ').slice(-1)[0] : n;
      sorted.sort((a, b) => last(a.name).localeCompare(last(b.name)));
      break;
    }
    case 'number':
      sorted.sort((a, b) => {
        const na = parseInt(a.number, 10);
        const nb = parseInt(b.number, 10);
        if (isNaN(na) && isNaN(nb)) return a.number.localeCompare(b.number);
        if (isNaN(na)) return 1;
        if (isNaN(nb)) return -1;
        return na - nb;
      });
      break;
    case 'avg':
      sorted.sort((a, b) => (b.battingAverage ?? -1) - (a.battingAverage ?? -1));
      break;
    case 'obp':
      sorted.sort((a, b) => (b.obp ?? -1) - (a.obp ?? -1));
      break;
  }
  return sorted;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function statLabel(val: number | null | undefined, decimals = 3) {
  if (val == null) return '—';
  return val.toFixed(decimals);
}

function handLabel(b?: Handedness) {
  if (!b) return null;
  return b === 'S' ? 'Switch' : b === 'L' ? 'Left' : 'Right';
}

// ── Main screen ───────────────────────────────────────────────────────────────

export default function RosterScreen() {
  const { id: teamId } = useGlobalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const { teams, getTeamPlayers, addPlayer, bulkAddPlayers, removePlayerFromTeam, updatePlayer, claimPlayer, linkAsGuardian } = useApp();
  const team = teams.find((t) => t.id === teamId);

  const [editModal, setEditModal] = useState(false);
  const [csvModal, setCsvModal] = useState(false);
  const [csvPreviewData, setCsvPreviewData] = useState<ReturnType<typeof parseCsv> | null>(null);
  const [editingPlayer, setEditingPlayer] = useState<Player | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [claimingId, setClaimingId] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<SortOption>('batting');
  const [sortMenuOpen, setSortMenuOpen] = useState(false);
  const fileInputRef = useRef<any>(null);

  if (!team) {
    return <View style={styles.loader}><ActivityIndicator color="#1a5c2e" /></View>;
  }

  const teamPlayers = getTeamPlayers(teamId);
  const orderedPlayers = sortPlayers(teamPlayers, team.battingOrder, sortBy);

  const isAdmin = user?.uid === team.ownerId || (team.coAdminIds ?? []).includes(user?.uid ?? '');

  function openAdd() {
    setEditingPlayer(null);
    setEditModal(true);
  }

  function openEdit(player: Player) {
    setEditingPlayer(player);
    setEditModal(true);
  }

  async function confirmDelete(playerId: string) {
    try {
      await removePlayerFromTeam(teamId, playerId);
    } catch (e) {
      Alert.alert('Error', 'Could not remove player. Please try again.');
    } finally {
      setDeletingId(null);
    }
  }

  function handleCsvUpload() {
    if (Platform.OS === 'web') {
      fileInputRef.current?.click();
    } else {
      Alert.alert('CSV Import', 'CSV import is available on the web version. Open ScoreBall in your browser to import a roster.');
    }
  }

  function handleDownloadTemplate() {
    if (Platform.OS === 'web') {
      const blob = new Blob([CSV_TEMPLATE_EXAMPLE], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'scoreball_roster_template.csv';
      a.click();
      URL.revokeObjectURL(url);
    } else {
      Share.share({ message: CSV_TEMPLATE_EXAMPLE, title: 'ScoreBall Roster Template' });
    }
  }

  function handleFileChange(e: any) {
    const file = e.target?.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      if (text) {
        const result = parseCsv(text);
        setCsvPreviewData(result);
        setCsvModal(true);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  }

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      {/* Hidden file input for web CSV upload */}
      {Platform.OS === 'web' && (
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,text/csv"
          style={{ display: 'none' }}
          onChange={handleFileChange}
        />
      )}

      <FlatList
        data={orderedPlayers}
        keyExtractor={(p) => p.id}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          <View>
            <View style={styles.hintBox}>
              <Text style={styles.hintText}>Add your players here either one at a time or in bulk by importing from a csv file.</Text>
            </View>
            <View style={styles.listHeader}>
              <Text style={styles.subtitle}>{team.playerIds.length} players</Text>
              <Pressable style={styles.sortBtn} onPress={() => setSortMenuOpen((o) => !o)}>
                <Ionicons name="funnel-outline" size={14} color="#1a5c2e" />
                <Text style={styles.sortBtnText}>{SORT_LABELS[sortBy]}</Text>
                <Ionicons name={sortMenuOpen ? 'chevron-up' : 'chevron-down'} size={12} color="#1a5c2e" />
              </Pressable>
            </View>
            {sortMenuOpen && (
              <View style={styles.sortMenu}>
                {(Object.keys(SORT_LABELS) as SortOption[]).map((opt) => (
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
          </View>
        }
        renderItem={({ item, index }) => (
          <PlayerRow
            player={item}
            battingSlot={index + 1}
            currentUserId={user?.uid}
            userEmail={user?.email ?? undefined}
            isAdmin={isAdmin}
            onEdit={() => openEdit(item)}
            claiming={claimingId === item.id}
            onClaimRequest={() => setClaimingId(item.id)}
            onClaimConfirm={async () => {
              try {
                await claimPlayer(item.id);
              } catch {
                Alert.alert('Error', 'Could not claim profile. Please try again.');
              } finally {
                setClaimingId(null);
              }
            }}
            onGuardianConfirm={async () => {
              try {
                await linkAsGuardian(item.id);
              } catch {
                Alert.alert('Error', 'Could not link profile. Please try again.');
              } finally {
                setClaimingId(null);
              }
            }}
            onClaimCancel={() => setClaimingId(null)}
            confirming={deletingId === item.id}
            onDeleteRequest={() => setDeletingId(item.id)}
            onDeleteConfirm={() => confirmDelete(item.id)}
            onDeleteCancel={() => setDeletingId(null)}
          />
        )}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="people-outline" size={48} color="#ccc" />
            <Text style={styles.emptyText}>No players yet.</Text>
            <Text style={styles.emptyHint}>Add players manually or import from a CSV file.</Text>
          </View>
        }
      />

      <View style={styles.footer}>
        <View style={styles.csvGroup}>
          <Pressable style={styles.csvBtn} onPress={handleCsvUpload}>
            <Ionicons name="cloud-upload-outline" size={18} color="#1a5c2e" />
            <Text style={styles.csvBtnText}>Import CSV</Text>
          </Pressable>
          <Pressable onPress={handleDownloadTemplate}>
            <Text style={styles.templateLink}>Download template</Text>
          </Pressable>
        </View>
        <Pressable style={styles.addBtn} onPress={openAdd}>
          <Ionicons name="add" size={20} color="#fff" />
          <Text style={styles.addBtnText}>Add Player</Text>
        </Pressable>
      </View>

      <PlayerModal
        visible={editModal}
        player={editingPlayer}
        onClose={() => setEditModal(false)}
        onSave={async (data) => {
          if (editingPlayer) {
            await updatePlayer(editingPlayer.id, data);
          } else {
            await addPlayer(teamId, data.name, data.number ?? '', data);
          }
          setEditModal(false);
        }}
      />

      <CsvPreviewModal
        visible={csvModal}
        data={csvPreviewData}
        existingPlayers={teamPlayers}
        onClose={() => setCsvModal(false)}
        onImport={async (newRows, conflictUpdates) => {
          if (newRows.length > 0) await bulkAddPlayers(teamId, newRows);
          for (const { playerId, data } of conflictUpdates) {
            await updatePlayer(playerId, data);
          }
          setCsvModal(false);
        }}
      />
    </SafeAreaView>
  );
}

// ── Player row ────────────────────────────────────────────────────────────────

function PlayerRow({
  player,
  battingSlot,
  currentUserId,
  userEmail,
  isAdmin,
  onEdit,
  claiming,
  onClaimRequest,
  onClaimConfirm,
  onGuardianConfirm,
  onClaimCancel,
  confirming,
  onDeleteRequest,
  onDeleteConfirm,
  onDeleteCancel,
}: {
  player: Player;
  battingSlot: number;
  currentUserId?: string;
  userEmail?: string;
  isAdmin: boolean;
  onEdit: () => void;
  claiming: boolean;
  onClaimRequest: () => void;
  onClaimConfirm: () => void;
  onGuardianConfirm: () => void;
  onClaimCancel: () => void;
  confirming: boolean;
  onDeleteRequest: () => void;
  onDeleteConfirm: () => void;
  onDeleteCancel: () => void;
}) {
  const posA = player.preferredPositions?.[0];
  const hasStat = player.battingAverage != null || player.obp != null;
  const isMe = player.claimedBy === currentUserId && !!currentUserId;
  const isMyKid = player.guardianId === currentUserId && !!currentUserId;
  const isLinked = isMe || isMyKid;
  // Only offer linking when the logged-in user's email matches the email the coach recorded
  const emailMatches =
    !!userEmail && !!player.email &&
    userEmail.toLowerCase() === player.email.toLowerCase();
  const canLink = emailMatches && !player.claimedBy && !player.guardianId;
  const showingInlineAction = confirming || claiming;

  return (
    <View style={[styles.row, isLinked && styles.rowHighlighted]}>
      <View style={[styles.badge, isLinked && styles.badgeMe]}>
        <Text style={styles.badgeNum}>#{player.number || '—'}</Text>
      </View>
      <View style={styles.playerInfo}>
        <View style={styles.nameRow}>
          <Text style={styles.playerName}>{player.name}</Text>
          {isMe && (
            <View style={styles.youBadge}>
              <Ionicons name="person" size={10} color="#1a5c2e" />
              <Text style={styles.youBadgeText}>You</Text>
            </View>
          )}
          {isMyKid && (
            <View style={styles.youBadge}>
              <Ionicons name="people" size={10} color="#1a5c2e" />
              <Text style={styles.youBadgeText}>Guardian</Text>
            </View>
          )}
          {posA && <View style={styles.posChip}><Text style={styles.posChipText}>{posA}</Text></View>}
          {player.bats && (
            <View style={styles.handChip}>
              <Text style={styles.handChipText}>
                {player.bats === 'S' ? 'SW' : player.bats} bat
              </Text>
            </View>
          )}
        </View>
        {confirming ? (
          <View style={styles.deleteConfirmRow}>
            <Text style={styles.deleteConfirmText}>Remove {player.name}?</Text>
            <Pressable style={styles.deleteConfirmYes} onPress={onDeleteConfirm}>
              <Text style={styles.deleteConfirmYesText}>Remove</Text>
            </Pressable>
            <Pressable style={styles.deleteConfirmNo} onPress={onDeleteCancel}>
              <Text style={styles.deleteConfirmNoText}>Cancel</Text>
            </Pressable>
          </View>
        ) : claiming ? (
          <View style={styles.claimConfirmWrapper}>
            <Text style={styles.claimConfirmText}>How are you connected?</Text>
            <View style={styles.claimConfirmButtons}>
              <Pressable style={styles.claimConfirmYes} onPress={onClaimConfirm}>
                <Text style={styles.claimConfirmYesText}>I am this player</Text>
              </Pressable>
              <Pressable style={styles.claimConfirmGuardian} onPress={onGuardianConfirm}>
                <Text style={styles.claimConfirmGuardianText}>I'm their guardian</Text>
              </Pressable>
              <Pressable style={styles.deleteConfirmNo} onPress={onClaimCancel}>
                <Text style={styles.deleteConfirmNoText}>Cancel</Text>
              </Pressable>
            </View>
          </View>
        ) : (
          <View style={styles.metaRow}>
            <Text style={styles.battingPos}>#{battingSlot}</Text>
            {hasStat && (
              <Text style={styles.statsMeta}>
                AVG {statLabel(player.battingAverage)} · OBP {statLabel(player.obp)}
              </Text>
            )}
          </View>
        )}
      </View>
      {!showingInlineAction && (
        <View style={styles.rowActions}>
          {canLink && (
            <Pressable style={styles.claimBtn} onPress={onClaimRequest}>
              <Text style={styles.claimBtnText}>Link to me</Text>
            </Pressable>
          )}
          {isAdmin && (
            <>
              <Pressable style={styles.iconBtn} onPress={onEdit}>
                <Ionicons name="pencil-outline" size={18} color="#555" />
              </Pressable>
              <Pressable style={styles.iconBtn} onPress={onDeleteRequest}>
                <Ionicons name="trash-outline" size={18} color="#c0392b" />
              </Pressable>
            </>
          )}
        </View>
      )}
    </View>
  );
}

// ── Player modal ──────────────────────────────────────────────────────────────

type PlayerFormData = Partial<Player> & { name: string };

function PlayerModal({
  visible,
  player,
  onClose,
  onSave,
}: {
  visible: boolean;
  player: Player | null;
  onClose: () => void;
  onSave: (data: PlayerFormData) => Promise<void>;
}) {
  const [name, setName] = useState('');
  const [number, setNumber] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [bats, setBats] = useState<Handedness | undefined>(undefined);
  const [throws_, setThrows] = useState<'L' | 'R' | undefined>(undefined);
  const [prefs, setPrefs] = useState<(Position | undefined)[]>([undefined, undefined, undefined, undefined]);
  const [avg, setAvg] = useState('');
  const [obp, setObp] = useState('');
  const [era, setEra] = useState('');
  const [saving, setSaving] = useState(false);

  // Populate when editing
  React.useEffect(() => {
    if (visible) {
      setName(player?.name ?? '');
      setNumber(player?.number ?? '');
      setEmail(player?.email ?? '');
      setPhone(player?.phone ?? '');
      setBats(player?.bats);
      setThrows(player?.throws);
      const p = player?.preferredPositions ?? [];
      setPrefs([p[0], p[1], p[2], p[3]]);
      setAvg(player?.battingAverage != null ? String(player.battingAverage) : '');
      setObp(player?.obp != null ? String(player.obp) : '');
      setEra(player?.era != null ? String(player.era) : '');
    }
  }, [visible, player]);

  function setPref(slot: number, pos: Position | undefined) {
    setPrefs((prev) => {
      const next = [...prev];
      // If this position is already used in another slot, clear it there
      next.forEach((p, i) => { if (p === pos && i !== slot) next[i] = undefined; });
      next[slot] = pos;
      return next;
    });
  }

  async function handleSave() {
    if (!name.trim() || saving) return;
    setSaving(true);
    const preferredPositions = prefs.filter(Boolean) as Position[];
    try {
      await onSave({
        name: name.trim(),
        number: number.trim(),
        email: email.trim() || undefined,
        phone: phone.trim() || undefined,
        bats,
        throws: throws_,
        preferredPositions: preferredPositions.length > 0 ? preferredPositions : undefined,
        battingAverage: avg ? parseFloat(avg) : null,
        obp: obp ? parseFloat(obp) : null,
        era: era ? parseFloat(era) : null,
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.modalOverlay}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.modalCard}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>{player ? 'Edit Player' : 'Add Player'}</Text>
            <Pressable onPress={onClose}>
              <Ionicons name="close" size={24} color="#888" />
            </Pressable>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            {/* Name + Number */}
            <Text style={styles.fieldLabel}>Name *</Text>
            <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="Player name" autoFocus />

            <Text style={styles.fieldLabel}>Jersey Number</Text>
            <TextInput style={styles.input} value={number} onChangeText={setNumber} placeholder="e.g. 7" keyboardType="number-pad" />

            <Text style={styles.fieldLabel}>Email</Text>
            <TextInput
              style={styles.input}
              value={email}
              onChangeText={setEmail}
              placeholder="player@email.com"
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
            />

            <Text style={styles.fieldLabel}>Phone</Text>
            <TextInput
              style={styles.input}
              value={phone}
              onChangeText={setPhone}
              placeholder="(555) 555-5555"
              keyboardType="phone-pad"
            />

            {/* Bats */}
            <Text style={styles.fieldLabel}>Bats</Text>
            <View style={styles.chipRow}>
              {(['L', 'R', 'S'] as Handedness[]).map((v) => (
                <Pressable
                  key={v}
                  style={[styles.toggleChip, bats === v && styles.toggleChipActive]}
                  onPress={() => setBats(bats === v ? undefined : v)}
                >
                  <Text style={[styles.toggleChipText, bats === v && styles.toggleChipTextActive]}>
                    {v === 'S' ? 'Switch' : v === 'L' ? 'Left' : 'Right'}
                  </Text>
                </Pressable>
              ))}
            </View>

            {/* Throws */}
            <Text style={styles.fieldLabel}>Throws</Text>
            <View style={styles.chipRow}>
              {(['L', 'R'] as const).map((v) => (
                <Pressable
                  key={v}
                  style={[styles.toggleChip, throws_ === v && styles.toggleChipActive]}
                  onPress={() => setThrows(throws_ === v ? undefined : v)}
                >
                  <Text style={[styles.toggleChipText, throws_ === v && styles.toggleChipTextActive]}>
                    {v === 'L' ? 'Left' : 'Right'}
                  </Text>
                </Pressable>
              ))}
            </View>

            {/* Position preferences */}
            <Text style={styles.fieldLabel}>Preferred Positions</Text>
            {PREF_LABELS.map((label, slot) => (
              <View key={label} style={styles.prefRow}>
                <Text style={styles.prefLabel}>{label}</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.prefChips}>
                  {ALL_POSITIONS.map((pos) => {
                    const selected = prefs[slot] === pos;
                    const usedElsewhere = prefs.some((p, i) => p === pos && i !== slot);
                    return (
                      <Pressable
                        key={pos}
                        style={[
                          styles.posPickChip,
                          selected && styles.posPickChipActive,
                          usedElsewhere && styles.posPickChipUsed,
                        ]}
                        onPress={() => setPref(slot, selected ? undefined : pos)}
                      >
                        <Text style={[
                          styles.posPickChipText,
                          selected && styles.posPickChipTextActive,
                        ]}>
                          {pos}
                        </Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>
              </View>
            ))}

            {/* Stats */}
            <Text style={styles.fieldLabel}>Stats (optional)</Text>
            <View style={styles.statsRow}>
              <View style={styles.statField}>
                <Text style={styles.statFieldLabel}>AVG</Text>
                <TextInput style={styles.statInput} value={avg} onChangeText={setAvg} placeholder=".000" keyboardType="decimal-pad" />
              </View>
              <View style={styles.statField}>
                <Text style={styles.statFieldLabel}>OBP</Text>
                <TextInput style={styles.statInput} value={obp} onChangeText={setObp} placeholder=".000" keyboardType="decimal-pad" />
              </View>
              <View style={styles.statField}>
                <Text style={styles.statFieldLabel}>ERA</Text>
                <TextInput style={styles.statInput} value={era} onChangeText={setEra} placeholder="0.00" keyboardType="decimal-pad" />
              </View>
            </View>

            <View style={{ height: 20 }} />
          </ScrollView>

          <View style={styles.modalActions}>
            <Pressable style={[styles.modalBtn, styles.cancelBtn]} onPress={onClose} disabled={saving}>
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </Pressable>
            <Pressable
              style={[styles.modalBtn, styles.saveBtn, (!name.trim() || saving) && styles.disabled]}
              onPress={handleSave}
              disabled={!name.trim() || saving}
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

// ── CSV preview modal ─────────────────────────────────────────────────────────

type ConflictResolution = 'skip' | 'merge' | 'replace';

type ConflictItem = {
  csvRow: CsvRow;
  existing: Player;
  resolution: ConflictResolution;
};

function rowMeta(row: CsvRow) {
  return [
    row.number ? `#${row.number}` : null,
    row.preferredPositions?.[0],
    row.bats ? `${row.bats} bat` : null,
  ].filter(Boolean).join(' · ');
}

function mergeData(existing: Player, csv: CsvRow): Partial<Omit<Player, 'id'>> {
  const u: Partial<Omit<Player, 'id'>> = {};
  if (csv.number && !existing.number) u.number = csv.number;
  if (csv.email && !existing.email) u.email = csv.email;
  if (csv.bats && !existing.bats) u.bats = csv.bats;
  if (csv.throws && !existing.throws) u.throws = csv.throws;
  if (csv.preferredPositions?.length && !existing.preferredPositions?.length)
    u.preferredPositions = csv.preferredPositions;
  if (csv.battingAverage != null && existing.battingAverage == null) u.battingAverage = csv.battingAverage;
  if (csv.obp != null && existing.obp == null) u.obp = csv.obp;
  if (csv.era != null && existing.era == null) u.era = csv.era;
  return u;
}

function replaceData(csv: CsvRow): Partial<Omit<Player, 'id'>> {
  return {
    name: csv.name,
    number: csv.number ?? '',
    email: csv.email,
    bats: csv.bats,
    throws: csv.throws,
    preferredPositions: csv.preferredPositions,
    battingAverage: csv.battingAverage ?? null,
    obp: csv.obp ?? null,
    era: csv.era ?? null,
  };
}

function CsvPreviewModal({
  visible,
  data,
  existingPlayers,
  onClose,
  onImport,
}: {
  visible: boolean;
  data: ReturnType<typeof parseCsv> | null;
  existingPlayers: Player[];
  onClose: () => void;
  onImport: (
    newRows: CsvRow[],
    conflictUpdates: Array<{ playerId: string; data: Partial<Omit<Player, 'id'>> }>
  ) => Promise<void>;
}) {
  const [conflicts, setConflicts] = useState<ConflictItem[]>([]);
  const [newRows, setNewRows] = useState<CsvRow[]>([]);
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);

  // Recalculate when data or existingPlayers change
  React.useEffect(() => {
    if (!data) return;
    const fresh: ConflictItem[] = [];
    const fresh2: CsvRow[] = [];
    data.rows.forEach((row) => {
      const match = existingPlayers.find(
        (p) => p.name.trim().toLowerCase() === row.name.trim().toLowerCase()
      );
      if (match) fresh.push({ csvRow: row, existing: match, resolution: 'skip' });
      else fresh2.push(row);
    });
    setConflicts(fresh);
    setNewRows(fresh2);
  }, [data, existingPlayers]);

  if (!data) return null;

  function setResolution(idx: number, res: ConflictResolution) {
    setConflicts((prev) => prev.map((c, i) => i === idx ? { ...c, resolution: res } : c));
  }

  function applyAll(res: ConflictResolution) {
    setConflicts((prev) => prev.map((c) => ({ ...c, resolution: res })));
  }

  async function handleImport() {
    if (importing) return;
    setImporting(true);
    setImportError(null);
    try {
      const updates = conflicts
        .filter((c) => c.resolution !== 'skip')
        .map((c) => ({
          playerId: c.existing.id,
          data: c.resolution === 'merge'
            ? mergeData(c.existing, c.csvRow)
            : replaceData(c.csvRow),
        }))
        .filter((u) => Object.keys(u.data).length > 0);
      await onImport(newRows, updates);
    } catch (e: any) {
      const msg: string = e?.message ?? '';
      if (msg.includes('Unsupported field value')) {
        setImportError('One or more rows had an empty or invalid field. Check that your CSV matches the template format.');
      } else if (msg.includes('Missing or insufficient permissions')) {
        setImportError('Permission denied — make sure you\'re signed in as a team admin.');
      } else {
        setImportError(msg || 'Import failed. Check your CSV and try again.');
      }
    } finally {
      setImporting(false);
    }
  }

  const actionCount = newRows.length +
    conflicts.filter((c) => c.resolution !== 'skip').length;

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={[styles.modalCard, { maxHeight: '88%' }]}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Import Preview</Text>
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

          {data.rows.length === 0 ? (
            <Text style={styles.csvNoRows}>No valid players found in file.</Text>
          ) : (
            <ScrollView style={styles.csvList} keyboardShouldPersistTaps="handled">

              {/* New players */}
              {newRows.length > 0 && (
                <>
                  <Text style={styles.csvSectionLabel}>
                    New Players ({newRows.length})
                  </Text>
                  {newRows.map((row, i) => (
                    <View key={i} style={styles.csvRow}>
                      <Ionicons name="add-circle-outline" size={16} color="#1a5c2e" style={{ marginTop: 2 }} />
                      <View style={{ flex: 1 }}>
                        <Text style={styles.csvRowName}>{row.name}</Text>
                        <Text style={styles.csvRowMeta}>{rowMeta(row)}</Text>
                      </View>
                    </View>
                  ))}
                </>
              )}

              {/* Conflicts */}
              {conflicts.length > 0 && (
                <>
                  <Text style={[styles.csvSectionLabel, { color: '#e67e22' }]}>
                    Duplicate Names ({conflicts.length})
                  </Text>

                  {/* Apply to all — only shown when 2+ conflicts */}
                  {conflicts.length > 1 && (
                    <View style={styles.applyAllRow}>
                      <Text style={styles.applyAllLabel}>Apply to all:</Text>
                      {(['skip', 'merge', 'replace'] as ConflictResolution[]).map((res) => (
                        <Pressable
                          key={res}
                          style={[styles.resChip, conflicts.every(c => c.resolution === res) && resChipActive(res)]}
                          onPress={() => applyAll(res)}
                        >
                          <Text style={[styles.resChipText, conflicts.every(c => c.resolution === res) && styles.resChipTextActive]}>
                            {res.charAt(0).toUpperCase() + res.slice(1)} all
                          </Text>
                        </Pressable>
                      ))}
                    </View>
                  )}

                  {conflicts.map((conflict, i) => (
                    <View key={i} style={styles.conflictRow}>
                      <View style={styles.conflictInfo}>
                        <Text style={styles.csvRowName}>{conflict.csvRow.name}</Text>
                        <Text style={styles.csvRowMeta}>
                          Already in roster
                          {rowMeta(conflict.csvRow) ? ` · CSV: ${rowMeta(conflict.csvRow)}` : ''}
                        </Text>
                      </View>
                      <View style={styles.resRow}>
                        {(['skip', 'merge', 'replace'] as ConflictResolution[]).map((res) => (
                          <Pressable
                            key={res}
                            style={[styles.resChip, conflict.resolution === res && resChipActive(res)]}
                            onPress={() => setResolution(i, res)}
                          >
                            <Text style={[styles.resChipText, conflict.resolution === res && styles.resChipTextActive]}>
                              {res.charAt(0).toUpperCase() + res.slice(1)}
                            </Text>
                          </Pressable>
                        ))}
                      </View>
                    </View>
                  ))}
                </>
              )}

            </ScrollView>
          )}

          <View style={styles.modalActions}>
            <Pressable style={[styles.modalBtn, styles.cancelBtn]} onPress={onClose}>
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </Pressable>
            {data.rows.length > 0 && (
              <Pressable
                style={[styles.modalBtn, styles.saveBtn, (importing || actionCount === 0) && styles.disabled]}
                onPress={handleImport}
                disabled={importing || actionCount === 0}
              >
                {importing
                  ? <ActivityIndicator color="#fff" size="small" />
                  : <Text style={styles.saveBtnText}>
                      {actionCount === 0 ? 'Nothing to import' : `Import ${actionCount}`}
                    </Text>}
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
  listHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingBottom: 8,
  },
  subtitle: { fontSize: 13, color: '#888' },
  sortBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingVertical: 5, paddingHorizontal: 10,
    borderRadius: 8, borderWidth: 1.5, borderColor: '#1a5c2e',
    backgroundColor: '#edf6f0',
  },
  sortBtnText: { fontSize: 12, fontWeight: '600', color: '#1a5c2e' },
  sortMenu: {
    marginHorizontal: 16, marginBottom: 8,
    backgroundColor: '#fff',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e8e8e6',
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
    overflow: 'hidden',
  },
  sortMenuItem: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 11, paddingHorizontal: 14,
    borderBottomWidth: 1, borderBottomColor: '#f0f0ef',
  },
  sortMenuItemActive: { backgroundColor: '#edf6f0' },
  sortMenuItemText: { fontSize: 14, color: '#333' },
  sortMenuItemTextActive: { fontWeight: '700', color: '#1a5c2e' },
  list: { padding: 16, gap: 10 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 14,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  rowHighlighted: { borderWidth: 1.5, borderColor: '#1a5c2e', backgroundColor: '#f5fbf7' },
  badge: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#1a5c2e',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  badgeMe: { backgroundColor: '#0e3d1f' },
  badgeNum: { color: '#fff', fontWeight: '700', fontSize: 12 },
  playerInfo: { flex: 1 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  playerName: { fontSize: 15, fontWeight: '600', color: '#1a1a1a' },
  youBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#edf6f0',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: '#1a5c2e',
  },
  youBadgeText: { fontSize: 10, fontWeight: '800', color: '#1a5c2e' },
  rowActions: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  claimBtn: {
    borderWidth: 1.5,
    borderColor: '#1a5c2e',
    borderRadius: 8,
    paddingVertical: 5,
    paddingHorizontal: 10,
    marginRight: 4,
  },
  claimBtnText: { fontSize: 12, fontWeight: '600', color: '#1a5c2e' },
  posChip: {
    backgroundColor: '#edf6f0',
    borderRadius: 5,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  posChipText: { fontSize: 11, fontWeight: '700', color: '#1a5c2e' },
  handChip: {
    backgroundColor: '#f5f5f4',
    borderRadius: 5,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  handChipText: { fontSize: 11, color: '#666' },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 2 },
  battingPos: { fontSize: 12, color: '#aaa' },
  statsMeta: { fontSize: 12, color: '#888' },
  iconBtn: { padding: 8 },
  deleteConfirmRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4, flexWrap: 'wrap' },
  deleteConfirmText: { fontSize: 13, color: '#c0392b', fontWeight: '600', flex: 1 },
  deleteConfirmYes: {
    paddingVertical: 4, paddingHorizontal: 12, borderRadius: 7,
    backgroundColor: '#c0392b',
  },
  deleteConfirmYesText: { fontSize: 12, color: '#fff', fontWeight: '700' },
  deleteConfirmNo: {
    paddingVertical: 4, paddingHorizontal: 12, borderRadius: 7,
    backgroundColor: '#f0f0ef',
  },
  deleteConfirmNoText: { fontSize: 12, color: '#555', fontWeight: '600' },
  claimConfirmWrapper: { marginTop: 4, gap: 6 },
  claimConfirmText: { fontSize: 13, color: '#1a5c2e', fontWeight: '600' },
  claimConfirmButtons: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  claimConfirmYes: {
    paddingVertical: 4, paddingHorizontal: 12, borderRadius: 7,
    backgroundColor: '#1a5c2e',
  },
  claimConfirmYesText: { fontSize: 12, color: '#fff', fontWeight: '700' },
  claimConfirmGuardian: {
    paddingVertical: 4, paddingHorizontal: 12, borderRadius: 7,
    borderWidth: 1.5, borderColor: '#1a5c2e',
  },
  claimConfirmGuardianText: { fontSize: 12, color: '#1a5c2e', fontWeight: '700' },
  empty: { alignItems: 'center', paddingTop: 60, gap: 8 },
  emptyText: { color: '#999', fontSize: 16, fontWeight: '600' },
  emptyHint: { color: '#bbb', fontSize: 13, textAlign: 'center', paddingHorizontal: 40 },
  hintBox: {
    marginBottom: 8,
    backgroundColor: '#edf6f0',
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  hintText: { fontSize: 13, color: '#555', lineHeight: 18 },
  footer: {
    flexDirection: 'row',
    padding: 16,
    gap: 10,
    borderTopWidth: 1,
    borderTopColor: '#eee',
    backgroundColor: '#f7f7f5',
  },
  csvGroup: {
    alignItems: 'center',
    gap: 5,
  },
  templateLink: {
    fontSize: 11,
    color: '#1a5c2e',
    textDecorationLine: 'underline',
  },
  csvBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderWidth: 1.5,
    borderColor: '#1a5c2e',
    borderRadius: 12,
    paddingVertical: 13,
    paddingHorizontal: 16,
  },
  csvBtnText: { color: '#1a5c2e', fontWeight: '600', fontSize: 14 },
  addBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1a5c2e',
    borderRadius: 12,
    paddingVertical: 13,
    gap: 6,
  },
  addBtnText: { color: '#fff', fontWeight: '600', fontSize: 15 },
  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  modalCard: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    maxHeight: '92%',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  modalTitle: { fontSize: 20, fontWeight: '700', color: '#1a1a1a' },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#888',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 6,
    marginTop: 14,
  },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 10,
    paddingVertical: 11,
    paddingHorizontal: 14,
    fontSize: 16,
    backgroundColor: '#fafaf8',
  },
  chipRow: { flexDirection: 'row', gap: 8 },
  toggleChip: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: '#ddd',
    backgroundColor: '#fafaf8',
  },
  toggleChipActive: { borderColor: '#1a5c2e', backgroundColor: '#edf6f0' },
  toggleChipText: { fontSize: 14, fontWeight: '500', color: '#888' },
  toggleChipTextActive: { color: '#1a5c2e', fontWeight: '700' },
  prefRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  prefLabel: {
    width: 22,
    fontSize: 13,
    fontWeight: '700',
    color: '#1a5c2e',
    marginRight: 8,
  },
  prefChips: { flexDirection: 'row', gap: 6 },
  posPickChip: {
    width: 38,
    height: 34,
    borderRadius: 7,
    borderWidth: 1.5,
    borderColor: '#ddd',
    backgroundColor: '#fafaf8',
    alignItems: 'center',
    justifyContent: 'center',
  },
  posPickChipActive: { borderColor: '#1a5c2e', backgroundColor: '#1a5c2e' },
  posPickChipUsed: { opacity: 0.35 },
  posPickChipText: { fontSize: 11, fontWeight: '600', color: '#555' },
  posPickChipTextActive: { color: '#fff' },
  statsRow: { flexDirection: 'row', gap: 10 },
  statField: { flex: 1 },
  statFieldLabel: { fontSize: 11, fontWeight: '600', color: '#aaa', marginBottom: 4 },
  statInput: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    fontSize: 15,
    backgroundColor: '#fafaf8',
    textAlign: 'center',
  },
  modalActions: { flexDirection: 'row', gap: 10, marginTop: 16 },
  modalBtn: { flex: 1, borderRadius: 10, paddingVertical: 14, alignItems: 'center', justifyContent: 'center' },
  cancelBtn: { backgroundColor: '#f0f0ef' },
  cancelBtnText: { color: '#555', fontWeight: '600', fontSize: 15 },
  saveBtn: { backgroundColor: '#1a5c2e' },
  saveBtnText: { color: '#fff', fontWeight: '600', fontSize: 15 },
  disabled: { opacity: 0.4 },
  // CSV
  csvErrors: { backgroundColor: '#fff8f5', borderRadius: 8, padding: 10, marginBottom: 10, gap: 4 },
  csvError: { fontSize: 13, color: '#c0392b' },
  csvNoRows: { color: '#aaa', textAlign: 'center', padding: 20 },
  csvList: { maxHeight: 400 },
  csvSectionLabel: {
    fontSize: 12, fontWeight: '700', color: '#888',
    textTransform: 'uppercase', letterSpacing: 0.5,
    paddingTop: 14, paddingBottom: 6,
  },
  csvRow: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8,
    paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#f0f0ef',
  },
  csvRowName: { fontSize: 15, fontWeight: '600', color: '#1a1a1a' },
  csvRowMeta: { fontSize: 12, color: '#888', marginTop: 2 },
  conflictRow: {
    paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#f0f0ef', gap: 8,
  },
  conflictInfo: { flex: 1 },
  applyAllRow: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#fef9f0', borderRadius: 8, padding: 10, marginBottom: 6,
  },
  applyAllLabel: { fontSize: 12, color: '#888', fontWeight: '600', marginRight: 2 },
  resRow: { flexDirection: 'row', gap: 6 },
  resChip: {
    paddingVertical: 5, paddingHorizontal: 10, borderRadius: 7,
    borderWidth: 1.5, borderColor: '#ddd', backgroundColor: '#fafaf8',
  },
  resChipText: { fontSize: 12, fontWeight: '600', color: '#888' },
  resChipTextActive: { color: '#1a1a1a' },
});

function resChipActive(res: ConflictResolution) {
  return {
    borderColor: res === 'skip' ? '#aaa' : res === 'merge' ? '#2980b9' : '#c0392b',
    backgroundColor: res === 'skip' ? '#f5f5f4' : res === 'merge' ? '#eaf4fb' : '#fdf0ef',
  };
}
