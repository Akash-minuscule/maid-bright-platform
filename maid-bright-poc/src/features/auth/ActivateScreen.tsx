import { useState } from 'react';
import { Text } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { AuthLayout } from '../../components/AuthLayout';
import { Button, Feedback, Field, Notice } from '../../components/ui';
import { useApp } from '../../store/AppProvider';
import { useAction } from '../../hooks/useAction';
import { VerificationStarted } from '../../services/backend/BackendAuthService';
import { ui } from '../../theme/tokens';
import { VerifyAndSetPassword } from './VerifyAndSetPassword';

/** First-time password setup for a customer who already exists in Salesforce. */
export default function ActivateScreen() {
  const { customerAuth } = useApp();
  const params = useLocalSearchParams<{ email?: string }>();
  const action = useAction();
  const [email, setEmail] = useState(typeof params.email === 'string' ? params.email : '');
  const [started, setStarted] = useState<VerificationStarted | null>(null);

  if (!customerAuth)
    return (
      <AuthLayout title="Not available in the demo." subtitle="Use the sample account instead.">
        <Button title="Back to log in" onPress={() => router.replace('/login')} />
      </AuthLayout>
    );

  if (started)
    return (
      <VerifyAndSetPassword
        key={started.verificationId}
        purpose="activation"
        email={email.trim()}
        verificationId={started.verificationId}
        sentMessage={started.message}
        resendInSeconds={started.resendInSeconds}
        onStartOver={() => setStarted(null)}
      />
    );

  const submit = () =>
    action.run(async () => setStarted(await customerAuth.startActivation(email)));
  return (
    <AuthLayout
      title="Set your password."
      subtitle="Already a Maid Bright customer? Enter the email we have on file and we’ll send you a code."
    >
      <Field
        label="Email address"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="email-address"
        autoComplete="email"
        maxLength={200}
        editable={!action.busy}
        placeholder="you@example.com"
        onSubmitEditing={submit}
      />
      <Feedback error={action.error} />
      <Button title="Continue" busy={action.busy} disabled={!email.trim()} onPress={submit} />
      <Notice text="For your security we confirm you own this email before we look up your customer record." />
      <Text style={ui.caption}>New to Maid Bright?</Text>
      <Button
        title="Create a new customer account"
        variant="secondary"
        onPress={() => router.replace('/register')}
      />
      <Button title="Back to sign in" variant="ghost" onPress={() => router.replace('/login')} />
    </AuthLayout>
  );
}
