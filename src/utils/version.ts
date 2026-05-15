import Constants from 'expo-constants';

export function appVersion(): string {
  const config = Constants.expoConfig;
  const raw = config?.version ?? '1.0.0';

  // Show major.minor only — patch is internal
  const [major, minor] = raw.split('.');
  const v = `${major}.${minor ?? '0'}`;

  // extra.buildRevision is available on all platforms (ios/android/web)
  const revision = config?.extra?.buildRevision;

  return revision != null ? `v${v} r${revision}` : `v${v}`;
}
