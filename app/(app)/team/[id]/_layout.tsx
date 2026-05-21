import { Ionicons } from '@expo/vector-icons';
import * as Linking from 'expo-linking';
import { router, Tabs, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { GameRulesModal } from '../../../../src/components/GameRulesModal';
import { createTeamInvite } from '../../../../src/firebase/db';
import { useApp } from '../../../../src/store/AppContext';
import { useAuth } from '../../../../src/store/AuthContext';
import { DEFAULT_RULES } from '../../../../src/types';

const VISIBLE_TABS = ['index', 'schedule', 'game-plan', 'history'];
const TAB_LABELS: Record<string, string> = {
  index: 'Roster',
  schedule: 'Schedule',
  'game-plan': 'Game Plan',
  history: 'History',
};

function TeamHeader({
  navigation,
  teamName,
  onOpenShare,
  sharing,
  isOwner,
  isAdmin,
  onOpenFormat,
}: {
  navigation: any;
  teamName: string;
  onOpenShare: () => void;
  sharing: boolean;
  isOwner: boolean;
  isAdmin: boolean;
  onOpenFormat: () => void;
}) {
  const state = navigation.getState();
  const visibleRoutes = (state.routes as any[]).filter((r) => VISIBLE_TABS.includes(r.name));
  const activeRouteName = state.routes[state.index]?.name;

  return (
    <SafeAreaView edges={['top']} style={styles.headerOuter}>
      <View style={styles.headerRow}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={24} color="#1a5c2e" />
        </Pressable>
        <Text style={styles.headerTitle} numberOfLines={1}>{teamName}</Text>
        <View style={styles.headerActions}>
          {isAdmin && (
            <Pressable onPress={onOpenFormat} style={styles.actionBtn}>
              <Ionicons name="options-outline" size={22} color="#1a5c2e" />
            </Pressable>
          )}
          {isOwner ? (
            <Pressable onPress={onOpenShare} style={styles.actionBtn} disabled={sharing}>
              {sharing
                ? <ActivityIndicator size="small" color="#1a5c2e" />
                : <Ionicons name="share-outline" size={22} color="#1a5c2e" />}
            </Pressable>
          ) : (
            <View style={styles.actionBtn} />
          )}
        </View>
      </View>
      <View style={styles.tabBarOuter}>
        <View style={styles.segmented}>
          {visibleRoutes.map((route) => {
            const isFocused = activeRouteName === route.name;
            return (
              <Pressable
                key={route.key}
                style={[styles.segment, isFocused && styles.segmentActive]}
                onPress={() => navigation.navigate(route.name)}
              >
                <Text style={[styles.segmentText, isFocused && styles.segmentTextActive]}>
                  {TAB_LABELS[route.name]}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>
    </SafeAreaView>
  );
}

const ROLE_ROWS: { label: string; permission: string }[] = [
  { label: 'View roster, schedule & history',  permission: 'all' },
  { label: 'Download schedule',                permission: 'all' },
  { label: 'Toggle own availability',          permission: 'member+' },
  { label: 'Edit batting order & positions',   permission: 'editor' },
  { label: 'Add / edit / delete games',        permission: 'editor' },
  { label: 'Add / edit / delete players',      permission: 'editor' },
  { label: 'Bench / activate players',         permission: 'editor' },
  { label: 'Start scoresheet',                 permission: 'editor' },
  { label: 'Change game format rules',         permission: 'editor' },
];

function check(permission: string, role: 'editor' | 'member' | 'viewer') {
  if (permission === 'all') return true;
  if (permission === 'member+') return role === 'editor' || role === 'member';
  if (permission === 'editor') return role === 'editor';
  return false;
}

function ShareModal({
  visible,
  onClose,
  onInvite,
  sharing,
}: {
  visible: boolean;
  onClose: () => void;
  onInvite: (role: 'editor' | 'member' | 'viewer') => void;
  sharing: boolean;
}) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.shareOverlay} onPress={onClose} />
      <View style={styles.shareSheet}>
        <View style={styles.shareSheetHandle} />
        <Text style={styles.shareSheetTitle}>Invite Someone</Text>
        <Text style={styles.shareSheetSub}>Choose what they can do on this team.</Text>

        <ScrollView showsVerticalScrollIndicator={false}>
          {/* Column headers */}
          <View style={styles.tableRow}>
            <View style={styles.tablePermCol} />
            <Text style={[styles.tableRoleHeader, { color: '#1a5c2e' }]}>Co-Captain{'\n'}/ Editor</Text>
            <Text style={[styles.tableRoleHeader, { color: '#3050a8' }]}>Member</Text>
            <Text style={[styles.tableRoleHeader, { color: '#888' }]}>Viewer</Text>
          </View>

          <View style={styles.tableDivider} />

          {ROLE_ROWS.map((row, i) => (
            <View key={i} style={[styles.tableRow, i % 2 === 1 && styles.tableRowAlt]}>
              <Text style={styles.tablePermLabel}>{row.label}</Text>
              {(['editor', 'member', 'viewer'] as const).map((role) => (
                <View key={role} style={styles.tableCheckCell}>
                  {check(row.permission, role)
                    ? <Ionicons name="checkmark-circle" size={18} color={role === 'editor' ? '#1a5c2e' : role === 'member' ? '#3050a8' : '#aaa'} />
                    : <Ionicons name="remove" size={18} color="#e0e0e0" />}
                </View>
              ))}
            </View>
          ))}

          <View style={styles.tableDivider} />

          {/* Invite buttons */}
          <View style={styles.inviteRow}>
            <Pressable style={[styles.inviteBtn, { backgroundColor: '#edf6f0', borderColor: '#1a5c2e' }]}
              onPress={() => onInvite('editor')} disabled={sharing}>
              <Text style={[styles.inviteBtnText, { color: '#1a5c2e' }]}>Invite as{'\n'}Co-Captain</Text>
            </Pressable>
            <Pressable style={[styles.inviteBtn, { backgroundColor: '#e8f0fe', borderColor: '#3050a8' }]}
              onPress={() => onInvite('member')} disabled={sharing}>
              <Text style={[styles.inviteBtnText, { color: '#3050a8' }]}>Invite as{'\n'}Member</Text>
            </Pressable>
            <Pressable style={[styles.inviteBtn, { backgroundColor: '#f5f5f4', borderColor: '#aaa' }]}
              onPress={() => onInvite('viewer')} disabled={sharing}>
              <Text style={[styles.inviteBtnText, { color: '#666' }]}>Invite as{'\n'}Viewer</Text>
            </Pressable>
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}

export default function TeamLayout() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { teams, getEffectiveRules, setTeamRules } = useApp();
  const { user } = useAuth();
  const team = teams.find((t) => t.id === id);
  const isOwner = team?.ownerId === user?.uid;
  const isAdmin = isOwner || (team?.coAdminIds ?? []).includes(user?.uid ?? '');
  const [sharing, setSharing] = useState(false);
  const [shareMenuOpen, setShareMenuOpen] = useState(false);
  const [rulesModalOpen, setRulesModalOpen] = useState(false);

  async function handleShareRole(role: 'editor' | 'member' | 'viewer') {
    if (!team || !user) return;
    setShareMenuOpen(false);
    setSharing(true);
    try {
      const { token } = await createTeamInvite(team.id, team.name, user.uid, role);
      const url = Linking.createURL(`invite/team/${token}`);
      await Share.share({ message: `Join ${team.name} on ScoreBall: ${url}`, url });
    } catch {
      // user cancelled or network error — silently ignore
    } finally {
      setSharing(false);
    }
  }

  const effectiveRules = team ? getEffectiveRules(team.id) : DEFAULT_RULES;

  return (
    <>
      <Tabs
        tabBar={() => null}
        screenOptions={({ navigation }) => ({
          header: () => (
            <TeamHeader
              navigation={navigation}
              teamName={team?.name ?? 'Team'}
              onOpenShare={() => setShareMenuOpen(true)}
              sharing={sharing}
              isOwner={isOwner}
              isAdmin={isAdmin}
              onOpenFormat={() => setRulesModalOpen(true)}
            />
          ),
        })}
      >
        <Tabs.Screen name="index" />
        <Tabs.Screen name="schedule" />
        <Tabs.Screen name="game-plan" />
        <Tabs.Screen name="history" />
        <Tabs.Screen name="scoresheet" options={{ href: null }} />
      </Tabs>

      <ShareModal
        visible={shareMenuOpen}
        onClose={() => setShareMenuOpen(false)}
        onInvite={handleShareRole}
        sharing={sharing}
      />

      {team && (
        <GameRulesModal
          visible={rulesModalOpen}
          rules={effectiveRules}
          title={`${team.name} — Game Format`}
          onSave={(rules) => setTeamRules(team.id, rules)}
          onClose={() => setRulesModalOpen(false)}
        />
      )}
    </>
  );
}

const styles = StyleSheet.create({
  headerOuter: {
    backgroundColor: '#f7f7f5',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e5e4',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 44,
  },
  backBtn: {
    width: 48,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  actionBtn: {
    width: 40,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: 17,
    fontWeight: '700',
    color: '#1a1a1a',
  },
  tabBarOuter: {
    paddingHorizontal: 16,
    paddingBottom: 10,
  },
  segmented: {
    flexDirection: 'row',
    backgroundColor: '#ebebea',
    borderRadius: 10,
    padding: 3,
  },
  segment: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: 8,
  },
  segmentActive: {
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 2,
  },
  segmentText: { fontSize: 12, fontWeight: '500', color: '#888' },
  segmentTextActive: { color: '#1a1a1a', fontWeight: '600' },
  shareOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.3)' },
  shareSheet: {
    backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20,
    paddingHorizontal: 16, paddingBottom: 32, paddingTop: 12,
    maxHeight: '85%',
  },
  shareSheetHandle: {
    width: 36, height: 4, borderRadius: 2, backgroundColor: '#ddd',
    alignSelf: 'center', marginBottom: 16,
  },
  shareSheetTitle: { fontSize: 18, fontWeight: '700', color: '#1a1a1a', marginBottom: 4 },
  shareSheetSub: { fontSize: 13, color: '#888', marginBottom: 16 },
  tableRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 7 },
  tableRowAlt: { backgroundColor: '#fafaf8' },
  tablePermCol: { flex: 1 },
  tablePermLabel: { flex: 1, fontSize: 13, color: '#333' },
  tableRoleHeader: { width: 72, fontSize: 11, fontWeight: '700', textAlign: 'center', lineHeight: 15 },
  tableCheckCell: { width: 72, alignItems: 'center' },
  tableDivider: { height: 1, backgroundColor: '#e5e5e4', marginVertical: 8 },
  inviteRow: { flexDirection: 'row', gap: 8, marginTop: 12 },
  inviteBtn: {
    flex: 1, paddingVertical: 12, borderRadius: 12,
    borderWidth: 1.5, alignItems: 'center',
  },
  inviteBtnText: { fontSize: 13, fontWeight: '700', textAlign: 'center', lineHeight: 18 },
});
