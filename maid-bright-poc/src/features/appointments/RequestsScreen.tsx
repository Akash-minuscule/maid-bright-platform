import { Text } from 'react-native';
import { router } from 'expo-router';
import { Badge, Button, Card, Empty, Screen, SummaryRow } from '../../components/ui';
import { useCustomer } from '../../store/AppProvider';
import { dateLabel, timeRange } from '../../utils/format';
import { ui } from '../../theme/tokens';
export default function RequestsScreen() {
  const { data } = useCustomer();
  return (
    <Screen>
      <Text style={ui.title}>Every request, in view</Text>
      <Text style={ui.subtitle}>Follow changes to your visits from request to confirmation.</Text>
      {data.requests.length === 0 ? (
        <Empty
          title="No requests yet"
          body="Reschedule, skip, cancel, or add a service from an upcoming appointment. Your request will appear here."
          icon="list-outline"
        />
      ) : (
        data.requests.map((r) => (
          <Card key={r.id}>
            <Badge status={r.status} />
            <Text style={ui.heading}>{r.title}</Text>
            <Text style={ui.caption}>
              Submitted {dateLabel(r.createdAt)} · {r.id.slice(-6).toUpperCase()}
            </Text>
            {r.slot && (
              <>
                <SummaryRow label="Requested date" value={dateLabel(r.slot.start)} />
                <SummaryRow label="Requested time" value={timeRange(r.slot.start, r.slot.end)} />
              </>
            )}
            {r.serviceIds?.map((id) => (
              <Text key={id} style={ui.body}>
                {data.services.find((s) => s.id === id)?.name}
              </Text>
            ))}
            {r.note ? <Text style={ui.subtitle}>{r.note}</Text> : null}
            <Text style={ui.caption}>
              {r.status === 'Pending review'
                ? 'Your existing visit remains confirmed while our team reviews this request.'
                : r.status === 'Approved'
                  ? 'This request has been applied to your appointment.'
                  : 'Your appointment was kept unchanged.'}
            </Text>
            <Button
              title="View appointment"
              variant="secondary"
              onPress={() => router.push(`/appointment/${r.appointmentId}`)}
            />
          </Card>
        ))
      )}
    </Screen>
  );
}
