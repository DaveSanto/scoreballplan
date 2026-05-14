import { Redirect } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';
import { useAuth } from '../src/store/AuthContext';

export default function Index() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f7f7f5' }}>
        <ActivityIndicator size="large" color="#1a5c2e" />
      </View>
    );
  }

  return <Redirect href={user ? '/(app)' : '/(auth)/sign-in'} />;
}
