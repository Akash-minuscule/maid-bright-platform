import { useOpenTab } from '../../utils/navigation';
import { router } from 'expo-router';
import { Pressable, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import {
  Badge,
  Button,
  Card,
  Empty,
  Feedback,
  Icon,
  Screen,
  SectionTitle,
} from '../../components/ui';
import { ResponsiveGrid } from '../../components/ResponsiveGrid';
import { useCustomer } from '../../store/AppProvider';
import { useAction } from '../../hooks/useAction';
import { colors, ui } from '../../theme/tokens';
import { dateLabel, money, timeRange, upcoming } from '../../utils/format';
export default function HomeScreen() {
  const openTab = useOpenTab();
  const { data, refresh } = useCustomer();
  const action = useAction();
  const next = upcoming(data.appointments)[0];
  const due = data.invoices.filter((i) => i.status === 'Due').reduce((sum, i) => sum + i.amount, 0);
  const pending = data.requests.filter((r) => r.status === 'Pending review').length;
  return (
    <Screen refresh={() => action.run(refresh)} refreshing={action.busy}>
      <View style={{ gap: 7 }}>
        <Text style={ui.label}>YOUR HOME, TAKEN CARE OF</Text>
        <Text style={ui.title}>Hello, {data.customer.firstName}.</Text>
        <Text style={ui.subtitle}>A fresh start is already on your calendar.</Text>
      </View>
      <Feedback error={action.error} />
      <ResponsiveGrid testID="dashboard-grid">
        <View style={{ gap: 18 }}>
          {next ? (
            <LinearGradient
              colors={['#155F55', '#094A43']}
              style={[ui.card, { borderWidth: 0, gap: 18, padding: 23 }]}
            >
              <View style={ui.between}>
                <Text style={[ui.label, { color: '#B7DCD0' }]}>YOUR NEXT CLEAN</Text>
                <View style={{ backgroundColor: '#FFFFFF1C', padding: 9, borderRadius: 13 }}>
                  <Icon name="sparkles-outline" color={colors.accent} size={24} />
                </View>
              </View>
              <Text
                style={{
                  color: colors.white,
                  fontSize: 28,
                  fontWeight: '700',
                  letterSpacing: -0.7,
                }}
              >
                {dateLabel(next.scheduledStart)}
              </Text>
              <Text style={{ color: '#D4EBE3', fontSize: 14 }}>
                {timeRange(next.scheduledStart, next.scheduledEnd)}
              </Text>
              <View
                style={[
                  ui.between,
                  { borderTopWidth: 1, borderTopColor: '#FFFFFF25', paddingTop: 16 },
                ]}
              >
                <View style={ui.flex}>
                  <Text style={{ color: colors.white, fontSize: 15, fontWeight: '600' }}>
                    {next.serviceName}
                  </Text>
                  <Text style={{ color: '#B7DCD0', fontSize: 12, marginTop: 5 }}>
                    {next.address.line1}
                  </Text>
                </View>
                <Badge status={next.status} />
              </View>
              <Button
                title="View appointment"
                variant="secondary"
                icon="arrow-forward"
                onPress={() => router.push(`/appointment/${next.id}`)}
              />
            </LinearGradient>
          ) : (
            <Empty
              title="No upcoming cleaning"
              body="Your past visits and requests are still available under Appointments."
            />
          )}
          <View style={[ui.row, { alignItems: 'stretch' }]}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Add a service"
              onPress={() =>
                next
                  ? router.push({
                      pathname: '/change/[id]',
                      params: { id: next.id, kind: 'add-service' },
                    })
                  : openTab('/appointments')
              }
              style={[
                ui.card,
                { flex: 1, minWidth: 0, padding: 17, backgroundColor: colors.mintLight },
              ]}
            >
              <Icon name="add-circle-outline" />
              <Text style={[ui.body, { fontWeight: '600', fontSize: 13 }]}>Add a service</Text>
              <Text style={ui.caption}>A little extra care</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Message our team"
              onPress={() => openTab('/messages')}
              style={[ui.card, { flex: 1, minWidth: 0, padding: 17 }]}
            >
              <Icon name="chatbubble-ellipses-outline" />
              <Text style={[ui.body, { fontWeight: '600', fontSize: 13 }]}>Message us</Text>
              <Text style={ui.caption}>We are here to help</Text>
            </Pressable>
          </View>
        </View>
        <View style={{ gap: 18 }}>
          <SectionTitle title="At a glance" />
          <Card>
            <View style={ui.between}>
              <View style={ui.flex}>
                <Text style={ui.caption}>Outstanding balance</Text>
                <Text style={[ui.title, { fontSize: 27, marginTop: 4 }]}>{money(due)}</Text>
              </View>
              <Button title="Payments" variant="secondary" onPress={() => openTab('/payments')} />
            </View>
            <View style={ui.divider} />
            <View style={[ui.between, { flexWrap: 'wrap' }]}>
              <Text style={ui.caption}>{money(data.credits)} in available credits</Text>
              <Text style={[ui.caption, { color: colors.primary }]}>
                Visa •••• {data.savedMethod.last4}
              </Text>
            </View>
          </Card>
          {pending > 0 && (
            <Card>
              <SectionTitle
                title={`${pending} request${pending === 1 ? '' : 's'} in review`}
                action="Track requests"
                onPress={() => router.push('/requests')}
              />
              <Text style={ui.subtitle}>
                Your existing appointment stays confirmed until the team approves a change.
              </Text>
            </Card>
          )}
          <SectionTitle
            title="Latest updates"
            action="View all"
            onPress={() => router.push('/notifications')}
          />
          {data.notifications.slice(0, 2).map((n) => (
            <Card key={n.id}>
              <View style={ui.row}>
                <Icon name="notifications-outline" />
                <View style={ui.flex}>
                  <Text style={[ui.body, { fontWeight: '600' }]}>{n.title}</Text>
                  <Text style={ui.caption}>{n.body}</Text>
                </View>
              </View>
            </Card>
          ))}
        </View>
      </ResponsiveGrid>
      <Text style={[ui.caption, { textAlign: 'center' }]}>
        Less on your to-do list. More time for you.
      </Text>
    </Screen>
  );
}
