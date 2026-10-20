import { Tabs, router } from 'expo-router';
import { Pressable, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon, IconName } from '../../../components/ui';
import { colors } from '../../../theme/tokens';
import { useCustomer } from '../../../store/AppProvider';
import { useResponsive } from '../../../hooks/useResponsive';
export default function TabLayout() {
  const { data } = useCustomer();
  const insets = useSafeAreaInsets();
  const { isMobile, isDesktop } = useResponsive();
  const unread = data.notifications.filter((n) => !n.read).length;
  const tabs: { name: string; title: string; icon: IconName }[] = [
    { name: 'index', title: 'Home', icon: 'home-outline' },
    { name: 'appointments', title: 'Appointments', icon: 'calendar-outline' },
    { name: 'payments', title: 'Payments', icon: 'wallet-outline' },
    { name: 'messages', title: 'Messages', icon: 'chatbubble-ellipses-outline' },
    { name: 'profile', title: 'Profile', icon: 'person-outline' },
  ];
  return (
    <Tabs
      screenOptions={{
        headerTitle: () => (
          <Text style={{ color: colors.ink, fontWeight: '700', fontSize: 20, letterSpacing: -0.5 }}>
            maid<Text style={{ color: colors.primary }}>bright</Text>
            <Text style={{ fontSize: 11, color: colors.muted }}> POC</Text>
          </Text>
        ),
        headerStyle: { backgroundColor: colors.cream },
        headerShadowVisible: false,
        headerRight: () => (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Notifications, ${unread} unread`}
            onPress={() => router.push('/notifications')}
            style={{ padding: 14, flexDirection: 'row', gap: 4 }}
          >
            <Icon name="notifications-outline" size={22} />
            {unread > 0 && (
              <Text style={{ color: colors.primary, fontSize: 10, fontWeight: '700' }}>
                {unread}
              </Text>
            )}
          </Pressable>
        ),
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.muted,
        tabBarPosition: isDesktop ? 'left' : 'bottom',
        tabBarLabelPosition: isDesktop ? 'beside-icon' : 'below-icon',
        tabBarStyle: isDesktop
          ? {
              width: 224,
              minWidth: 224,
              paddingHorizontal: 14,
              paddingTop: 24,
              backgroundColor: colors.white,
              borderRightWidth: 1,
              borderRightColor: colors.border,
            }
          : {
              backgroundColor: colors.white,
              borderTopColor: colors.border,
              height: 66 + insets.bottom,
              paddingTop: 7,
              paddingBottom: Math.max(insets.bottom, 7),
            },
        tabBarItemStyle: isDesktop
          ? { marginVertical: 5, minHeight: 54, borderRadius: 14 }
          : undefined,
        tabBarActiveBackgroundColor: isDesktop ? colors.mint : undefined,
        tabBarLabelStyle: { fontSize: isDesktop ? 14 : isMobile ? 9 : 12, fontWeight: '600' },
      }}
    >
      {tabs.map((tab) => (
        <Tabs.Screen
          key={tab.name}
          name={tab.name}
          options={{
            title: tab.title,
            tabBarAccessibilityLabel: tab.title,
            tabBarIcon: ({ color }) => <Icon name={tab.icon} size={22} color={color} />,
          }}
        />
      ))}
    </Tabs>
  );
}
