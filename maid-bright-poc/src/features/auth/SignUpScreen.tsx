import { useState } from 'react';
import { Text } from 'react-native';
import { router } from 'expo-router';
import { AuthLayout } from '../../components/AuthLayout';
import { PasswordField } from '../../components/PasswordField';
import { ResponsiveGrid } from '../../components/ResponsiveGrid';
import { Button, Feedback, Field } from '../../components/ui';
import { useApp } from '../../store/AppProvider';
import { useAction } from '../../hooks/useAction';
import { SignUpInput } from '../../types/auth';
import { ui } from '../../theme/tokens';
export default function SignUpScreen() {
  const { signUp } = useApp();
  const action = useAction();
  const [form, setForm] = useState<SignUpInput>({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    password: '',
    confirmPassword: '',
  });
  const field = (key: keyof SignUpInput, value: string) =>
    setForm((previous) => ({ ...previous, [key]: value }));
  const submit = () => action.run(() => signUp(form));
  return (
    <AuthLayout
      title="A fresh start begins here."
      subtitle="Create a demo account to try managing your home cleaning in one place."
    >
      <ResponsiveGrid>
        <Field
          label="First name"
          value={form.firstName}
          onChangeText={(value) => field('firstName', value)}
          maxLength={80}
          editable={!action.busy}
        />
        <Field
          label="Last name"
          value={form.lastName}
          onChangeText={(value) => field('lastName', value)}
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
        maxLength={200}
        editable={!action.busy}
      />
      <Field
        label="Phone number"
        value={form.phone}
        onChangeText={(value) => field('phone', value)}
        keyboardType="phone-pad"
        maxLength={30}
        editable={!action.busy}
      />
      <PasswordField
        label="Password"
        value={form.password}
        onChangeText={(value) => field('password', value)}
        editable={!action.busy}
      />
      <Text style={ui.caption}>Use a sample password with at least 8 characters.</Text>
      <PasswordField
        label="Confirm password"
        value={form.confirmPassword}
        onChangeText={(value) => field('confirmPassword', value)}
        editable={!action.busy}
        onSubmitEditing={submit}
      />
      <Feedback error={action.error} />
      <Button
        title="Create demo account"
        busy={action.busy}
        disabled={Object.values(form).some((value) => !value.trim())}
        onPress={submit}
      />
      <Button
        title="Already have an account? Log in"
        variant="ghost"
        onPress={() => router.replace('/login')}
      />
    </AuthLayout>
  );
}
