import { useState } from 'react';
import { Text } from 'react-native';
import { Button, Card, Feedback, Field, Notice, Screen } from '../../components/ui';
import { useCustomer } from '../../store/AppProvider';
import { useAction } from '../../hooks/useAction';
import { profileForm } from '../../utils/profile';
import { ui } from '../../theme/tokens';
import { ResponsiveGrid } from '../../components/ResponsiveGrid';
export default function ProfileEditScreen() {
  const { data, api, perform, options } = useCustomer();
  const [form, setForm] = useState(() => profileForm(data.customer));
  const action = useAction();
  const field = (key: 'firstName' | 'lastName' | 'email' | 'phone', value: string) =>
    setForm((previous) => ({ ...previous, [key]: value }));
  const address = (key: 'line1' | 'city' | 'state' | 'postalCode', value: string) =>
    setForm((previous) => ({ ...previous, address: { ...previous.address, [key]: value } }));
  return (
    <Screen>
      <Text style={ui.title}>Your personal details</Text>
      <Text style={ui.subtitle}>Keep your contact information and service address up to date.</Text>
      <ResponsiveGrid>
        <Card>
          <Field
            label="First name"
            value={form.firstName}
            onChangeText={(value) => field('firstName', value)}
            maxLength={80}
          />
          <Field
            label="Last name"
            value={form.lastName}
            onChangeText={(value) => field('lastName', value)}
            maxLength={80}
          />
          <Field
            label="Email address"
            value={form.email}
            onChangeText={(value) => field('email', value)}
            keyboardType="email-address"
            autoCapitalize="none"
            maxLength={200}
          />
          <Field
            label="Phone number"
            value={form.phone}
            onChangeText={(value) => field('phone', value)}
            keyboardType="phone-pad"
            maxLength={30}
          />
        </Card>
        <Card>
          <Text style={ui.heading}>Service address</Text>
          <Field
            label="Street address"
            value={form.address.line1}
            onChangeText={(value) => address('line1', value)}
            maxLength={200}
          />
          <Field
            label="City"
            value={form.address.city}
            onChangeText={(value) => address('city', value)}
            maxLength={80}
          />
          <Field
            label="State"
            value={form.address.state}
            onChangeText={(value) => address('state', value)}
            maxLength={30}
          />
          <Field
            label="ZIP code"
            value={form.address.postalCode}
            onChangeText={(value) => address('postalCode', value)}
            keyboardType="number-pad"
            maxLength={10}
          />
        </Card>
      </ResponsiveGrid>
      <Notice text="Demo edits update upcoming visits only. Address changes and identity changes may require verification in a live app." />
      <Feedback error={action.error} success={action.success} />
      <Button
        title="Save personal details"
        busy={action.busy}
        disabled={options.offline}
        onPress={() =>
          action.run(
            () => perform(() => api.updateProfile(form)),
            'Your details have been updated in the demo.',
          )
        }
      />
    </Screen>
  );
}
