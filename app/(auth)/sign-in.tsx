import React, { useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../src/store/AuthContext';

export default function SignInScreen() {
  const { signInWithGoogle } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleGoogle() {
    setError('');
    setLoading(true);
    try {
      await signInWithGoogle();
    } catch (err: any) {
      setError(err.message ?? 'Google sign-in failed.');
    } finally {
      setLoading(false);
    }
  }

  const isBusy = loading;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.inner}>
        {/* Brand */}
        <View style={styles.brand}>
          <Image
            source={require('../../assets/icon.png')}
            style={styles.logoMark}
          />
          <Text style={styles.appName}>ScoreBall</Text>
          <Text style={styles.tagline}>Plan your lineup. Track your team.</Text>
        </View>

        {/* Sign-in options */}
        <View style={styles.buttons}>
          <Pressable
            style={[styles.googleBtn, isBusy && styles.btnDisabled]}
            onPress={handleGoogle}
            disabled={isBusy}
          >
            {loading ? (
              <ActivityIndicator color="#333" size="small" />
            ) : (
              <>
                <GoogleLogo />
                <Text style={styles.googleBtnText}>Continue with Google</Text>
              </>
            )}
          </Pressable>

          {error ? <Text style={styles.error}>{error}</Text> : null}
        </View>

        <Text style={styles.legal}>
          By continuing you agree to the Terms of Service and Privacy Policy.
        </Text>
      </View>
    </SafeAreaView>
  );
}

function GoogleLogo() {
  // @ts-ignore — svg is valid HTML on web
  return (
    <svg width="20" height="20" viewBox="0 0 48 48" style={{ display: 'block', flexShrink: 0 }}>
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.18 1.48-4.95 2.35-8.16 2.35-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
    </svg>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f7f7f5' },
  inner: {
    flex: 1,
    justifyContent: 'space-between',
    paddingHorizontal: 28,
    paddingTop: 60,
    paddingBottom: 32,
  },
  brand: { alignItems: 'center', gap: 12 },
  logoMark: {
    width: 72,
    height: 72,
    borderRadius: 18,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  appName: { fontSize: 38, fontWeight: '800', color: '#1a1a1a', letterSpacing: -0.5 },
  tagline: { fontSize: 16, color: '#777', textAlign: 'center' },
  buttons: { gap: 12 },
  googleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
    gap: 10,
    height: 40,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#747775',
    backgroundColor: '#fff',
  },
  googleBtnText: { color: '#1F1F1F', fontWeight: '500', fontSize: 14, fontFamily: 'Roboto, sans-serif' },
  btnDisabled: { opacity: 0.5 },
  error: { color: '#c0392b', fontSize: 14, textAlign: 'center' },
  legal: { color: '#bbb', fontSize: 12, textAlign: 'center', lineHeight: 18 },
});
