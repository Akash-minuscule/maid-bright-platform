import { useNavigation } from 'expo-router';
const screens = {
  '/appointments': 'appointments',
  '/payments': 'payments',
  '/messages': 'messages',
  '/profile': 'profile',
  '/': 'index',
} as const;
/** Pop to the customer's existing tab shell, targeting its stack explicitly. */
export function useOpenTab() {
  const navigation = useNavigation('/(customer)');
  return (path: keyof typeof screens) => {
    const target = navigation.getState()?.key;
    if (!target) return;
    navigation.dispatch({
      type: 'POP_TO',
      target,
      payload: { name: '(tabs)', params: { screen: screens[path] } },
    });
  };
}
