import { Redirect, Stack } from 'expo-router';
import { useAuth } from '../../src/store/AuthContext';

export default function AuthLayout() {
  const { user, loading } = useAuth();

  if (!loading && user) {
    return <Redirect href="/(app)" />;
  }

  return <Stack screenOptions={{ headerShown: false }} />;
}
