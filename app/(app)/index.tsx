import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useState } from 'react';
import {
  ActivityIndicator,
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
import { useAuth } from '../../src/store/AuthContext';
import { useApp } from '../../src/store/AppContext';
import { League, Sport, Team } from '../../src/types';

type CreateMode = 'team' | 'league' | null;
type DeleteTarget = { kind: 'team'; item: Team } | { kind: 'league'; item: League } | null;

export default function DashboardScreen() {
  const { user, signOut, updateDisplayName } = useAuth();
  const { teams, leagues, loading, createTeam, removeTeam, hideTeam, createLeague, removeLeague } = useApp();
  const [createMode, setCreateMode] = useState<CreateMode>(null);
  const [profileOpen, setProfileOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget>(null);
  const [editingName, setEditingName] = useState(false);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [savingName, setSavingName] = useState(false);

  const displayName = user?.displayName?.split(' ')[0] ?? 'Coach';
  const initial = (user?.displayName ?? user?.email ?? 'C')[0].toUpperCase();

  if (loading) {
    return (
      <View style={styles.loader}>
        <ActivityIndicator size="large" color="#1a5c2e" />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.appName}>ScoreBall</Text>
          <Text style={styles.greeting}>Hey, {displayName}</Text>
        </View>
        <Pressable style={styles.avatarBtn} onPress={() => setProfileOpen(true)}>
          <Text style={styles.avatarInitial}>{initial}</Text>
        </Pressable>
      </View>

      <Modal
        visible={profileOpen}
        animationType="slide"
        transparent
        onRequestClose={() => { setProfileOpen(false); setEditingName(false); }}
      >
        <Pressable style={styles.profileOverlay} onPress={() => { setProfileOpen(false); setEditingName(false); }}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <Pressable style={styles.profileSheet} onPress={() => {}}>
              <View style={styles.profileHandle} />
              <View style={styles.profileAvatar}>
                <Text style={styles.profileAvatarText}>{initial}</Text>
              </View>

              {editingName ? (
                <>
                  <View style={styles.nameEditRow}>
                    <TextInput
                      style={styles.nameInput}
                      value={firstName}
                      onChangeText={setFirstName}
                      placeholder="First name"
                      autoFocus
                      returnKeyType="next"
                    />
                    <TextInput
                      style={styles.nameInput}
                      value={lastName}
                      onChangeText={setLastName}
                      placeholder="Last name"
                      returnKeyType="done"
                      onSubmitEditing={async () => {
                        if (!firstName.trim() || savingName) return;
                        setSavingName(true);
                        try { await updateDisplayName(firstName, lastName); setEditingName(false); }
                        finally { setSavingName(false); }
                      }}
                    />
                  </View>
                  <View style={styles.nameEditActions}>
                    <Pressable style={styles.nameCancelBtn} onPress={() => setEditingName(false)} disabled={savingName}>
                      <Text style={styles.nameCancelText}>Cancel</Text>
                    </Pressable>
                    <Pressable
                      style={[styles.nameSaveBtn, (!firstName.trim() || savingName) && styles.disabled]}
                      disabled={!firstName.trim() || savingName}
                      onPress={async () => {
                        setSavingName(true);
                        try { await updateDisplayName(firstName, lastName); setEditingName(false); }
                        finally { setSavingName(false); }
                      }}
                    >
                      {savingName
                        ? <ActivityIndicator color="#fff" size="small" />
                        : <Text style={styles.nameSaveText}>Save</Text>}
                    </Pressable>
                  </View>
                </>
              ) : (
                <Pressable
                  style={styles.profileNameRow}
                  onPress={() => {
                    const parts = (user?.displayName ?? '').split(' ');
                    setFirstName(parts[0] ?? '');
                    setLastName(parts.slice(1).join(' ') ?? '');
                    setEditingName(true);
                  }}
                >
                  <Text style={styles.profileName}>{user?.displayName ?? 'Set your name'}</Text>
                  <Ionicons name="pencil-outline" size={15} color="#aaa" />
                </Pressable>
              )}

              <Text style={styles.profileEmail}>{user?.email}</Text>
              <Pressable
                style={styles.signOutBtn}
                onPress={() => { setProfileOpen(false); setEditingName(false); signOut(); }}
              >
                <Ionicons name="log-out-outline" size={18} color="#c0392b" />
                <Text style={styles.signOutBtnText}>Sign Out</Text>
              </Pressable>
            </Pressable>
          </KeyboardAvoidingView>
        </Pressable>
      </Modal>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Teams section */}
        <SectionHeader title="Your Teams" onAdd={() => setCreateMode('team')} />
        {teams.length === 0 ? (
          <EmptyState
            icon="people-outline"
            message="No teams yet. Create your first team to get started."
            cta="New Team"
            onPress={() => setCreateMode('team')}
          />
        ) : (
          <FlatList
            data={teams}
            keyExtractor={(t) => t.id}
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.cardList}
            renderItem={({ item }) => (
              <TeamCard
                team={item}
                isOwner={item.ownerId === user?.uid}
                onPress={() => router.push(`/(app)/team/${item.id}`)}
                onDelete={() => setDeleteTarget({ kind: 'team', item })}
              />
            )}
          />
        )}

        {/* Leagues section */}
        <SectionHeader title="Your Leagues" onAdd={() => setCreateMode('league')} />
        {leagues.length === 0 ? (
          <EmptyState
            icon="trophy-outline"
            message="No leagues yet. Create a league to organize multiple teams."
            cta="New League"
            onPress={() => setCreateMode('league')}
          />
        ) : (
          <FlatList
            data={leagues}
            keyExtractor={(l) => l.id}
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.cardList}
            renderItem={({ item }) => (
              <LeagueCard
                league={item}
                teamCount={item.teamIds.length}
                onPress={() => router.push(`/(app)/league/${item.id}`)}
                onDelete={() => setDeleteTarget({ kind: 'league', item })}
              />
            )}
          />
        )}
      </ScrollView>

      <CreateModal
        mode={createMode}
        onClose={() => setCreateMode(null)}
        onCreate={async (data) => {
          if (data.type === 'team') {
            const id = await createTeam(data.name, data.sport);
            router.push(`/(app)/team/${id}`);
          } else {
            await createLeague(data.name, data.sport, data.season ?? '');
          }
          setCreateMode(null);
        }}
      />

      {/* Action sheet for team / league deletion */}
      <Modal
        visible={deleteTarget !== null}
        animationType="slide"
        transparent
        onRequestClose={() => setDeleteTarget(null)}
      >
        <Pressable style={styles.actionOverlay} onPress={() => setDeleteTarget(null)}>
          <Pressable style={styles.actionSheet} onPress={() => {}}>
            <View style={styles.actionHandle} />
            {deleteTarget && (
              <>
                <Text style={styles.actionTitle} numberOfLines={2}>
                  {deleteTarget.item.name}
                </Text>
                <Text style={styles.actionSubtitle}>
                  {deleteTarget.kind === 'team' ? 'What do you want to do with this team?' : 'What do you want to do with this league?'}
                </Text>

                <Pressable
                  style={styles.actionBtn}
                  onPress={() => { hideTeam(deleteTarget.item.id); setDeleteTarget(null); }}
                >
                  <Ionicons name="eye-off-outline" size={20} color="#555" />
                  <View style={styles.actionBtnText}>
                    <Text style={styles.actionBtnLabel}>Remove from View</Text>
                    <Text style={styles.actionBtnHint}>Hides this {deleteTarget.kind} from your dashboard. It still exists.</Text>
                  </View>
                </Pressable>

                {deleteTarget.kind === 'team' && deleteTarget.item.ownerId === user?.uid && (
                  <Pressable
                    style={[styles.actionBtn, styles.actionBtnDanger]}
                    onPress={() => { removeTeam(deleteTarget.item.id); setDeleteTarget(null); }}
                  >
                    <Ionicons name="trash-outline" size={20} color="#c0392b" />
                    <View style={styles.actionBtnText}>
                      <Text style={[styles.actionBtnLabel, { color: '#c0392b' }]}>Delete Permanently</Text>
                      <Text style={styles.actionBtnHint}>Removes the team and all its data. Cannot be undone.</Text>
                    </View>
                  </Pressable>
                )}

                {deleteTarget.kind === 'league' && deleteTarget.item.ownerId === user?.uid && (
                  <Pressable
                    style={[styles.actionBtn, styles.actionBtnDanger]}
                    onPress={() => { removeLeague(deleteTarget.item.id); setDeleteTarget(null); }}
                  >
                    <Ionicons name="trash-outline" size={20} color="#c0392b" />
                    <View style={styles.actionBtnText}>
                      <Text style={[styles.actionBtnLabel, { color: '#c0392b' }]}>Delete Permanently</Text>
                      <Text style={styles.actionBtnHint}>Removes the league and its schedule. Cannot be undone.</Text>
                    </View>
                  </Pressable>
                )}

                <Pressable style={styles.actionCancel} onPress={() => setDeleteTarget(null)}>
                  <Text style={styles.actionCancelText}>Cancel</Text>
                </Pressable>
              </>
            )}
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function SectionHeader({ title, onAdd }: { title: string; onAdd: () => void }) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <Pressable style={styles.addChip} onPress={onAdd}>
        <Ionicons name="add" size={16} color="#1a5c2e" />
        <Text style={styles.addChipText}>New</Text>
      </Pressable>
    </View>
  );
}

