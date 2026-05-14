import { Redirect, Stack } from 'expo-router';
import { useAuth } from '../../src/store/AuthContext';
import { AppProvider } from '../../src/store/AppContext';

export default function AppLayout() {
  const { user, loading } = useAuth();

  if (!loading && !user) {
    return <Redirect href="/(auth)/sign-in" />;
  }

  return (
    <AppProvider userId={user?.uid ?? ''}>
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: '#f7f7f5' },
          headerShadowVisible: false,
          headerBackTitle: '',
          headerTintColor: '#1a5c2e',
          headerTitleStyle: { fontWeight: '700', fontSize: 18, color: '#1a1a1a' },
          contentStyle: { backgroundColor: '#f7f7f5' },
        }}
      >
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="team/[id]" options={{ headerShown: false }} />
        <Stack.Screen name="league/[id]" options={{ title: 'League' }} />
        <Stack.Screen name="scorecard/[id]" options={{ headerShown: false }} />
      </Stack>
    </AppProvider>
  );
}
