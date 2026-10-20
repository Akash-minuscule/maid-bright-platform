import { useOpenTab } from '../../utils/navigation';
import { useLocalSearchParams, router } from 'expo-router';
import { Text, View } from 'react-native';
import { Badge, Button, Card, Empty, Icon, Notice, Screen, SummaryRow } from '../../components/ui';
import { useCustomer } from '../../store/AppProvider';
import { dateLabel, money, timeRange, addressLabel } from '../../utils/format';
import { colors, ui } from '../../theme/tokens';
import { ActionKind } from '../../types/domain';
import { ResponsiveGrid } from '../../components/ResponsiveGrid';
import { VisitDetailScreen } from './VisitDetailScreen';
export default function AppointmentDetailScreen() {
  const openTab = useOpenTab();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data } = useCustomer();
  const a = data.appointments.find((item) => item.id === id);
  if (!a)
    return (
      <Screen>
        <Empty
          title="Appointment not found"
          body="Return to Appointments and choose another visit."
        />
      </Screen>
    );
  if (a.visit) return <VisitDetailScreen appointment={a} visit={a.visit} />;
  const pending = data.requests.find(
    (r) => r.appointmentId === a.id && r.status === 'Pending review',
  );
  const change = (kind: ActionKind) =>
    router.push({ pathname: '/change/[id]', params: { id: a.id, kind } });
  return (
    <Screen>
      <View style={ui.between}>
        <Text style={ui.label}>YOUR VISIT</Text>
        <Badge status={a.status} />
      </View>
      <Text style={ui.title}>{dateLabel(a.scheduledStart)}</Text>
      <Text style={ui.subtitle}>{timeRange(a.scheduledStart, a.scheduledEnd)}</Text>
      <ResponsiveGrid testID="appointment-detail-grid">
        <Card>
          <View style={ui.row}>
            <Icon name="sparkles-outline" size={30} />
            <Text style={[ui.heading, ui.flex]}>{a.serviceName}</Text>
          </View>
          <View style={ui.divider} />
          <SummaryRow label="Service amount" value={money(a.price)} />
          <SummaryRow label="Cleaning team" value={a.crewName} />
          <SummaryRow label="Frequency" value="Every 2 weeks" />
          <Text style={ui.caption}>Add-on pricing is confirmed separately by the team.</Text>
        </Card>
        <Card>
          <View style={ui.row}>
            <Icon name="location-outline" />
            <Text style={ui.heading}>Your home</Text>
          </View>
          <Text style={ui.body}>{addressLabel(a.address)}</Text>
          <Text style={ui.caption}>{data.customer.accessInstructions}</Text>
          <Button
            title="Update home instructions"
            variant="secondary"
            onPress={() => router.push('/home-instructions')}
          />
        </Card>
      </ResponsiveGrid>
      {a.addons.length > 0 && (
        <Card>
          <Text style={ui.heading}>Additional services</Text>
          {a.addons.map((id) => (
            <Text key={id} style={ui.body}>
              ✓ {data.services.find((s) => s.id === id)?.name}
            </Text>
          ))}
        </Card>
      )}
      {pending && (
        <Notice
          tone="warning"
          text={`${pending.title} request is pending review. This visit remains confirmed until approved.`}
        />
      )}
      {a.status === 'Requested' && (
        <Notice text="Maid Bright will confirm the exact visit time and let you know." />
      )}
      {a.status === 'Confirmed' && (
        <>
          <Text style={ui.heading}>Need to make a change?</Text>
          <Notice text={a.policy} />
          <Button
            title="Reschedule cleaning"
            icon="calendar-outline"
            disabled={!a.actions.canReschedule || !!pending}
            onPress={() => change('reschedule')}
          />
          <Button
            title="Add a service"
            icon="add-circle-outline"
            variant="secondary"
            disabled={!a.actions.canAddService || !!pending}
            onPress={() => change('add-service')}
          />
          <Button
            title="Skip this visit"
            variant="secondary"
            disabled={!a.actions.canSkip || !!pending}
            onPress={() => change('skip')}
          />
          <Button
            title="Request cancellation"
            variant="danger"
            disabled={!a.actions.canCancel || !!pending}
            onPress={() => change('cancel')}
          />
          {a.cancellationNotice && (
            <Text style={[ui.caption, { color: colors.amber }]}>{a.cancellationNotice}</Text>
          )}
        </>
      )}
      <Button
        title="Message Maid Bright"
        variant="ghost"
        icon="chatbubble-outline"
        onPress={() => openTab('/messages')}
      />
    </Screen>
  );
}
