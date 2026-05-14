import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../src/store/AuthContext';
import { getInviteByToken, acceptInvite, declineInvite } from '../../src/firebase/db';
import { LeagueInvite } from '../../src/types';

export default function InviteScreen() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const { user, signInWithGoogle } = useAuth();
  const [invite, setInvite] = useState<LeagueInvite | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [responding, setResponding] = useState(false);
  const [done, setDone] = useState<'accepted' | 'declined' | null>(null);

  useEffect(() => {
    if (!token) return;
    getInviteByToken(token).then((inv) => {
      if (!inv) setNotFound(true);
      else setInvite(inv);
      setLoading(false);
    });
  }, [token]);

  async function handleAccept() {
    if (!invite || !user) return;
    setResponding(true);
    try {
      await acceptInvite(invite.id, user.uid, invite.teamId);
      setDone('accepted');
    } catch (e: any) {
      Alert.alert('Error', e?.message ?? 'Failed to accept invite.');
    } finally {
      setResponding(false);
    }
  }

  async function handleDecline() {
    if (!invite) return;
    setResponding(true);
    try {
      await declineInvite(invite.id);
      setDone('declined');
    } catch (e: any) {
      Alert.alert('Error', e?.message ?? 'Failed to decline invite.');
    } finally {
      setResponding(false);
    }
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#1a5c2e" />
      </View>
    );
  }

  if (notFound) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <View style={styles.center}>
          <Ionicons name="alert-circle-outline" size={56} color="#ccc" />
          <Text style={styles.heading}>Invite Not Found</Text>
          <Text style={styles.sub}>This link may have expired or already been used.</Text>
          <Pressable style={styles.primaryBtn} onPress={() => router.replace('/')}>
            <Text style={styles.primaryBtnText}>Go to ScoreBall</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  if (done === 'accepted') {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <View style={styles.center}>
          <View style={styles.successIcon}>
            <Ionicons name="checkmark" size={40} color="#fff" />
          </View>
          <Text style={styles.heading}>You're in!</Text>
          <Text style={styles.sub}>
            You've joined <Text style={styles.bold}>{invite?.leagueName}</Text>
            {invite?.teamName ? ` as captain of ${invite.teamName}` : ''}.
          </Text>
          <Pressable style={styles.primaryBtn} onPress={() => router.replace('/')}>
            <Text style={styles.primaryBtnText}>Go to Dashboard</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  if (done === 'declined') {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <View style={styles.center}>
          <Ionicons name="close-circle-outline" size={56} color="#ccc" />
          <Text style={styles.heading}>Invite Declined</Text>
          <Text style={styles.sub}>You've declined the invite to {invite?.leagueName}.</Text>
          <Pressable style={styles.primaryBtn} onPress={() => router.replace('/')}>
            <Text style={styles.primaryBtnText}>Go to ScoreBall</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const isExpired = invite?.expiresAt?.toDate?.() < new Date();
  const isAlreadyHandled = invite?.status !== 'pending';

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.content}>
        {/* League icon */}
        <View style={styles.leagueIcon}>
          <Ionicons name="trophy-outline" size={36} color="#1a5c2e" />
        </View>

        <Text style={styles.inviteLabel}>You've been invited to join</Text>
        <Text style={styles.leagueName}>{invite?.leagueName}</Text>

        {invite?.teamName && (
          <View style={styles.teamBadge}>
            <Text style={styles.teamBadgeText}>as captain of {invite.teamName}</Text>
          </View>
        )}

        {(isExpired || isAlreadyHandled) && (
          <View style={styles.warningBox}>
            <Text style={styles.warningText}>
              {isExpired ? 'This invite has expired.' : `This invite was already ${invite?.status}.`}
            </Text>
          </View>
        )}

        {!user && !isExpired && !isAlreadyHandled && (
          <View style={styles.signInBox}>
            <Text style={styles.signInText}>Sign in to accept this invite.</Text>
            <Pressable style={styles.primaryBtn} onPress={signInWithGoogle}>
              <Ionicons name="logo-google" size={18} color="#fff" />
              <Text style={styles.primaryBtnText}>Sign in with Google</Text>
            </Pressable>
          </View>
        )}

        {user && !isExpired && !isAlreadyHandled && (
          <View style={styles.actions}>
            <Text style={styles.signedInAs}>Signed in as {user.email}</Text>
            <Pressable
              style={[styles.primaryBtn, responding && styles.disabled]}
              onPress={handleAccept}
              disabled={responding}
            >
              {responding
                ? <ActivityIndicator color="#fff" size="small" />
                : <Text style={styles.primaryBtnText}>Accept Invite</Text>}
            </Pressable>
            <Pressable
              style={[styles.ghostBtn, responding && styles.disabled]}
              onPress={handleDecline}
              disabled={responding}
            >
              <Text style={styles.ghostBtnText}>Decline</Text>
            </Pressable>
          </View>
        )}

        {(isExpired || isAlreadyHandled) && (
          <Pressable style={[styles.primaryBtn, { marginTop: 24 }]} onPress={() => router.replace('/')}>
            <Text style={styles.primaryBtnText}>Go to ScoreBall</Text>
          </Pressable>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f7f7f5' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 16 },
  content: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 12 },

  leagueIcon: {
    width: 80,
    height: 80,
    borderRadius: 22,
    backgroundColor: '#edf6f0',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  inviteLabel: { fontSize: 15, color: '#888', fontWeight: '500' },
  leagueName: { fontSize: 28, fontWeight: '800', color: '#1a1a1a', textAlign: 'center' },
  teamBadge: { backgroundColor: '#edf6f0', borderRadius: 10, paddingVertical: 8, paddingHorizontal: 16, marginTop: 4 },
  teamBadgeText: { fontSize: 14, color: '#1a5c2e', fontWeight: '600' },

  heading: { fontSize: 22, fontWeight: '800', color: '#1a1a1a', textAlign: 'center' },
  sub: { fontSize: 15, color: '#888', textAlign: 'center', lineHeight: 22 },
  bold: { fontWeight: '700', color: '#1a1a1a' },

  successIcon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#1a5c2e',
    alignItems: 'center',
    justifyContent: 'center',
  },

  warningBox: { backgroundColor: '#fff8f0', borderRadius: 10, padding: 14, marginTop: 8 },
  warningText: { fontSize: 14, color: '#e67e22', textAlign: 'center', fontWeight: '500' },

  signInBox: { alignItems: 'center', gap: 12, marginTop: 12 },
  signInText: { fontSize: 14, color: '#888', textAlign: 'center' },
  signedInAs: { fontSize: 13, color: '#aaa', textAlign: 'center' },

  actions: { width: '100%', gap: 10, marginTop: 16 },

  primaryBtn: {
    backgroundColor: '#1a5c2e',
    borderRadius: 14,
    paddingVertical: 15,
    paddingHorizontal: 24,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    width: '100%',
  },
  primaryBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  ghostBtn: {
    borderWidth: 1.5,
    borderColor: '#ddd',
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ghostBtnText: { color: '#888', fontWeight: '600', fontSize: 15 },
  disabled: { opacity: 0.4 },
});
