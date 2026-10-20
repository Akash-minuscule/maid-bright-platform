import { useState } from 'react';
import { router } from 'expo-router';
import { AuthLayout } from '../../components/AuthLayout';
import { ResponsiveGrid } from '../../components/ResponsiveGrid';
import { Button, Feedback, Field } from '../../components/ui';
import { useApp } from '../../store/AppProvider';
import { useAction } from '../../hooks/useAction';
import {
  RegistrationDetails,
  VerificationStarted,
} from '../../services/backend/BackendAuthService';
import { VerifyAndSetPassword } from './VerifyAndSetPassword';

/** New customer registration: details → email code → password → Salesforce Account + Contact. */
export default function RegisterScreen() {
  const { customerAuth } = useApp();
  const action = useAction();
  const [form, setForm] = useState<RegistrationDetails>({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
  });
  const [started, setStarted] = useState<VerificationStarted | null>(null);
  const field = (key: keyof RegistrationDetails, value: string) =>
    setForm((previous) => ({ ...previous, [key]: value }));

  if (!customerAuth)
    return (
      <AuthLayout title="Not available in the demo." subtitle="Use the demo sign-up instead.">
        <Button title="Back to log in" onPress={() => router.replace('/login')} />
      </AuthLayout>
    );

  if (started)
    return (
      <VerifyAndSetPassword
        key={started.verificationId}
        purpose="registration"
        email={form.email.trim()}
        verificationId={started.verificationId}
        sentMessage={started.message}
        resendInSeconds={started.resendInSeconds}
        onStartOver={() => setStarted(null)}
      />
    );

  const submit = () =>
    action.run(async () => {
      const details = {
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        email: form.email.trim(),
        phone: form.phone.trim(),
      };
      setStarted(await customerAuth.startRegistration(details));
    });
  return (
    <AuthLayout
      title="A fresh start begins here."
      subtitle="Create your Maid Bright account. We’ll verify your email before anything is set up."
    >
      <ResponsiveGrid>
        <Field
          label="First name"
          value={form.firstName}
          onChangeText={(value) => field('firstName', value)}
          autoComplete="given-name"
          maxLength={40}
          editable={!action.busy}
        />
        <Field
          label="Last name"
          value={form.lastName}
          onChangeText={(value) => field('lastName', value)}
          autoComplete="family-name"
          maxLength={80}
          editable={!action.busy}
        />
      </ResponsiveGrid>
      <Field
        label="Email address"
        value={form.email}
        onChangeText={(value) => field('email', value)}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="email-address"
        autoComplete="email"
        maxLength={200}
        editable={!action.busy}
      />
      <Field
        label="Phone number"
        value={form.phone}
        onChangeText={(value) => field('phone', value)}
        keyboardType="phone-pad"
        autoComplete="tel"
        maxLength={40}
        editable={!action.busy}
        onSubmitEditing={submit}
      />
      <Feedback error={action.error} />
      <Button
        title="Continue"
        busy={action.busy}
        disabled={Object.values(form).some((value) => !value.trim())}
        onPress={submit}
      />
      <Button
        title="Already a customer? Set your password"
        variant="ghost"
        onPress={() =>
          router.replace({ pathname: '/activate', params: { email: form.email.trim() } })
        }
      />
      <Button title="Back to sign in" variant="ghost" onPress={() => router.replace('/login')} />
    </AuthLayout>
  );
}
