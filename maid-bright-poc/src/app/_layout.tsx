import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { AppProvider, useApp } from '../store/AppProvider';
import { colors } from '../theme/tokens';
function Routes() {
  const { data } = useApp();
  return (
    <>
      <StatusBar style="dark" />
      <Stack
        screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.cream } }}
      >
        <Stack.Protected guard={!data}>
          <Stack.Screen name="welcome" />
          <Stack.Screen name="login" />
          <Stack.Screen name="signup" />
          <Stack.Screen name="activate" />
          <Stack.Screen name="register" />
        </Stack.Protected>
        <Stack.Protected guard={!!data}>
          <Stack.Screen name="(customer)" />
        </Stack.Protected>
      </Stack>
    </>
  );
}
export default function RootLayout() {
  return (
    <AppProvider>
      <Routes />
    </AppProvider>
  );
}
