import { useEffect, useState } from 'react';
import { Text } from 'react-native';
import { router } from 'expo-router';
import { AuthLayout } from '../../components/AuthLayout';
import { PasswordField } from '../../components/PasswordField';
import { Button, Feedback, Field, Notice } from '../../components/ui';
import { useApp } from '../../store/AppProvider';
import { useAction } from '../../hooks/useAction';
import { VerificationPurpose, VerificationResult } from '../../services/backend/BackendAuthService';
import { DemoIdentity } from '../../types/auth';
import { ui } from '../../theme/tokens';

function useCountdown(initialSeconds: number) {
  const [seconds, setSeconds] = useState(initialSeconds);
  useEffect(() => {
    const timer = setInterval(() => setSeconds((value) => Math.max(0, value - 1)), 1000);
    return () => clearInterval(timer);
  }, []);
  return { seconds, restart: setSeconds };
}

interface Props {
  purpose: VerificationPurpose;
  email: string;
  verificationId: string;
  sentMessage: string;
  resendInSeconds: number;
  onStartOver(): void;
}

/** Shared steps after an email code is sent: enter code → create password → done. */
export function VerifyAndSetPassword(props: Props) {
  const { customerAuth, completeOnboarding } = useApp();
  const action = useAction();
  const resend = useAction();
  const countdown = useCountdown(props.resendInSeconds);
  const [step, setStep] = useState<'code' | 'password' | 'done' | 'blocked'>('code');
  const [code, setCode] = useState('');
  const [result, setResult] = useState<VerificationResult | null>(null);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [customer, setCustomer] = useState<DemoIdentity | null>(null);
  const [resent, setResent] = useState(false);

  const verify = () =>
    action.run(async () => {
      const outcome = await customerAuth!.verifyCode(props.verificationId, code);
      setResult(outcome);
      setStep(outcome.status === 'READY' ? 'password' : 'blocked');
    });
  const sendAgain = () =>
    resend.run(async () => {
      const { resendInSeconds } = await customerAuth!.resendCode(props.verificationId);
      countdown.restart(resendInSeconds);
      setCode('');
      setResent(true);
      action.clear();
    });
  const createPassword = () =>
    action.run(async () => {
      setCustomer(
        await customerAuth!.completeVerification(
          props.purpose,
          props.verificationId,
          password,
          confirmPassword,
        ),
      );
      setStep('done');
    });

  if (step === 'code')
    return (
      <AuthLayout title="Check your email." subtitle={props.sentMessage}>
        <Text style={ui.caption}>Sent to {props.email}. The code expires in 10 minutes.</Text>
        <Field
          label="6-digit code"
          value={code}
          onChangeText={(value) => setCode(value.replace(/\D/g, '').slice(0, 6))}
          keyboardType="number-pad"
          autoComplete="one-time-code"
          textContentType="oneTimeCode"
          maxLength={6}
          editable={!action.busy}
          onSubmitEditing={verify}
        />
        <Feedback
          error={action.error || resend.error}
          success={resent && !action.error && !resend.error ? 'We sent a new code.' : ''}
        />
        <Button title="Verify" busy={action.busy} disabled={code.length !== 6} onPress={verify} />
        <Button
          title={countdown.seconds > 0 ? `Resend code in ${countdown.seconds}s` : 'Resend code'}
          variant="secondary"
          busy={resend.busy}
          disabled={countdown.seconds > 0 || action.busy}
          onPress={sendAgain}
        />
        <Button title="Use a different email" variant="ghost" onPress={props.onStartOver} />
      </AuthLayout>
    );

  if (step === 'blocked' && result)
    return (
      <AuthLayout title="Email verified." subtitle="Here’s what to do next.">
        <Notice
          tone={result.status.startsWith('ALREADY') ? 'info' : 'warning'}
          text={result.message}
        />
        {result.status === 'EXISTING_CUSTOMER' && (
          <Button
            title="Existing customer? Activate your account"
            onPress={() =>
              router.replace({ pathname: '/activate', params: { email: props.email } })
            }
          />
        )}
        {result.status === 'NO_MATCH' && (
          <Button
            title="Create a new customer account"
            onPress={() => router.replace('/register')}
          />
        )}
        <Button
          title="Back to sign in"
          variant={result.status.startsWith('ALREADY') ? 'primary' : 'ghost'}
          onPress={() => router.replace('/login')}
        />
      </AuthLayout>
    );

  if (step === 'password')
    return (
      <AuthLayout
        title={
          result?.firstName
            ? `Hi ${result.firstName}, create your password.`
            : 'Create your password.'
        }
        subtitle="Your email is verified. You’ll use this password to sign in."
      >
        <PasswordField
          label="Create password"
          value={password}
          onChangeText={setPassword}
          editable={!action.busy}
        />
        <Text style={ui.caption}>Use at least 12 characters.</Text>
        <PasswordField
          label="Confirm password"
          value={confirmPassword}
          onChangeText={setConfirmPassword}
          editable={!action.busy}
          onSubmitEditing={createPassword}
        />
        <Feedback error={action.error} />
        <Button
          title={props.purpose === 'activation' ? 'Set password' : 'Create my account'}
          busy={action.busy}
          disabled={!password || !confirmPassword}
          onPress={createPassword}
        />
      </AuthLayout>
    );

  return (
    <AuthLayout
      title="You’re all set."
      subtitle={
        props.purpose === 'activation'
          ? 'Your password is saved. Next time, sign in with your email and password.'
          : 'Your Maid Bright account is ready. Next time, sign in with your email and password.'
      }
    >
      <Notice
        tone="success"
        text={`Welcome${customer?.firstName ? `, ${customer.firstName}` : ''}! You’re signed in as ${customer?.email ?? props.email}.`}
      />
      <Feedback error={action.error} />
      <Button
        title="Continue to my account"
        busy={action.busy}
        onPress={() => action.run(() => completeOnboarding(customer!))}
      />
    </AuthLayout>
  );
}
