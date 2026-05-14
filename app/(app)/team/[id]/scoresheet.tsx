import { Ionicons } from '@expo/vector-icons';
import { router, useGlobalSearchParams } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
  Alert,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../../../src/store/AuthContext';
import { useApp } from '../../../../src/store/AppContext';
import { Scorecard } from '../../../../src/types';
import {
  createScorecard,
  deleteScorecard,
  subscribeToTeamScorecards,
} from '../../../../src/firebase/db';

export default function ScoresheetScreen() {
  const { id: teamId } = useGlobalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const { teams, getTeamPlayers } = useApp();
  const team = teams.find((t) => t.id === teamId);

  const [scorecards, setScorecards] = useState<Scorecard[]>([]);
  const [newGameOpen, setNewGameOpen] = useState(false);
  const [creating, setCreating] = useState(false);

  // New game form state
  const [opponent, setOpponent] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [isHome, setIsHome] = useState(true);
  const [maxInnings, setMaxInnings] = useState(6);

  useEffect(() => {
    if (!teamId) return;
    return subscribeToTeamScorecards(teamId, setScorecards);
  }, [teamId]);

  async function handleCreate() {
    if (!team || !user) return;
    if (!opponent.trim()) { Alert.alert('Enter the opponent name'); return; }
    setCreating(true);
    try {
      const teamPlayers = getTeamPlayers(teamId);
      const battingOrder = team.battingOrder
        .map((pid) => teamPlayers.find((p) => p.id === pid))
        .filter(Boolean)
        .map((p) => ({ id: p!.id, name: p!.name, number: p!.number }));

      const id = await createScorecard(user.uid, {
        teamId,
        opponent: opponent.trim(),
        date,
        isHome,
        maxInnings,
        battingOrder: battingOrder.length > 0
          ? battingOrder
          : [{ name: 'Batter 1', number: '1' }],
      });
      setNewGameOpen(false);
      setOpponent('');
      router.push(`/(app)/scorecard/${id}`);
    } finally {
      setCreating(false);
    }
  }

  function handleDelete(sc: Scorecard) {
    Alert.alert(
      'Delete Scorecard',
      `Delete the scorecard vs ${sc.opponent}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => deleteScorecard(sc.id) },
      ]
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      {scorecards.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="baseball-outline" size={52} color="#ccc" />
          <Text style={styles.emptyTitle}>No scorecards yet</Text>
          <Text style={styles.emptyText}>Start a game to score it using the Reisner method.</Text>
          <Pressable style={styles.emptyBtn} onPress={() => setNewGameOpen(true)}>
            <Ionicons name="add" size={18} color="#fff" />
            <Text style={styles.emptyBtnText}>New Game</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={scorecards}
          keyExtractor={(sc) => sc.id}
          contentContainerStyle={styles.list}
          ListHeaderComponent={
            <Pressable style={styles.newBtn} onPress={() => setNewGameOpen(true)}>
              <Ionicons name="add-circle-outline" size={18} color="#1a5c2e" />
              <Text style={styles.newBtnText}>New Game</Text>
            </Pressable>
          }
          renderItem={({ item: sc }) => {
            const totalRuns = sc.innings.reduce((s, inn) => s + (inn?.runs ?? 0), 0);
            const label = sc.isHome ? `vs ${sc.opponent}` : `@ ${sc.opponent}`;
            return (
              <Pressable
                style={styles.card}
                onPress={() => router.push(`/(app)/scorecard/${sc.id}`)}
                onLongPress={() => handleDelete(sc)}
              >
                <View style={styles.cardLeft}>
                  <Text style={styles.cardLabel}>{label}</Text>
                  <Text style={styles.cardDate}>{sc.date} · {sc.maxInnings} inn</Text>
                </View>
                <View style={styles.cardRight}>
                  <Text style={styles.cardRuns}>{totalRuns}</Text>
                  <Text style={styles.cardRunsLabel}>R</Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color="#ccc" />
              </Pressable>
            );
          }}
        />
      )}

      {/* New Game Modal */}
      <Modal
        visible={newGameOpen}
        animationType="slide"
        transparent
        onRequestClose={() => setNewGameOpen(false)}
      >
        <Pressable style={styles.backdrop} onPress={() => setNewGameOpen(false)} />
        <View style={styles.sheet}>
          <View style={styles.sheetHandle} />
          <Text style={styles.sheetTitle}>New Scorecard</Text>

          <Text style={styles.fieldLabel}>Opponent</Text>
          <TextInput
            style={styles.input}
            placeholder="Team name"
            value={opponent}
            onChangeText={setOpponent}
            autoFocus
            returnKeyType="done"
          />

          <Text style={styles.fieldLabel}>Date</Text>
          <TextInput
            style={styles.input}
            placeholder="YYYY-MM-DD"
            value={date}
            onChangeText={setDate}
          />

          <View style={styles.row}>
            <View style={styles.rowItem}>
              <Text style={styles.fieldLabel}>Home game?</Text>
              <Switch
                value={isHome}
                onValueChange={setIsHome}
                trackColor={{ true: '#1a5c2e' }}
              />
            </View>
            <View style={styles.rowItem}>
              <Text style={styles.fieldLabel}>Innings</Text>
              <View style={styles.inningPicker}>
                {[4, 5, 6, 7, 9].map((n) => (
                  <Pressable
                    key={n}
                    style={[styles.inningChip, maxInnings === n && styles.inningChipActive]}
                    onPress={() => setMaxInnings(n)}
                  >
                    <Text style={[styles.inningChipText, maxInnings === n && styles.inningChipTextActive]}>
                      {n}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>
          </View>

          <Pressable
            style={[styles.createBtn, creating && { opacity: 0.6 }]}
            onPress={handleCreate}
            disabled={creating}
          >
            <Text style={styles.createBtnText}>Start Scoring</Text>
          </Pressable>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f7f7f5' },
  list: { padding: 16, gap: 10 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 40 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: '#1a1a1a' },
  emptyText: { fontSize: 14, color: '#aaa', textAlign: 'center' },
  emptyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#1a5c2e',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 12,
    marginTop: 8,
  },
  emptyBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  newBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-end',
    borderWidth: 1.5,
    borderColor: '#1a5c2e',
    borderRadius: 10,
    paddingVertical: 7,
    paddingHorizontal: 14,
    marginBottom: 4,
  },
  newBtnText: { color: '#1a5c2e', fontWeight: '600', fontSize: 13 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
    gap: 12,
  },
  cardLeft: { flex: 1 },
  cardLabel: { fontSize: 15, fontWeight: '600', color: '#1a1a1a' },
  cardDate: { fontSize: 12, color: '#aaa', marginTop: 2 },
  cardRight: { alignItems: 'center' },
  cardRuns: { fontSize: 20, fontWeight: '800', color: '#1a5c2e' },
  cardRunsLabel: { fontSize: 10, color: '#aaa', fontWeight: '600' },
  // Sheet
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.3)' },
  sheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 24,
    paddingBottom: 40,
    gap: 10,
  },
  sheetHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#ddd',
    alignSelf: 'center',
    marginBottom: 8,
  },
  sheetTitle: { fontSize: 18, fontWeight: '700', color: '#1a1a1a', marginBottom: 4 },
  fieldLabel: { fontSize: 12, fontWeight: '600', color: '#888', textTransform: 'uppercase', letterSpacing: 0.4 },
  input: {
    borderWidth: 1.5,
    borderColor: '#e0e0de',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
    color: '#1a1a1a',
    backgroundColor: '#fafaf8',
  },
  row: { flexDirection: 'row', gap: 20, alignItems: 'flex-start', marginTop: 4 },
  rowItem: { flex: 1, gap: 6 },
  inningPicker: { flexDirection: 'row', gap: 6 },
  inningChip: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#f0f0ef',
    alignItems: 'center',
    justifyContent: 'center',
  },
  inningChipActive: { backgroundColor: '#1a5c2e' },
  inningChipText: { fontSize: 13, fontWeight: '600', color: '#555' },
  inningChipTextActive: { color: '#fff' },
  createBtn: {
    backgroundColor: '#1a5c2e',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 8,
  },
  createBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
});
