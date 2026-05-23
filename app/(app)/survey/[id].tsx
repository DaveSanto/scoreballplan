import { Ionicons } from '@expo/vector-icons';
import * as WebBrowser from 'expo-web-browser';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../../../src/firebase/config';
import { useApp } from '../../../src/store/AppContext';

const BASE_URL = 'https://scoreball.santopietro.com/surveys';

const SURVEYS: Record<string, { title: string; description: string; file: string }> = {
  ravenwood_brewers_hat: {
    title: 'Ravenwood Brewers Hat Vote',
    description: 'Pick your favorite lid for the 2026 season.',
    file: 'ravenwood_brewers_hat_survey.html',
  },
};

export default function SurveyScreen() {
  const { id, teamId } = useLocalSearchParams<{ id: string; teamId?: string }>();
  const { getTeamPlayers } = useApp();
  const survey = SURVEYS[id ?? ''];
  const [opening, setOpening] = useState(false);

  const playerNames = teamId ? getTeamPlayers(teamId).map(p => p.name) : [];
  const playersParam = playerNames.length > 0
    ? '?players=' + encodeURIComponent(playerNames.join(','))
    : '';
  const url = survey ? `${BASE_URL}/${survey.file}${playersParam}` : null;

  useEffect(() => {
    if (url) openSurvey();
  }, [url]);

  async function openSurvey() {
    if (!url || opening) return;
    setOpening(true);
    if (playerNames.length > 0 && id) {
      await setDoc(
        doc(db, 'surveys', id, 'rosters', 'players'),
        { players: playerNames, updatedAt: serverTimestamp() }
      ).catch(() => {});
    }
    await WebBrowser.openBrowserAsync(url, {
      presentationStyle: WebBrowser.WebBrowserPresentationStyle.FORM_SHEET,
    });
    setOpening(false);
  }

  if (!survey) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <View style={styles.center}>
          <Ionicons name="alert-circle-outline" size={56} color="#ccc" />
          <Text style={styles.heading}>Survey Not Found</Text>
          <Pressable style={styles.btn} onPress={() => router.canGoBack() ? router.back() : router.replace('/(app)')} >
            <Text style={styles.btnText}>Go Back</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.center}>
        <View style={styles.icon}>
          <Ionicons name="clipboard-outline" size={36} color="#1a5c2e" />
        </View>
        <Text style={styles.heading}>{survey.title}</Text>
        <Text style={styles.sub}>{survey.description}</Text>
        <Pressable
          style={[styles.btn, opening && styles.btnDisabled]}
          onPress={openSurvey}
          disabled={opening}
        >
          <Text style={styles.btnText}>{opening ? 'Opening…' : 'Open Survey'}</Text>
        </Pressable>
        <Pressable onPress={() => router.canGoBack() ? router.back() : router.replace('/(app)')}  style={styles.backLink}>
          <Text style={styles.backLinkText}>← Back</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f7f7f5' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 16 },
  icon: {
    width: 80, height: 80, borderRadius: 22,
    backgroundColor: '#edf6f0', alignItems: 'center', justifyContent: 'center',
    marginBottom: 8,
  },
  heading: { fontSize: 22, fontWeight: '800', color: '#1a1a1a', textAlign: 'center' },
  sub: { fontSize: 15, color: '#888', textAlign: 'center', lineHeight: 22 },
  btn: {
    backgroundColor: '#1a5c2e', borderRadius: 14,
    paddingVertical: 15, paddingHorizontal: 40,
    alignItems: 'center', justifyContent: 'center',
    marginTop: 8,
  },
  btnDisabled: { opacity: 0.5 },
  btnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  backLink: { marginTop: 8 },
  backLinkText: { color: '#1a5c2e', fontSize: 14, fontWeight: '500' },
});
