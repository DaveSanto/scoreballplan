import Constants from 'expo-constants';
import { Platform } from 'react-native';

export function appVersion(): string {
  const config = Constants.expoConfig;
  const raw = config?.version ?? '1.0.0';

  // Show major.minor only — patch is internal
  const [major, minor] = raw.split('.');
  const v = `${major}.${minor ?? '0'}`;

  // Use platform-specific build number; fall back to iOS buildNumber on web
  const revision =
    Platform.OS === 'android'
      ? config?.android?.versionCode
      : config?.ios?.buildNumber;

  return revision != null ? `v${v} r${revision}` : `v${v}`;
}
