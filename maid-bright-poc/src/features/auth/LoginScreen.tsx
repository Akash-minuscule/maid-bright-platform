import { useState } from 'react';
import { Text } from 'react-native';
import { router } from 'expo-router';
import { AuthLayout } from '../../components/AuthLayout';
import { PasswordField } from '../../components/PasswordField';
import { Button, Feedback, Field, Notice } from '../../components/ui';
import { useApp } from '../../store/AppProvider';
import { useAction } from '../../hooks/useAction';
import { demoCredentials } from '../../services/mock/DemoAuthService';
import { ui } from '../../theme/tokens';
import { environment } from '../../config/environment';
export default function LoginScreen() {
  const { signIn } = useApp();
  const action = useAction();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const submit = () => action.run(() => signIn({ email, password }));
  return (
    <AuthLayout
      title="Welcome back."
      subtitle="Log in to manage your upcoming cleanings and keep in touch with your team."
    >
      <Field
        label="Email address"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="email-address"
        maxLength={200}
        editable={!action.busy}
        placeholder={environment.usesBackendLogin ? 'you@example.com' : 'alex.morgan@example.com'}
      />
      <PasswordField
        label="Password"
        value={password}
        onChangeText={setPassword}
        editable={!action.busy}
        onSubmitEditing={submit}
      />
      <Feedback error={action.error} />
      <Button
        title={environment.usesBackendLogin ? 'Sign in' : 'Log in to demo account'}
        busy={action.busy}
        disabled={!email.trim() || !password}
        onPress={submit}
      />
      {environment.usesBackendLogin ? (
        <>
          <Button
            title="Existing customer? Activate your account"
            variant="ghost"
            onPress={() =>
              router.push({
                pathname: '/activate',
                params: email.trim() ? { email: email.trim() } : {},
              })
            }
          />
          <Button
            title="Create a new customer account"
            variant="secondary"
            onPress={() => router.push('/register')}
          />
        </>
      ) : (
        <DemoLoginHelpers
          busy={action.busy}
          onFill={() => {
            setEmail(demoCredentials.email);
            setPassword(demoCredentials.password);
            action.clear();
          }}
        />
      )}
    </AuthLayout>
  );
}
function DemoLoginHelpers({ busy, onFill }: { busy: boolean; onFill(): void }) {
  return (
    <>
      <Text style={ui.caption}>New to Maid Bright?</Text>
      <Button
        title="Create an account"
        variant="secondary"
        onPress={() => router.replace('/signup')}
      />
      <Notice
        text={`Sample account: ${demoCredentials.email}\nPassword: ${demoCredentials.password}`}
      />
      <Button title="Fill sample login" variant="ghost" disabled={busy} onPress={onFill} />
    </>
  );
}
