import React, { createContext, useContext, useEffect, useState } from 'react';
import { Platform } from 'react-native';
import {
  User,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  updateProfile,
  GoogleAuthProvider,
  OAuthProvider,
  signInWithCredential,
  signInWithPopup,
} from 'firebase/auth';
import {
  digestStringAsync,
  CryptoDigestAlgorithm,
  CryptoEncoding,
  getRandomBytesAsync,
} from 'expo-crypto';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as WebBrowser from 'expo-web-browser';
import { auth } from '../firebase/config';
import { subscribeToUserProfile, updateUserProfile as dbUpdateUserProfile } from '../firebase/db';
import { UserProfile } from '../types';

WebBrowser.maybeCompleteAuthSession();

type AuthContextValue = {
  user: User | null;
  userProfile: UserProfile;
  loading: boolean;
  signInWithGoogle: () => Promise<void>;
  signInWithApple: () => Promise<void>;
  signOut: () => Promise<void>;
  updateDisplayName: (firstName: string, lastName: string) => Promise<void>;
  updateUserProfile: (data: Partial<UserProfile>) => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser);
      setLoading(false);
    });
    return unsub;
  }, []);

  useEffect(() => {
    if (!user?.uid) { setUserProfile({}); return; }
    return subscribeToUserProfile(user.uid, setUserProfile);
  }, [user?.uid]);

  async function signInWithGoogle() {
    if (Platform.OS === 'web') {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
      return;
    }

    const iosClientId = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID;
    if (!iosClientId) throw new Error('EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID is not set');

    const redirectUri = `${iosClientId.split('.').reverse().join('.')}:/`;

    const randomBytes = await getRandomBytesAsync(32);
    const codeVerifier = btoa(String.fromCharCode(...Array.from(randomBytes)))
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
    const rawChallenge = await digestStringAsync(
      CryptoDigestAlgorithm.SHA256,
      codeVerifier,
      { encoding: CryptoEncoding.BASE64 }
    );
    const codeChallenge = rawChallenge.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');

    const authUrl =
      `https://accounts.google.com/o/oauth2/v2/auth?` +
      `client_id=${encodeURIComponent(iosClientId)}` +
      `&redirect_uri=${encodeURIComponent(redirectUri)}` +
      `&response_type=code` +
      `&scope=${encodeURIComponent('openid profile email')}` +
      `&code_challenge=${codeChallenge}` +
      `&code_challenge_method=S256`;

    const result = await WebBrowser.openAuthSessionAsync(authUrl, redirectUri);
    if (result.type !== 'success') return;

    const urlParams = new URLSearchParams(new URL(result.url).search);
    const code = urlParams.get('code');
    if (!code) return;

    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: iosClientId,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
        code,
        code_verifier: codeVerifier,
      }).toString(),
    });
    const tokens = await tokenRes.json();
    if (!tokens.id_token) throw new Error('Google sign-in failed: no id_token');

    const credential = GoogleAuthProvider.credential(tokens.id_token);
    await signInWithCredential(auth, credential);
  }

  async function signInWithApple() {
    if (Platform.OS === 'web') {
      const provider = new OAuthProvider('apple.com');
      provider.addScope('name');
      provider.addScope('email');
      await signInWithPopup(auth, provider);
      return;
    }

    const rawNonce =
      Math.random().toString(36).substring(2, 18) +
      Math.random().toString(36).substring(2, 18);
    const hashedNonce = await digestStringAsync(CryptoDigestAlgorithm.SHA256, rawNonce);

    const appleCredential = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
      nonce: hashedNonce,
    });

    const { identityToken } = appleCredential;
    if (!identityToken) throw new Error('Apple sign-in failed: no identity token');

    const provider = new OAuthProvider('apple.com');
    const credential = provider.credential({ idToken: identityToken, rawNonce });
    await signInWithCredential(auth, credential);
  }

  async function signOut() {
    await firebaseSignOut(auth);
  }

  async function updateUserProfile(data: Partial<UserProfile>) {
    if (!auth.currentUser) return;
    await dbUpdateUserProfile(auth.currentUser.uid, data);
  }

  async function updateDisplayName(firstName: string, lastName: string) {
    if (!auth.currentUser) return;
    const displayName = [firstName.trim(), lastName.trim()].filter(Boolean).join(' ');
    await updateProfile(auth.currentUser, { displayName });
    // updateProfile mutates the user object but doesn't re-trigger onAuthStateChanged,
    // so force a state refresh by spreading the updated user.
    setUser({ ...auth.currentUser });
  }

  return (
    <AuthContext.Provider value={{ user, userProfile, loading, signInWithGoogle, signInWithApple, signOut, updateDisplayName, updateUserProfile }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
