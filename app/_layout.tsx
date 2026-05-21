import { Ionicons } from '@expo/vector-icons';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as WebBrowser from 'expo-web-browser';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { AuthProvider } from '../src/store/AuthContext';

WebBrowser.maybeCompleteAuthSession();

export default function RootLayout() {
  useFonts({ ...Ionicons.font });

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <AuthProvider>
        <StatusBar style="dark" />
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="index" />
          <Stack.Screen name="(auth)" />
          <Stack.Screen name="(app)" />
          <Stack.Screen name="invite/[token]" />
        </Stack>
      </AuthProvider>
    </GestureHandlerRootView>
  );
}