function EmptyState({
  icon,
  message,
  cta,
  onPress,
}: {
  icon: any;
  message: string;
  cta: string;
  onPress: () => void;
}) {
  return (
    <View style={styles.emptyCard}>
      <Ionicons name={icon} size={32} color="#ccc" />
      <Text style={styles.emptyText}>{message}</Text>
      <Pressable style={styles.emptyBtn} onPress={onPress}>
        <Text style={styles.emptyBtnText}>{cta}</Text>
      </Pressable>
    </View>
  );
}

function TeamCard({
  team,
  isOwner,
  onPress,
  onDelete,
}: {
  team: Team;
  isOwner: boolean;
  onPress: () => void;
  onDelete: () => void;
}) {
  return (
    <Pressable style={styles.teamCard} onPress={onPress}>
      <View style={styles.cardSport}>
        <Text style={styles.cardSportText}>{team.sport === 'softball' ? '🥎' : '⚾'}</Text>
      </View>
      <Text style={styles.cardName} numberOfLines={2}>{team.name}</Text>
      <Text style={styles.cardMeta}>{team.playerIds.length} players</Text>
      {!isOwner && (
        <View style={styles.coAdminBadge}>
          <Text style={styles.coAdminBadgeText}>Coach</Text>
        </View>
      )}
      {isOwner && (
        <Pressable style={styles.cardDelete} onPress={onDelete} hitSlop={8}>
          <Ionicons name="trash-outline" size={14} color="#c0392b" />
        </Pressable>
      )}
    </Pressable>
  );
}

