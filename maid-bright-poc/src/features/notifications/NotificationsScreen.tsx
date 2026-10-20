import { Pressable, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Empty, Feedback, Icon, Screen } from '../../components/ui';
import { useCustomer } from '../../store/AppProvider';
import { useAction } from '../../hooks/useAction';
import { Notification } from '../../types/domain';
import { dateLabel } from '../../utils/format';
import { useOpenTab } from '../../utils/navigation';
import { colors, ui } from '../../theme/tokens';
export default function NotificationsScreen() {
  const openTab = useOpenTab();
  const { data, api, perform, options } = useCustomer();
  const action = useAction();
  const open = async (n: Notification) => {
    if (!options.offline) await action.run(() => perform(() => api.markNotificationRead(n.id)));
    if (n.appointmentId) router.push(`/appointment/${n.appointmentId}`);
    else if (n.destination === 'messages' || n.destination === 'payments')
      openTab(n.destination === 'messages' ? '/messages' : '/payments');
    else if (n.destination === 'requests') router.push('/requests');
  };
  return (
    <Screen>
      <Text style={ui.title}>Your latest updates</Text>
      <Text style={ui.subtitle}>Appointment reminders, requests, and messages in one place.</Text>
      <Feedback error={action.error} />
      {data.notifications.length ? (
        data.notifications.map((n) => (
          <Pressable
            key={n.id}
            disabled={action.busy}
            accessibilityRole="button"
            accessibilityLabel={`${n.read ? '' : 'Unread: '}${n.title}`}
            onPress={() => open(n)}
            style={[ui.card, { backgroundColor: n.read ? colors.white : colors.mintLight }]}
          >
            <View style={ui.row}>
              <Icon name="notifications-outline" />
              <Text style={[ui.body, ui.flex, { fontWeight: '700' }]}>{n.title}</Text>
              {!n.read && (
                <View
                  style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: colors.primary }}
                />
              )}
            </View>
            <Text style={ui.subtitle}>{n.body}</Text>
            <Text style={ui.caption}>{dateLabel(n.createdAt)}</Text>
          </Pressable>
        ))
      ) : (
        <Empty title="All quiet for now" body="Updates about your cleanings will appear here." />
      )}
      <Text style={ui.caption}>
        This is an in-app demo inbox. Device push notifications are not enabled in this POC.
      </Text>
    </Screen>
  );
}
