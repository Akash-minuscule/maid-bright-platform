import { router } from 'expo-router';
import { AuthLayout } from '../../components/AuthLayout';
import { Button, Feedback } from '../../components/ui';
import { useApp } from '../../store/AppProvider';
import { useAction } from '../../hooks/useAction';
import { environment } from '../../config/environment';
export default function WelcomeScreen() {
  const { signIn } = useApp();
  const action = useAction();
  return (
    <AuthLayout
      welcome
      title="Your home, taken care of."
      subtitle={
        environment.usesBackendLogin
          ? 'Log in to manage your cleanings, payments and messages.'
          : 'Log in to manage your cleanings, or create a sample account to explore the customer experience.'
      }
    >
      <Feedback error={action.error} />
      <Button title="Log in" icon="log-in-outline" onPress={() => router.push('/login')} />
      {environment.usesBackendLogin && (
        <Button
          title="Create a new customer account"
          variant="secondary"
          icon="person-add-outline"
          onPress={() => router.push('/register')}
        />
      )}
      {!environment.usesBackendLogin && (
        <>
          <Button
            title="Sign up"
            variant="secondary"
            icon="person-add-outline"
            onPress={() => router.push('/signup')}
          />
          <Button
            title="Explore the demo"
            variant="ghost"
            busy={action.busy}
            onPress={() => action.run(() => signIn())}
          />
        </>
      )}
    </AuthLayout>
  );
}
