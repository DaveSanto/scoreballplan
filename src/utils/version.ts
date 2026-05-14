import Constants from 'expo-constants';
import { Platform } from 'react-native';

export function appVersion(): string {
  const config = Constants.expoConfig;
  const raw = config?.version ?? '1.0.0';

  // Show major.minor only — patch is internal
  const [major, minor] = raw.split('.');
  const v = `${major}.${minor ?? '0'}`;

  let revision: string | number | null = null;
  if (Platform.OS === 'ios') {
    revision = config?.ios?.buildNumber ?? null;
  } else if (Platform.OS === 'android') {
    revision = config?.android?.versionCode ?? null;
  }

  return revision != null ? `v${v} r${revision}` : `v${v}`;
}
