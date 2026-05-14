import { Ionicons } from '@expo/vector-icons';
import * as AppleAuthentication from 'expo-apple-authentication';
import { router } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../src/store/AuthContext';

export default function SignInScreen() {
  const { signInWithGoogle, signInWithApple } = useAuth();
  const [socialLoading, setSocialLoading] = useState<'google' | 'apple' | null>(null);
  const [error, setError] = useState('');
  const [appleAvailable, setAppleAvailable] = useState(false);

  useEffect(() => {
    if (Platform.OS === 'web') {
      setAppleAvailable(true);
    } else if (Platform.OS === 'ios') {
      AppleAuthentication.isAvailableAsync().then(setAppleAvailable);
    }
  }, []);

  async function handleGoogle() {
    setError('');
    setSocialLoading('google');
    try {
      await signInWithGoogle();
      router.replace('/(app)');
    } catch (err: any) {
      setError(err.message ?? 'Google sign-in failed.');
    } finally {
      setSocialLoading(null);
    }
  }

  async function handleApple() {
    setError('');
    setSocialLoading('apple');
    try {
      await signInWithApple();
      router.replace('/(app)');
    } catch (err: any) {
      if (err.code !== 'ERR_REQUEST_CANCELED') {
        setError(err.message ?? 'Apple sign-in failed.');
      }
    } finally {
      setSocialLoading(null);
    }
  }

  const isBusy = socialLoading !== null;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.inner}>
        {/* Brand */}
        <View style={styles.brand}>
          <View style={styles.logoMark}>
            <Ionicons name="baseball-outline" size={36} color="#fff" />
          </View>
          <Text style={styles.appName}>ScoreBall</Text>
          <Text style={styles.tagline}>Plan your lineup. Track your team.</Text>
        </View>

        {/* Sign-in options */}
        <View style={styles.buttons}>
          {appleAvailable && (
            Platform.OS === 'web' ? (
              <Pressable
                style={[styles.appleBtn, isBusy && styles.btnDisabled]}
                onPress={handleApple}
                disabled={isBusy}
              >
                {socialLoading === 'apple' ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <>
                    <Ionicons name="logo-apple" size={20} color="#fff" />
                    <Text style={styles.appleBtnText}>Continue with Apple</Text>
                  </>
                )}
              </Pressable>
            ) : (
              <AppleAuthentication.AppleAuthenticationButton
                buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
                buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
                cornerRadius={14}
                style={styles.appleNativeBtn}
                onPress={handleApple}
              />
            )
          )}

          <Pressable
            style={[styles.googleBtn, isBusy && styles.btnDisabled]}
            onPress={handleGoogle}
            disabled={isBusy}
          >
            {socialLoading === 'google' ? (
              <ActivityIndicator color="#333" size="small" />
            ) : (
              <>
                <GoogleIcon />
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

function GoogleIcon() {
  return (
    <View style={styles.gIcon}>
      <Text style={styles.gIconText}>G</Text>
    </View>
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
    width: 80,
    height: 80,
    borderRadius: 22,
    backgroundColor: '#1a5c2e',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#1a5c2e',
    shadowOpacity: 0.35,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 8 },
    elevation: 10,
  },
  appName: { fontSize: 38, fontWeight: '800', color: '#1a1a1a', letterSpacing: -0.5 },
  tagline: { fontSize: 16, color: '#777', textAlign: 'center' },
  buttons: { gap: 12 },
  appleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    height: 54,
    borderRadius: 14,
    backgroundColor: '#000',
  },
  appleBtnText: { color: '#fff', fontWeight: '600', fontSize: 16 },
  appleNativeBtn: { height: 54, borderRadius: 14 },
  googleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    height: 54,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#ddd',
    backgroundColor: '#fff',
  },
  googleBtnText: { color: '#333', fontWeight: '600', fontSize: 16 },
  gIcon: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#4285F4',
    alignItems: 'center',
    justifyContent: 'center',
  },
  gIconText: { color: '#fff', fontWeight: '800', fontSize: 13 },
  btnDisabled: { opacity: 0.5 },
  error: { color: '#c0392b', fontSize: 14, textAlign: 'center' },
  legal: { color: '#bbb', fontSize: 12, textAlign: 'center', lineHeight: 18 },
});
