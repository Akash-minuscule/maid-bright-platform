import { useState } from 'react';
import { Switch, Text, View } from 'react-native';
import { Button, Card, Feedback, Notice, Screen } from '../../components/ui';
import { useCustomer } from '../../store/AppProvider';
import { useAction } from '../../hooks/useAction';
import { Preferences } from '../../types/domain';
import { colors, ui } from '../../theme/tokens';
export default function PreferencesScreen() {
  const { data, api, perform, options } = useCustomer();
  const [form, setForm] = useState({ ...data.preferences });
  const action = useAction();
  const rows: { key: keyof Preferences; title: string; body: string }[] = [
    { key: 'email', title: 'Email updates', body: 'Appointment updates and receipts' },
    { key: 'sms', title: 'Text messages', body: 'Time-sensitive updates about your visit' },
    { key: 'push', title: 'App notifications', body: 'Reminders and new messages' },
    { key: 'reminders', title: 'Cleaning reminders', body: 'A heads-up before your next visit' },
    { key: 'marketing', title: 'Offers and news', body: 'Optional Maid Bright updates' },
  ];
  return (
    <Screen narrow>
      <Text style={ui.title}>Stay in the loop, your way</Text>
      <Text style={ui.subtitle}>Choose which updates you would like to receive.</Text>
      <Card>
        {rows.map((row, i) => (
          <View key={row.key} style={{ gap: 15 }}>
            {i > 0 && <View style={ui.divider} />}
            <View style={ui.between}>
              <View style={ui.flex}>
                <Text style={[ui.body, { fontWeight: '600' }]}>{row.title}</Text>
                <Text style={ui.caption}>{row.body}</Text>
              </View>
              <Switch
                accessibilityLabel={row.title}
                value={form[row.key]}
                disabled={action.busy}
                onValueChange={(value) =>
                  setForm((previous) => ({ ...previous, [row.key]: value }))
                }
                trackColor={{ false: colors.border, true: colors.primary }}
              />
            </View>
          </View>
        ))}
      </Card>
      <Notice text="These preferences are saved only for the demo session. They do not enable device push or change any real communication consent." />
      <Feedback error={action.error} success={action.success} />
      <Button
        title="Save preferences"
        busy={action.busy}
        disabled={options.offline}
        onPress={() =>
          action.run(
            () => perform(() => api.updatePreferences(form)),
            'Your demo preferences have been saved.',
          )
        }
      />
    </Screen>
  );
}
