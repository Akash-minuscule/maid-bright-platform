import { useState } from 'react';
import { Switch, Text, View } from 'react-native';
import { Badge, Button, Card, Feedback, Notice, Screen } from '../../components/ui';
import { useCustomer } from '../../store/AppProvider';
import { useAction } from '../../hooks/useAction';
import { DemoOptions } from '../../types/domain';
import { colors, ui } from '../../theme/tokens';
export default function DemoControlsScreen() {
  const { data, api, perform, options, setOptions, reset } = useCustomer();
  const action = useAction();
  const [confirm, setConfirm] = useState(false);
  const rows: { key: keyof DemoOptions; title: string; body: string }[] = [
    {
      key: 'requireReview',
      title: 'Staff review for changes',
      body: 'Rescheduling and skipping stay pending until approved below.',
    },
    {
      key: 'offline',
      title: 'Simulate offline',
      body: 'Keep cached screens visible and block changes. Turn off to reconnect.',
    },
    {
      key: 'conflictNextSlot',
      title: 'Next slot becomes unavailable',
      body: 'The next reschedule attempt returns a recoverable conflict.',
    },
    {
      key: 'failNextPayment',
      title: 'Next payment fails',
      body: 'The next payment attempt fails. The invoice remains due.',
    },
  ];
  return (
    <Screen narrow>
      <Text style={ui.title}>Explore the POC</Text>
      <Notice text="These controls simulate server responses and staff actions. They are for demonstrations only and must not be exposed in production." />
      <Card>
        {rows.map((row, i) => (
          <View key={row.key} style={{ gap: 14 }}>
            {i > 0 && <View style={ui.divider} />}
            <View style={ui.between}>
              <View style={ui.flex}>
                <Text style={[ui.body, { fontWeight: '600' }]}>{row.title}</Text>
                <Text style={ui.caption}>{row.body}</Text>
              </View>
              <Switch
                accessibilityLabel={row.title}
                value={options[row.key]}
                disabled={action.busy}
                onValueChange={(value) => setOptions({ [row.key]: value })}
                trackColor={{ false: colors.border, true: colors.primary }}
              />
            </View>
          </View>
        ))}
      </Card>
      <Text style={ui.heading}>Simulated staff review</Text>
      {data.requests.filter((r) => r.status === 'Pending review').length === 0 && (
        <Text style={ui.subtitle}>
          Submit a cancellation, additional-service request, or a change with staff review enabled
          to try this flow.
        </Text>
      )}
      {data.requests
        .filter((r) => r.status === 'Pending review')
        .map((r) => (
          <Card key={r.id}>
            <Badge status={r.status} />
            <Text style={ui.heading}>{r.title}</Text>
            <Text style={ui.caption}>
              Appointment {r.appointmentId} · {r.note || 'No note added'}
            </Text>
            <Button
              title={`Approve ${r.title.toLowerCase()}`}
              disabled={options.offline}
              busy={action.busy}
              onPress={() =>
                action.run(
                  () => perform(() => api.resolveDemoRequest(r.id, true)),
                  'Approved. The appointment has been updated.',
                )
              }
            />
            <Button
              title={`Decline ${r.title.toLowerCase()}`}
              variant="danger"
              disabled={action.busy || options.offline}
              onPress={() =>
                action.run(
                  () => perform(() => api.resolveDemoRequest(r.id, false)),
                  'Declined. The original appointment has been kept.',
                )
              }
            />
          </Card>
        ))}
      <Feedback error={action.error} success={action.success} />
      {confirm && (
        <Notice
          tone="warning"
          text="Reset clears all demo changes, requests, messages, and payments. You will remain in the demo with fresh sample data."
        />
      )}
      <Button
        title={confirm ? 'Confirm reset' : 'Reset demo data'}
        variant="danger"
        busy={action.busy}
        onPress={() =>
          confirm
            ? action.run(async () => {
                await reset();
                setConfirm(false);
              }, 'Demo data reset.')
            : setConfirm(true)
        }
      />
      {confirm && (
        <Button title="Keep current data" variant="secondary" onPress={() => setConfirm(false)} />
      )}
      <Text style={ui.caption}>
        Demo state is held in memory. Reloading the app or signing out also clears changes.
      </Text>
    </Screen>
  );
}
