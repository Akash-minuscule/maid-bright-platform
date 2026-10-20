import { Text, View } from 'react-native';
import { Badge, Button, Card, Icon, Notice, Screen, SummaryRow } from '../../components/ui';
import { ResponsiveGrid } from '../../components/ResponsiveGrid';
import { Appointment, VisitDetails } from '../../types/domain';
import {
  LOCAL_TIME_LABEL,
  addressLabel,
  dateLabel,
  dateTimeRange,
  durationLabel,
  timeRange,
} from '../../utils/format';
import { useOpenTab } from '../../utils/navigation';
import { ui } from '../../theme/tokens';

/** Read-only view of a real Salesforce Service Appointment. Missing data is labelled, never invented. */
export function VisitDetailScreen({
  appointment: a,
  visit,
}: {
  appointment: Appointment;
  visit: VisitDetails;
}) {
  const openTab = useOpenTab();
  const cancelled = a.status === 'Cancelled';
  return (
    <Screen>
      <View style={ui.between}>
        <Text style={ui.label}>YOUR VISIT · {a.reference}</Text>
        <Badge status={a.status} />
      </View>
      <Text style={ui.title}>
        {visit.scheduled ? dateLabel(a.scheduledStart) : 'Not scheduled yet'}
      </Text>
      <Text style={ui.subtitle}>
        {visit.arrivalWindow
          ? `Arrival ${timeRange(visit.arrivalWindow.start, visit.arrivalWindow.end)}`
          : visit.scheduled
            ? timeRange(a.scheduledStart, a.scheduledEnd)
            : `Preferred: ${timeRange(visit.requestedWindow.start, visit.requestedWindow.end)}`}
      </Text>
      <Text style={ui.caption}>All times are shown in {LOCAL_TIME_LABEL} (US Central).</Text>
      <ResponsiveGrid testID="visit-detail-grid">
        <Card>
          <View style={ui.row}>
            <Icon name="sparkles-outline" size={30} />
            <Text style={[ui.heading, ui.flex]}>{a.serviceName}</Text>
          </View>
          <View style={ui.divider} />
          <SummaryRow label="Appointment" value={a.reference ?? ''} />
          <SummaryRow label="Status" value={visit.statusDetail ?? a.status} />
          <SummaryRow label="Work type" value={visit.workType ?? 'Not specified'} />
          <SummaryRow
            label="Duration"
            value={visit.duration ? durationLabel(visit.duration) : 'Not specified'}
          />
          <SummaryRow
            label="Scheduled"
            value={
              visit.scheduled
                ? dateTimeRange(a.scheduledStart, a.scheduledEnd)
                : 'Not scheduled yet'
            }
          />
          <SummaryRow
            label="Arrival window"
            value={
              visit.arrivalWindow
                ? dateTimeRange(visit.arrivalWindow.start, visit.arrivalWindow.end)
                : 'Not set yet'
            }
          />
          <SummaryRow
            label="Preferred window"
            value={dateTimeRange(visit.requestedWindow.start, visit.requestedWindow.end)}
          />
          <SummaryRow
            label="Cleaner"
            value={visit.cleaners.length ? visit.cleaners.join(', ') : 'To be assigned'}
          />
          <SummaryRow label="Service area" value={visit.territory ?? 'Not assigned yet'} />
          {cancelled && (
            <SummaryRow
              label="Cancellation reason"
              value={visit.cancellationReason ?? 'Not provided'}
            />
          )}
        </Card>
        <View style={{ gap: 18 }}>
          <Card>
            <View style={ui.row}>
              <Icon name="location-outline" />
              <Text style={ui.heading}>Service address</Text>
            </View>
            <Text style={ui.body}>
              {visit.hasAddress
                ? addressLabel(a.address)
                : 'No service address is on file for this visit yet.'}
            </Text>
          </Card>
          {visit.notes && (
            <Card>
              <View style={ui.row}>
                <Icon name="document-text-outline" />
                <Text style={ui.heading}>Service notes</Text>
              </View>
              <Text style={ui.body}>{visit.notes}</Text>
            </Card>
          )}
        </View>
      </ResponsiveGrid>
      {a.status === 'Requested' && (
        <Notice text="Maid Bright will confirm the exact visit time and let you know." />
      )}
      {a.status === 'Confirmed' && <Notice text={a.policy} />}
      <Button
        title="Message Maid Bright"
        variant="ghost"
        icon="chatbubble-outline"
        onPress={() => openTab('/messages')}
      />
    </Screen>
  );
}
