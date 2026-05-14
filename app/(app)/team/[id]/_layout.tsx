import { Ionicons } from '@expo/vector-icons';
import * as Linking from 'expo-linking';
import { router, Tabs, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, Share, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { createTeamInvite } from '../../../../src/firebase/db';
import { useApp } from '../../../../src/store/AppContext';
import { useAuth } from '../../../../src/store/AuthContext';

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
  onShare,
  sharing,
  isOwner,
}: {
  navigation: any;
  teamName: string;
  onShare: () => void;
  sharing: boolean;
  isOwner: boolean;
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
        {isOwner ? (
          <Pressable onPress={onShare} style={styles.backBtn} disabled={sharing}>
            {sharing
              ? <ActivityIndicator size="small" color="#1a5c2e" />
              : <Ionicons name="share-outline" size={22} color="#1a5c2e" />}
          </Pressable>
        ) : (
          <View style={styles.backBtn} />
        )}
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

export default function TeamLayout() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { teams } = useApp();
  const { user } = useAuth();
  const team = teams.find((t) => t.id === id);
  const isOwner = team?.ownerId === user?.uid;
  const [sharing, setSharing] = useState(false);

  async function doShare(role: 'editor' | 'viewer') {
    if (!team || !user) return;
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

  function handleShare() {
    Alert.alert('Invite Access Level', 'What level of access should this person have?', [
      { text: 'Editor — can manage team', onPress: () => doShare('editor') },
      { text: 'Viewer — can view only', onPress: () => doShare('viewer') },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }

  return (
    <Tabs
      tabBar={() => null}
      screenOptions={({ navigation }) => ({
        header: () => (
          <TeamHeader
            navigation={navigation}
            teamName={team?.name ?? 'Team'}
            onShare={handleShare}
            sharing={sharing}
            isOwner={isOwner}
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
});