function LeagueCard({
  league,
  teamCount,
  onPress,
  onDelete,
}: {
  league: League;
  teamCount: number;
  onPress: () => void;
  onDelete: () => void;
}) {
  return (
    <Pressable style={styles.leagueCard} onPress={onPress}>
      <View style={styles.leagueIcon}>
        <Ionicons name="trophy-outline" size={22} color="#1a5c2e" />
      </View>
      <Text style={styles.cardName} numberOfLines={2}>{league.name}</Text>
      <Text style={styles.cardMeta}>{league.season}</Text>
      <Text style={styles.cardMeta}>{teamCount} {teamCount === 1 ? 'team' : 'teams'}</Text>
      <Pressable style={styles.cardDelete} onPress={onDelete} hitSlop={8}>
        <Ionicons name="trash-outline" size={14} color="#c0392b" />
      </Pressable>
    </Pressable>
  );
}

// ── Create modal ──────────────────────────────────────────────────────────────

type CreateData =
  | { type: 'team'; name: string; sport: Sport }
  | { type: 'league'; name: string; sport: Sport; season: string };

function CreateModal({
  mode,
  onClose,
  onCreate,
}: {
  mode: CreateMode;
  onClose: () => void;
  onCreate: (data: CreateData) => Promise<void>;
}) {
  const [name, setName] = useState('');
  const [sport, setSport] = useState<Sport>('baseball');
  const [season, setSeason] = useState('');
  const [saving, setSaving] = useState(false);

  function reset() {
    setName('');
    setSport('baseball');
    setSeason('');
    setSaving(false);
  }

  async function handleCreate() {
    if (!name.trim()) return;
    setSaving(true);
    try {
      if (mode === 'team') {
        await onCreate({ type: 'team', name: name.trim(), sport });
      } else {
        await onCreate({ type: 'league', name: name.trim(), sport, season: season.trim() });
      }
      reset();
    } catch {
      setSaving(false);
    }
  }

  return (
    <Modal
      visible={mode !== null}
      animationType="slide"
      transparent
      onRequestClose={() => { onClose(); reset(); }}
    >
      <KeyboardAvoidingView
        style={styles.modalOverlay}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.modalCard}>
          <Text style={styles.modalTitle}>
            {mode === 'team' ? 'New Team' : 'New League'}
          </Text>

          <TextInput
            style={styles.input}
            placeholder={mode === 'team' ? 'Team name' : 'League name'}
            value={name}
            onChangeText={setName}
            autoFocus
            returnKeyType={mode === 'league' ? 'next' : 'done'}
          />

          {mode === 'league' && (
            <TextInput
              style={styles.input}
              placeholder="Season (e.g. Spring 2026)"
              value={season}
              onChangeText={setSeason}
              returnKeyType="done"
            />
          )}

          {/* Sport picker */}
          <View style={styles.sportRow}>
            {(['baseball', 'softball'] as Sport[]).map((s) => (
              <Pressable
                key={s}
                style={[styles.sportChip, sport === s && styles.sportChipActive]}
                onPress={() => setSport(s)}
              >
                <Text style={[styles.sportChipText, sport === s && styles.sportChipTextActive]}>
                  {s === 'baseball' ? '⚾ Baseball' : '🥎 Softball'}
                </Text>
              </Pressable>
            ))}
          </View>

          <View style={styles.modalActions}>
            <Pressable
              style={[styles.modalBtn, styles.cancelBtn]}
              onPress={() => { onClose(); reset(); }}
              disabled={saving}
            >
              <Text style={styles.cancelText}>Cancel</Text>
            </Pressable>
            <Pressable
              style={[styles.modalBtn, styles.saveBtn, (!name.trim() || saving) && styles.disabled]}
              onPress={handleCreate}
              disabled={!name.trim() || saving}
            >
              {saving
                ? <ActivityIndicator color="#fff" size="small" />
                : <Text style={styles.saveText}>Create</Text>}
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f7f7f5' },
  loader: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#f7f7f5' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 16,
  },
  appName: { fontSize: 13, fontWeight: '700', color: '#1a5c2e', letterSpacing: 1, textTransform: 'uppercase' },
  greeting: { fontSize: 26, fontWeight: '800', color: '#1a1a1a', marginTop: 2 },
  avatarBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#1a5c2e',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: { color: '#fff', fontWeight: '700', fontSize: 17 },
  scroll: { paddingBottom: 40 },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    marginTop: 24,
    marginBottom: 12,
  },
  sectionTitle: { fontSize: 18, fontWeight: '700', color: '#1a1a1a' },
  addChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: 1.5,
    borderColor: '#1a5c2e',
    borderRadius: 20,
    paddingVertical: 5,
    paddingHorizontal: 12,
  },
  addChipText: { color: '#1a5c2e', fontWeight: '600', fontSize: 13 },
  cardList: { paddingHorizontal: 20, gap: 12 },
  teamCard: {
    width: 140,
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  cardSport: { marginBottom: 10 },
  cardSportText: { fontSize: 28 },
  leagueCard: {
    width: 160,
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  leagueIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#edf6f0',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  cardName: { fontSize: 15, fontWeight: '700', color: '#1a1a1a', marginBottom: 4 },
  cardMeta: { fontSize: 12, color: '#888' },
  cardDelete: { position: 'absolute', top: 10, right: 10 },
  coAdminBadge: {
    position: 'absolute', top: 10, right: 10,
    backgroundColor: '#edf6f0', borderRadius: 6,
    paddingHorizontal: 6, paddingVertical: 2,
  },
  coAdminBadgeText: { fontSize: 9, fontWeight: '700', color: '#1a5c2e', textTransform: 'uppercase', letterSpacing: 0.3 },
  emptyCard: {
    marginHorizontal: 20,
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderColor: '#eee',
    borderStyle: 'dashed',
  },
  emptyText: { color: '#aaa', fontSize: 14, textAlign: 'center' },
  emptyBtn: {
    borderWidth: 1.5,
    borderColor: '#1a5c2e',
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 20,
    marginTop: 4,
  },
  emptyBtnText: { color: '#1a5c2e', fontWeight: '600', fontSize: 14 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  modalCard: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 24,
    gap: 12,
  },
  modalTitle: { fontSize: 20, fontWeight: '700', color: '#1a1a1a' },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 10,
    paddingVertical: 13,
    paddingHorizontal: 14,
    fontSize: 16,
    backgroundColor: '#fafaf8',
  },
  sportRow: { flexDirection: 'row', gap: 10 },
  sportChip: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#ddd',
    alignItems: 'center',
    backgroundColor: '#fafaf8',
  },
  sportChipActive: { borderColor: '#1a5c2e', backgroundColor: '#edf6f0' },
  sportChipText: { fontSize: 14, fontWeight: '500', color: '#888' },
  sportChipTextActive: { color: '#1a5c2e', fontWeight: '700' },
  modalActions: { flexDirection: 'row', gap: 10, marginTop: 4 },
  modalBtn: { flex: 1, borderRadius: 10, paddingVertical: 14, alignItems: 'center', justifyContent: 'center' },
  cancelBtn: { backgroundColor: '#f0f0ef' },
  cancelText: { color: '#555', fontWeight: '600', fontSize: 15 },
  saveBtn: { backgroundColor: '#1a5c2e' },
  saveText: { color: '#fff', fontWeight: '600', fontSize: 15 },
  disabled: { opacity: 0.4 },
  profileOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  profileSheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 28,
    alignItems: 'center',
    gap: 6,
  },
  profileHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#ddd',
    marginBottom: 16,
  },
  profileAvatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#1a5c2e',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  profileAvatarText: { color: '#fff', fontWeight: '700', fontSize: 26 },
  profileNameRow: {
    flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2,
  },
  profileName: { fontSize: 18, fontWeight: '700', color: '#1a1a1a' },
  profileEmail: { fontSize: 14, color: '#888', marginBottom: 16 },
  nameEditRow: { width: '100%', gap: 8, marginBottom: 10 },
  nameInput: {
    borderWidth: 1, borderColor: '#ddd', borderRadius: 10,
    paddingVertical: 11, paddingHorizontal: 14,
    fontSize: 16, backgroundColor: '#fafaf8', width: '100%',
  },
  nameEditActions: { flexDirection: 'row', gap: 8, width: '100%', marginBottom: 4 },
  nameCancelBtn: {
    flex: 1, paddingVertical: 12, borderRadius: 10,
    backgroundColor: '#f0f0ef', alignItems: 'center',
  },
  nameCancelText: { color: '#555', fontWeight: '600', fontSize: 14 },
  nameSaveBtn: {
    flex: 1, paddingVertical: 12, borderRadius: 10,
    backgroundColor: '#1a5c2e', alignItems: 'center', justifyContent: 'center',
  },
  nameSaveText: { color: '#fff', fontWeight: '600', fontSize: 14 },
  signOutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    width: '100%',
    borderWidth: 1.5,
    borderColor: '#f5c6c6',
    borderRadius: 12,
    paddingVertical: 14,
    backgroundColor: '#fff5f5',
    marginTop: 8,
  },
  signOutBtnText: { color: '#c0392b', fontWeight: '600', fontSize: 15 },
  // Action sheet
  actionOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  actionSheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    paddingBottom: 32,
    gap: 4,
  },
  actionHandle: {
    width: 36, height: 4, borderRadius: 2, backgroundColor: '#ddd',
    alignSelf: 'center', marginBottom: 16,
  },
  actionTitle: { fontSize: 18, fontWeight: '700', color: '#1a1a1a', marginBottom: 2 },
  actionSubtitle: { fontSize: 13, color: '#888', marginBottom: 12 },
  actionBtn: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 14,
    paddingVertical: 14, paddingHorizontal: 16,
    borderRadius: 12, backgroundColor: '#f7f7f5',
    marginBottom: 8,
  },
  actionBtnDanger: { backgroundColor: '#fff5f5' },
  actionBtnText: { flex: 1 },
  actionBtnLabel: { fontSize: 15, fontWeight: '600', color: '#1a1a1a' },
  actionBtnHint: { fontSize: 12, color: '#aaa', marginTop: 2 },
  actionCancel: {
    alignItems: 'center', paddingVertical: 14, marginTop: 4,
    borderRadius: 12, backgroundColor: '#f0f0ef',
  },
  actionCancelText: { fontSize: 15, fontWeight: '600', color: '#555' },
});
