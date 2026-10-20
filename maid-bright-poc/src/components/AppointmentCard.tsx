import { Pressable, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Appointment } from '../types/domain';
import { dateLabel, timeRange } from '../utils/format';
import { colors, ui } from '../theme/tokens';
import { Badge, Icon } from './ui';
export function AppointmentCard({ appointment }: { appointment: Appointment }) {
  const visit = appointment.visit;
  // Real visits: the promised arrival window first, then the booked time, then the preferred window.
  const when = visit?.arrivalWindow
    ? `Arrival ${timeRange(visit.arrivalWindow.start, visit.arrivalWindow.end)}`
    : visit && !visit.scheduled
      ? `Preferred: ${timeRange(visit.requestedWindow.start, visit.requestedWindow.end)}`
      : timeRange(appointment.scheduledStart, appointment.scheduledEnd);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`View ${appointment.serviceName} on ${dateLabel(appointment.scheduledStart)}`}
      onPress={() => router.push(`/appointment/${encodeURIComponent(appointment.id)}`)}
      style={ui.card}
    >
      <View style={ui.between}>
        <View
          style={{
            width: 44,
            height: 44,
            backgroundColor: colors.mint,
            borderRadius: 14,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Icon name="sparkles-outline" />
        </View>
        <Badge status={appointment.status} />
      </View>
      <Text style={[ui.heading, { fontSize: 18 }]}>{appointment.serviceName}</Text>
      {appointment.reference && <Text style={ui.caption}>{appointment.reference}</Text>}
      <View style={ui.row}>
        <Icon name="calendar-outline" size={17} />
        <Text style={[ui.body, { fontWeight: '600', fontSize: 14 }]}>
          {visit && !visit.scheduled ? 'Not scheduled yet' : dateLabel(appointment.scheduledStart)}
        </Text>
      </View>
      <View style={ui.between}>
        <Text style={[ui.caption, ui.flex]}>{when}</Text>
        <Icon name="arrow-forward" size={18} />
      </View>
    </Pressable>
  );
}
