import { Ionicons } from '@expo/vector-icons';
import * as WebBrowser from 'expo-web-browser';
import { useGlobalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useApp } from '../../../../src/store/AppContext';

const BASE_URL = 'https://scoreball.santopietro.com/surveys';

const SURVEYS = [
  {
    id: 'ravenwood_brewers_hat',
    title: 'Ravenwood Brewers Hat Vote',
    description: 'Pick your favorite lid for the 2026 season.',
    file: 'ravenwood_brewers_hat_survey.html',
  },
];

export default function PollsScreen() {
  const { id: teamId } = useGlobalSearchParams<{ id: string }>();
  const { getTeamPlayers } = useApp();
  const [opening, setOpening] = useState<string | null>(null);

  const playerNames = teamId ? getTeamPlayers(teamId).map(p => p.name) : [];
  const playersParam = playerNames.length > 0
    ? '?players=' + encodeURIComponent(playerNames.join(','))
    : '';

  async function openSurvey(surveyId: string, file: string) {
    const url = `${BASE_URL}/${file}${playersParam}`;
    setOpening(surveyId);
    if (Platform.OS === 'web') {
      window.open(url, '_blank');
      setOpening(null);
    } else {
      await WebBrowser.openBrowserAsync(url, {
        presentationStyle: WebBrowser.WebBrowserPresentationStyle.FORM_SHEET,
      });
      setOpening(null);
    }
  }

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <View style={styles.list}>
        {SURVEYS.map((survey) => (
          <Pressable
            key={survey.id}
            style={[styles.card, opening === survey.id && styles.cardDisabled]}
            onPress={() => openSurvey(survey.id, survey.file)}
            disabled={opening === survey.id}
          >
            <View style={styles.cardIcon}>
              <Ionicons name="clipboard-outline" size={28} color="#1a5c2e" />
            </View>
            <View style={styles.cardBody}>
              <Text style={styles.cardTitle}>{survey.title}</Text>
              <Text style={styles.cardSub}>{survey.description}</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color="#ccc" />
          </Pressable>
        ))}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f7f7f5' },
  list: { padding: 16, gap: 12 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 16,
    gap: 14,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  cardDisabled: { opacity: 0.5 },
  cardIcon: {
    width: 52,
    height: 52,
    borderRadius: 14,
    backgroundColor: '#edf6f0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardBody: { flex: 1 },
  cardTitle: { fontSize: 15, fontWeight: '700', color: '#1a1a1a' },
  cardSub: { fontSize: 13, color: '#888', marginTop: 2 },
});
