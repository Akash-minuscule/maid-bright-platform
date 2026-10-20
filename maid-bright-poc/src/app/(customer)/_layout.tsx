import { Stack } from 'expo-router';
import { colors } from '../../theme/tokens';
export const unstable_settings = { initialRouteName: '(tabs)' };
export default function CustomerLayout() {
  return (
    <Stack
      screenOptions={{
        headerTintColor: colors.primary,
        headerStyle: { backgroundColor: colors.cream },
        headerTitleStyle: { color: colors.ink, fontSize: 17, fontWeight: '600' },
        headerShadowVisible: false,
        contentStyle: { backgroundColor: colors.cream },
      }}
    >
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="appointment/[id]" options={{ title: 'Your cleaning' }} />
      <Stack.Screen name="change/[id]" options={{ title: 'Manage your visit' }} />
      <Stack.Screen name="invoice/[id]" options={{ title: 'Invoice details' }} />
      <Stack.Screen name="requests" options={{ title: 'Your requests' }} />
      <Stack.Screen name="notifications" options={{ title: 'Notifications' }} />
      <Stack.Screen name="profile-edit" options={{ title: 'Personal details' }} />
      <Stack.Screen name="home-instructions" options={{ title: 'Your home' }} />
      <Stack.Screen name="preferences" options={{ title: 'Communication preferences' }} />
      <Stack.Screen name="demo-controls" options={{ title: 'POC controls' }} />
      <Stack.Screen name="help" options={{ title: 'Help & support' }} />
    </Stack>
  );
}
