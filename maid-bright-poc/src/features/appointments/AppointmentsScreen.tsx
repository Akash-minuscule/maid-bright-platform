import { useState } from 'react';
import { Text } from 'react-native';
import { router } from 'expo-router';
import { Button, Empty, Feedback, Screen, Segments } from '../../components/ui';
import { AppointmentCard } from '../../components/AppointmentCard';
import { ResponsiveGrid } from '../../components/ResponsiveGrid';
import { useCustomer } from '../../store/AppProvider';
import { useAction } from '../../hooks/useAction';
import { ui } from '../../theme/tokens';
import { upcoming } from '../../utils/format';
export default function AppointmentsScreen() {
  const { data, refresh } = useCustomer();
  const [filter, setFilter] = useState('Upcoming');
  const action = useAction();
  const rows =
    filter === 'Upcoming'
      ? upcoming(data.appointments)
      : data.appointments
          .filter((a) => a.status !== 'Confirmed' && a.status !== 'Requested')
          .sort((a, b) => b.scheduledStart.localeCompare(a.scheduledStart));
  return (
    <Screen refresh={() => action.run(refresh)} refreshing={action.busy}>
      <Text style={ui.title}>Your cleanings</Text>
      <Text style={ui.subtitle}>Make room for life. We will take care of the cleaning.</Text>
      <Segments items={['Upcoming', 'Past & changes']} value={filter} onChange={setFilter} />
      <Feedback error={action.error} />
      {rows.length ? (
        <ResponsiveGrid testID="appointments-grid">
          {rows.map((a) => (
            <AppointmentCard key={a.id} appointment={a} />
          ))}
        </ResponsiveGrid>
      ) : (
        <Empty
          title="You are all caught up"
          body="There are no cleanings in this view."
          icon="calendar-outline"
        />
      )}
      <Button
        title={`Your requests${data.requests.length ? ` (${data.requests.length})` : ''}`}
        variant="secondary"
        icon="list-outline"
        onPress={() => router.push('/requests')}
      />
    </Screen>
  );
}
