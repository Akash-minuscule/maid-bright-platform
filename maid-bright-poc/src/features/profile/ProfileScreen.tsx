import { useState } from 'react';
import { Text, View } from 'react-native';
import { router } from 'expo-router';
import { Button, Card, Feedback, MenuRow, Notice, Screen } from '../../components/ui';
import { useCustomer } from '../../store/AppProvider';
import { useAction } from '../../hooks/useAction';
import { colors, ui } from '../../theme/tokens';
import { ResponsiveGrid } from '../../components/ResponsiveGrid';
export default function ProfileScreen() {
  const { data, signOut } = useCustomer();
  const [confirmOut, setConfirmOut] = useState(false);
  const action = useAction();
  const customer = data.customer;
  return (
    <Screen>
      <Text style={ui.title}>Make yourself at home</Text>
      <View style={[ui.row, { marginVertical: 5 }]}>
        <View
          style={{
            width: 67,
            height: 67,
            borderRadius: 24,
            backgroundColor: colors.mint,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Text style={{ fontSize: 23, color: colors.primary, fontWeight: '700' }}>
            {customer.firstName[0]}
            {customer.lastName[0]}
          </Text>
        </View>
        <View style={ui.flex}>
          <Text style={ui.heading}>
            {customer.firstName} {customer.lastName}
          </Text>
          <Text style={ui.caption}>{customer.email}</Text>
          <Text style={ui.caption}>Every 2 weeks · home cleaning</Text>
        </View>
      </View>
      <ResponsiveGrid testID="profile-grid">
        <Card>
          <MenuRow
            title="Personal details"
            subtitle="Name, contact details & service address"
            icon="person-outline"
            onPress={() => router.push('/profile-edit')}
          />
          <View style={ui.divider} />
          <MenuRow
            title="Your home"
            subtitle="Access, parking, pets & cleaning notes"
            icon="home-outline"
            onPress={() => router.push('/home-instructions')}
          />
          <View style={ui.divider} />
          <MenuRow
            title="Communication preferences"
            subtitle="Choose how you hear from us"
            icon="notifications-outline"
            onPress={() => router.push('/preferences')}
          />
        </Card>
        <Card>
          <MenuRow
            title="Your requests"
            subtitle="Track appointment changes"
            icon="list-outline"
            onPress={() => router.push('/requests')}
          />
          <View style={ui.divider} />
          <MenuRow
            title="Help & support"
            subtitle="Questions about the app"
            icon="help-circle-outline"
            onPress={() => router.push('/help')}
          />
        </Card>
      </ResponsiveGrid>
      <MenuRow
        title="POC controls"
        subtitle="Try approval, offline & error scenarios"
        icon="options-outline"
        onPress={() => router.push('/demo-controls')}
      />
      {confirmOut && (
        <Notice
          tone="warning"
          text="Signing out clears sample service changes. Your demo login stays available until the app is reloaded."
        />
      )}
      <Feedback error={action.error} />
      <Button
        title={confirmOut ? 'Confirm sign out' : 'Sign out of demo'}
        variant="danger"
        busy={action.busy}
        onPress={() => (confirmOut ? action.run(signOut) : setConfirmOut(true))}
      />
      {confirmOut && (
        <Button title="Stay in demo" variant="secondary" onPress={() => setConfirmOut(false)} />
      )}
      <Text style={[ui.caption, { textAlign: 'center' }]}>
        Maid Bright · customer app POC · v0.2.0
      </Text>
    </Screen>
  );
}
