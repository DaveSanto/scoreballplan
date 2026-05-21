import { Ionicons } from '@expo/vector-icons';
import { router, useGlobalSearchParams } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { subscribeToTeamGames, subscribeToTeamScorecards } from '../../../../src/firebase/db';
import { useApp } from '../../../../src/store/AppContext';
import { Scorecard, TeamGame } from '../../../../src/types';

function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00');
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
}

export default function HistoryScreen() {
  const { id: teamId } = useGlobalSearchParams<{ id: string }>();
  const { teams, getTeamPlayers } = useApp();
  const team = teams.find((t) => t.id === teamId);

  const [games, setGames] = useState<TeamGame[]>([]);
  const [scorecards, setScorecards] = useState<Scorecard[]>([]);
  const [gamesLoaded, setGamesLoaded] = useState(false);
  const [scorecardsLoaded, setScorecardsLoaded] = useState(false);

  useEffect(() => {
    if (!teamId) return;
    const unsub1 = subscribeToTeamGames(teamId, (g) => {
      setGames(g);
      setGamesLoaded(true);
    });
    const unsub2 = subscribeToTeamScorecards(teamId, (sc) => {
      setScorecards(sc);
      setScorecardsLoaded(true);
    });
    return () => { unsub1(); unsub2(); };
  }, [teamId]);

  if (!team || !gamesLoaded || !scorecardsLoaded) {
    return <View style={styles.loader}><ActivityIndicator color="#1a5c2e" /></View>;
  }

  const teamPlayers = getTeamPlayers(teamId);
  const playerById = new Map(teamPlayers.map((p) => [p.id, p]));
  const today = todayISO();

  const pastGames = games
    .filter((g) => g.date < today)
    .sort((a, b) => b.date.localeCompare(a.date));

  const scorecardByGameId = new Map<string, Scorecard>();
  for (const sc of scorecards) {
    if (sc.gameId) scorecardByGameId.set(sc.gameId, sc);
  }

  if (pastGames.length === 0) {
    return (
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <View style={styles.empty}>
          <Ionicons name="time-outline" size={48} color="#ccc" />
          <Text style={styles.emptyText}>No past games yet.</Text>
          <Text style={styles.emptyHint}>Completed games will appear here once their dates have passed.</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.list}>
        {pastGames.map((game) => {
          const scorecard = scorecardByGameId.get(game.id);
          const absentNames = (game.absentPlayerIds ?? [])
            .map((id) => playerById.get(id)?.name)
            .filter(Boolean) as string[];

          return (
            <View key={game.id} style={styles.card}>
              {/* ── Header ── */}
              <View style={styles.cardHeader}>
                <View style={styles.cardHeaderLeft}>
                  <Text style={styles.cardDate}>{formatDate(game.date)}</Text>
                  <Text style={styles.cardMatchup}>
                    {game.isHome === true
                      ? `${team.name} vs. ${game.opponent}`
                      : game.isHome === false
                      ? `${team.name} @ ${game.opponent}`
                      : `${team.name} vs. ${game.opponent} (TBD)`}
                  </Text>
                  {game.location ? (
                    <Text style={styles.cardLocation}>{game.location}</Text>
                  ) : null}
                </View>
                {scorecard ? (
                  <Pressable
                    style={styles.scoresheetBtn}
                    onPress={() => router.push(`/(app)/scorecard/${scorecard.id}`)}
                  >
                    <Ionicons name="document-text-outline" size={13} color="#1a5c2e" />
                    <Text style={styles.scoresheetBtnText}>Scoresheet</Text>
                    <Ionicons name="chevron-forward" size={12} color="#1a5c2e" />
                  </Pressable>
                ) : null}
              </View>

              <View style={styles.divider} />

              {/* ── Batting order ── */}
              {scorecard ? (
                <>
                  <Text style={styles.sectionLabel}>Batting Order</Text>
                  {scorecard.battingOrder.map((batter, i) => (
                    <View key={i} style={styles.batterRow}>
                      <Text style={styles.batterSlot}>{i + 1}</Text>
                      <View style={styles.batterBadge}>
                        <Text style={styles.batterBadgeNum}>#{batter.number || '—'}</Text>
                      </View>
                      <Text style={styles.batterName}>{batter.name}</Text>
                    </View>
                  ))}
                </>
              ) : (
                <Text style={styles.noScoresheet}>No scoresheet was recorded for this game.</Text>
              )}

              {/* ── Scratches ── */}
              {absentNames.length > 0 ? (
                <>
                  <Text style={[styles.sectionLabel, { marginTop: 14 }]}>Sitting Out</Text>
                  <View style={styles.absentList}>
                    {absentNames.map((name) => (
                      <View key={name} style={styles.absentChip}>
                        <Text style={styles.absentChipText}>{name}</Text>
                      </View>
                    ))}
                  </View>
                </>
              ) : null}
            </View>
          );
        })}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f7f7f5' },
  loader: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  list: { padding: 16, gap: 14 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8, padding: 40 },
  emptyText: { color: '#999', fontSize: 16, fontWeight: '600' },
  emptyHint: { color: '#bbb', fontSize: 13, textAlign: 'center' },

  card: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 16,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  cardHeaderLeft: { flex: 1 },
  cardDate: {
    fontSize: 11, fontWeight: '700', color: '#888',
    textTransform: 'uppercase', letterSpacing: 0.5,
  },
  cardMatchup: { fontSize: 15, fontWeight: '700', color: '#1a1a1a', marginTop: 3 },
  cardLocation: { fontSize: 12, color: '#aaa', marginTop: 2 },

  scoresheetBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    borderWidth: 1.5, borderColor: '#1a5c2e', borderRadius: 8,
    paddingVertical: 5, paddingHorizontal: 8,
  },
  scoresheetBtnText: { fontSize: 12, fontWeight: '600', color: '#1a5c2e' },

  divider: { height: 1, backgroundColor: '#f0f0ef', marginVertical: 12 },

  sectionLabel: {
    fontSize: 11, fontWeight: '700', color: '#aaa',
    textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8,
  },

  batterRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 3 },
  batterSlot: { width: 18, fontSize: 13, fontWeight: '700', color: '#1a5c2e', textAlign: 'center' },
  batterBadge: {
    width: 30, height: 30, borderRadius: 15,
    backgroundColor: '#1a5c2e', alignItems: 'center', justifyContent: 'center',
  },
  batterBadgeNum: { color: '#fff', fontWeight: '700', fontSize: 10 },
  batterName: { fontSize: 14, fontWeight: '500', color: '#1a1a1a' },

  noScoresheet: { fontSize: 13, color: '#bbb', fontStyle: 'italic' },

  absentList: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  absentChip: {
    backgroundColor: '#fef9f0', borderRadius: 8,
    paddingVertical: 4, paddingHorizontal: 10,
    borderWidth: 1, borderColor: '#f5cba7',
  },
  absentChipText: { fontSize: 12, color: '#e67e22' },
});
