import { ResponsiveGrid } from '../../components/ResponsiveGrid';
import { useOpenTab } from '../../utils/navigation';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import {
  Badge,
  Button,
  Card,
  Empty,
  Feedback,
  Field,
  Icon,
  IconName,
  Notice,
  Screen,
  SummaryRow,
} from '../../components/ui';
import { useCustomer } from '../../store/AppProvider';
import { useAction } from '../../hooks/useAction';
import { colors, ui } from '../../theme/tokens';
import { ActionKind, Slot } from '../../types/domain';
import { dateLabel, money, timeRange } from '../../utils/format';
import { friendlyError } from '../../services/errors';
const titles: Record<ActionKind, string> = {
  reschedule: 'Find a better time',
  skip: 'Skip this cleaning',
  cancel: 'Request cancellation',
  'add-service': 'A little extra care',
};
const kinds: ActionKind[] = ['reschedule', 'skip', 'cancel', 'add-service'];
export default function ChangeScreen() {
  const openTab = useOpenTab();
  const params = useLocalSearchParams<{ id: string; kind: string }>();
  const { data, api, perform, options } = useCustomer();
  const kind = kinds.includes(params.kind as ActionKind) ? (params.kind as ActionKind) : undefined;
  const appointment = data.appointments.find((a) => a.id === params.id);
  const appointmentId = appointment?.id;
  const [slots, setSlots] = useState<Slot[]>([]);
  const [loading, setLoading] = useState(kind === 'reschedule');
  const [loadError, setLoadError] = useState('');
  const [day, setDay] = useState('');
  const [slotId, setSlotId] = useState('');
  const [serviceIds, setServiceIds] = useState<string[]>([]);
  const [note, setNote] = useState('');
  const [review, setReview] = useState(false);
  const [done, setDone] = useState(false);
  const action = useAction();
  useEffect(() => {
    if (kind !== 'reschedule' || !appointmentId) return;
    let active = true;
    api
      .getAvailability(appointmentId)
      .then((next) => {
        if (active) {
          setSlots(next);
          setDay(next[0] ? dateLabel(next[0].start) : '');
        }
      })
      .catch((error) => {
        if (active) setLoadError(friendlyError(error));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [api, appointmentId, kind]);
  const reload = async () => {
    if (!appointment) return;
    setLoading(true);
    setLoadError('');
    setSlotId('');
    try {
      const next = await api.getAvailability(appointment.id);
      setSlots(next);
      setDay(next[0] ? dateLabel(next[0].start) : '');
    } catch (error) {
      setLoadError(friendlyError(error));
    } finally {
      setLoading(false);
    }
  };
  if (!appointment || !kind)
    return (
      <Screen narrow={kind !== 'add-service'}>
        <Empty
          title="This action is unavailable"
          body="Return to your appointment and choose a supported action."
        />
      </Screen>
    );
  const selectedSlot = slots.find((s) => s.id === slotId);
  const latestRequest = data.requests.find(
    (r) => r.appointmentId === appointment.id && r.kind === kind,
  );
  const selectedServices = data.services.filter((s) => serviceIds.includes(s.id));
  const allowed = {
    reschedule: appointment.actions.canReschedule,
    skip: appointment.actions.canSkip,
    cancel: appointment.actions.canCancel,
    'add-service': appointment.actions.canAddService,
  }[kind];
  const pending = data.requests.some(
    (r) => r.appointmentId === appointment.id && r.status === 'Pending review',
  );
  const valid =
    kind === 'reschedule'
      ? !!selectedSlot
      : kind === 'add-service'
        ? serviceIds.length > 0
        : kind === 'cancel'
          ? !!note.trim()
          : true;
  const submit = async () => {
    const ok = await action.run(() =>
      perform(() =>
        api.submitChange({ appointmentId: appointment.id, kind, note, slotId, serviceIds }),
      ),
    );
    if (ok) setDone(true);
  };
  if (done)
    return (
      <Screen narrow={kind !== 'add-service'}>
        <View style={{ alignItems: 'center', paddingVertical: 25, gap: 16 }}>
          <View style={{ backgroundColor: colors.mint, borderRadius: 40, padding: 20 }}>
            <Icon name="checkmark-circle-outline" size={44} />
          </View>
          <Text style={[ui.title, { textAlign: 'center' }]}>
            {latestRequest?.status === 'Pending review' ? 'Request received' : 'You are all set'}
          </Text>
          <Text style={[ui.subtitle, { textAlign: 'center' }]}>
            {latestRequest?.status === 'Pending review'
              ? 'Maid Bright will review your request. Your existing appointment stays confirmed for now.'
              : 'Your visit has been updated. Your recurring plan stays active.'}
          </Text>
          <Badge status={latestRequest?.status ?? 'Approved'} />
        </View>
        <Button title="Track your request" onPress={() => router.replace('/requests')} />
        <Button
          title="Back to appointments"
          variant="secondary"
          onPress={() => openTab('/appointments')}
        />
      </Screen>
    );
  if (!allowed || pending)
    return (
      <Screen narrow={kind !== 'add-service'}>
        <Empty
          title={pending ? 'A request is already in review' : 'This visit cannot be changed'}
          body={
            pending
              ? 'Wait for the team to review your existing request before submitting another.'
              : appointment.cancellationNotice || 'Return to Appointments to see the latest status.'
          }
        />
        <Button title="View your requests" onPress={() => router.replace('/requests')} />
      </Screen>
    );
  return (
    <Screen narrow={kind !== 'add-service'}>
      <Text style={ui.title}>{review ? 'Check your request' : titles[kind]}</Text>
      <Text style={ui.subtitle}>
        {appointment.serviceName} · {dateLabel(appointment.scheduledStart)}
      </Text>
      {review ? (
        <Card>
          <SummaryRow label="Current visit" value={dateLabel(appointment.scheduledStart)} />
          <SummaryRow
            label="Current time"
            value={timeRange(appointment.scheduledStart, appointment.scheduledEnd)}
          />
          {selectedSlot && (
            <>
              <View style={ui.divider} />
              <SummaryRow label="Requested date" value={dateLabel(selectedSlot.start)} />
              <SummaryRow
                label="Requested time"
                value={timeRange(selectedSlot.start, selectedSlot.end)}
              />
            </>
          )}
          {selectedServices.map((service) => (
            <SummaryRow key={service.id} label={service.name} value={money(service.price)} />
          ))}
          {selectedServices.length > 0 && (
            <SummaryRow
              label="Estimated add-on total"
              value={money(selectedServices.reduce((total, service) => total + service.price, 0))}
            />
          )}
          {note.trim() ? (
            <>
              <View style={ui.divider} />
              <Text style={ui.caption}>Your note</Text>
              <Text style={ui.body}>{note}</Text>
            </>
          ) : null}
        </Card>
      ) : (
        <>
          {kind === 'reschedule' && (
            <>
              <Text style={ui.heading}>Choose a day</Text>
              <Text style={ui.caption}>
                Times shown in Eastern Time. Availability is provided by the demo service.
              </Text>
              {loading && (
                <ActivityIndicator
                  color={colors.primary}
                  accessibilityLabel="Loading available times"
                />
              )}
              <Feedback error={loadError} />
              {loadError ? (
                <Button title="Retry available times" variant="secondary" onPress={reload} />
              ) : null}
              {!loading && !loadError && slots.length === 0 && (
                <Empty
                  title="No times available"
                  body="Please message our team for help finding a new time."
                />
              )}
              <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                {[...new Set(slots.map((s) => dateLabel(s.start)))].map((d) => (
                  <Pressable
                    key={d}
                    accessibilityRole="button"
                    accessibilityLabel={d}
                    accessibilityState={{ selected: d === day }}
                    onPress={() => {
                      setDay(d);
                      setSlotId('');
                    }}
                    style={{
                      borderRadius: 12,
                      borderWidth: 1,
                      padding: 13,
                      borderColor: day === d ? colors.primary : colors.border,
                      backgroundColor: day === d ? colors.mint : colors.white,
                    }}
                  >
                    <Text
                      style={{
                        color: day === d ? colors.primary : colors.ink,
                        fontWeight: '600',
                        fontSize: 13,
                      }}
                    >
                      {d}
                    </Text>
                  </Pressable>
                ))}
              </View>
              <Text style={ui.heading}>Choose a time</Text>
              {slots
                .filter((s) => dateLabel(s.start) === day)
                .map((slot) => (
                  <Pressable
                    key={slot.id}
                    accessibilityRole="button"
                    accessibilityLabel={`Select ${timeRange(slot.start, slot.end)}`}
                    accessibilityState={{ selected: slot.id === slotId }}
                    onPress={() => setSlotId(slot.id)}
                    style={[
                      ui.card,
                      { borderColor: slot.id === slotId ? colors.primary : colors.border },
                    ]}
                  >
                    <View style={ui.between}>
                      <Text style={ui.body}>{timeRange(slot.start, slot.end)}</Text>
                      <Icon name={slot.id === slotId ? 'radio-button-on' : 'radio-button-off'} />
                    </View>
                  </Pressable>
                ))}
            </>
          )}
          {kind === 'add-service' && (
            <>
              <Notice text="Select the extra care you need. Prices are demo estimates; the team will confirm availability and your quote." />
              <ResponsiveGrid testID="services-grid">
                {data.services.map((service) => {
                  const added = appointment.addons.includes(service.id);
                  const selected = serviceIds.includes(service.id);
                  return (
                    <Pressable
                      key={service.id}
                      disabled={added}
                      accessibilityRole="checkbox"
                      accessibilityLabel={`${service.name}, ${money(service.price)}`}
                      accessibilityState={{ checked: selected || added, disabled: added }}
                      onPress={() =>
                        setServiceIds((ids) =>
                          selected ? ids.filter((id) => id !== service.id) : [...ids, service.id],
                        )
                      }
                      style={[
                        ui.card,
                        {
                          borderColor: selected ? colors.primary : colors.border,
                          opacity: added ? 0.5 : 1,
                        },
                      ]}
                    >
                      <View style={ui.between}>
                        <Icon name={service.icon as IconName} size={26} />
                        <Icon name={selected || added ? 'checkbox' : 'square-outline'} />
                      </View>
                      <Text style={ui.heading}>{service.name}</Text>
                      <Text style={ui.subtitle}>{service.description}</Text>
                      <View style={ui.between}>
                        <Text style={[ui.body, { color: colors.primary, fontWeight: '700' }]}>
                          {money(service.price)}
                        </Text>
                        <Text style={ui.caption}>{added ? 'Already added' : service.duration}</Text>
                      </View>
                    </Pressable>
                  );
                })}
              </ResponsiveGrid>
            </>
          )}
          {kind === 'skip' && (
            <Notice
              tone="warning"
              text="Only this visit will be skipped. Your later appointments stay scheduled. This demo does not calculate fees or refunds."
            />
          )}
          {kind === 'cancel' && (
            <Notice
              tone="warning"
              text="Cancellation requires review in this demo. Your visit remains confirmed until approved. Fees and refund eligibility must be confirmed with Maid Bright."
            />
          )}
          <Field
            label={kind === 'cancel' ? 'Reason for cancellation' : 'Note for the team (optional)'}
            value={note}
            onChangeText={setNote}
            multiline
            maxLength={1000}
            placeholder={
              kind === 'cancel'
                ? 'Tell us why you need to cancel this visit…'
                : 'Anything you would like us to know?'
            }
          />
        </>
      )}
      {review && (
        <Notice
          text={
            kind === 'cancel' || kind === 'add-service' || options.requireReview
              ? 'This request will be sent to Maid Bright for review.'
              : 'This change will be confirmed immediately in the demo.'
          }
        />
      )}
      <Feedback error={action.error} />
      <Button
        title={review ? 'Confirm request' : 'Review request'}
        busy={action.busy}
        disabled={!valid || loading || options.offline}
        onPress={() => (review ? submit() : setReview(true))}
      />
      {review && (
        <Button
          title="Edit request"
          variant="secondary"
          disabled={action.busy}
          onPress={() => {
            setReview(false);
            action.clear();
          }}
        />
      )}
    </Screen>
  );
}
