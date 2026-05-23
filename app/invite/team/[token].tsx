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
import { acceptTeamInvite, getTeamInviteByToken } from '../../../src/firebase/db';
import { useAuth } from '../../../src/store/AuthContext';
import { TeamInvite } from '../../../src/types';

export default function TeamInviteScreen() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const { user, signInWithGoogle } = useAuth();
  const [invite, setInvite] = useState<TeamInvite | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [accepting, setAccepting] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!token) return;
    getTeamInviteByToken(token).then((inv) => {
      if (!inv) setNotFound(true);
      else setInvite(inv);
      setLoading(false);
    });
  }, [token]);

  async function handleAccept() {
    if (!invite || !user) return;
    if (invite.invitedEmail && user.email?.toLowerCase() !== invite.invitedEmail.toLowerCase()) return;
    setAccepting(true);
    try {
      await acceptTeamInvite(invite.id, user.uid, invite.teamId);
      router.replace('/(app)' as any);
    } catch (e: any) {
      Alert.alert('Error', e?.message ?? 'Failed to accept invite.');
      setAccepting(false);
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

  if (done) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <View style={styles.center}>
          <View style={styles.successIcon}>
            <Ionicons name="checkmark" size={40} color="#fff" />
          </View>
          <Text style={styles.heading}>You're in!</Text>
          <Text style={styles.sub}>
            You joined <Text style={styles.bold}>{invite?.teamName}</Text> as a {invite?.role === 'editor' ? 'co-captain' : invite?.role === 'member' ? 'team member' : 'viewer'}.
          </Text>
          <Pressable
            style={styles.primaryBtn}
            onPress={() => router.replace(`/(app)/team/${invite?.teamId}` as any)}
          >
            <Text style={styles.primaryBtnText}>Go to Team</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const isExpired = invite?.expiresAt?.toDate?.() < new Date();
  const isAlreadyHandled = invite?.status !== 'pending';
  const isWrongEmail = !!user && !!invite?.invitedEmail &&
    user.email?.toLowerCase() !== invite.invitedEmail.toLowerCase();

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.content}>
        <View style={styles.teamIcon}>
          <Ionicons name="baseball-outline" size={36} color="#1a5c2e" />
        </View>

        <Text style={styles.inviteLabel}>You've been invited to join</Text>
        <Text style={styles.teamName}>{invite?.teamName}</Text>
        <Text style={styles.sub}>
          as a {invite?.role === 'editor' ? 'co-captain / editor' : invite?.role === 'member' ? 'team member' : 'viewer (read-only)'}
        </Text>

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

        {user && !isExpired && !isAlreadyHandled && isWrongEmail && (
          <View style={styles.welcomeBox}>
            <Text style={styles.welcomeHeading}>Welcome to ScoreBall! ⚾</Text>
            <Text style={styles.welcomeText}>
              This invite was meant for someone else, but we're glad you're here. You can create your own team or set up a player profile to get started.
            </Text>
            <Pressable style={styles.primaryBtn} onPress={() => router.replace('/(app)' as any)}>
              <Text style={styles.primaryBtnText}>Create a Team</Text>
            </Pressable>
            <Pressable style={styles.ghostBtn} onPress={() => router.replace('/(app)' as any)}>
              <Text style={styles.ghostBtnText}>Set Up a Player Profile</Text>
            </Pressable>
          </View>
        )}

        {user && !isExpired && !isAlreadyHandled && !isWrongEmail && (
          <View style={styles.actions}>
            <Text style={styles.signedInAs}>Signed in as {user.email}</Text>
            <Pressable
              style={[styles.primaryBtn, accepting && styles.disabled]}
              onPress={handleAccept}
              disabled={accepting}
            >
              {accepting
                ? <ActivityIndicator color="#fff" size="small" />
                : <Text style={styles.primaryBtnText}>Accept Invite</Text>}
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

  teamIcon: {
    width: 80,
    height: 80,
    borderRadius: 22,
    backgroundColor: '#edf6f0',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  inviteLabel: { fontSize: 15, color: '#888', fontWeight: '500' },
  teamName: { fontSize: 28, fontWeight: '800', color: '#1a1a1a', textAlign: 'center' },

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
  welcomeBox: { alignItems: 'center', gap: 12, marginTop: 8, width: '100%' },
  welcomeHeading: { fontSize: 18, fontWeight: '800', color: '#1a1a1a', textAlign: 'center' },
  welcomeText: { fontSize: 14, color: '#888', textAlign: 'center', lineHeight: 20 },

  signInBox: { alignItems: 'center', gap: 12, marginTop: 12, width: '100%' },
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
  disabled: { opacity: 0.4 },
});
