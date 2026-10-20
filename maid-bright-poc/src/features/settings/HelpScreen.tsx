import { useOpenTab } from '../../utils/navigation';
import { Text } from 'react-native';
import { Button, Card, Notice, Screen } from '../../components/ui';
import { ui } from '../../theme/tokens';
export default function HelpScreen() {
  const openTab = useOpenTab();
  return (
    <Screen narrow>
      <Text style={ui.title}>How can we help?</Text>
      <Card>
        <Text style={ui.heading}>Can I change one visit?</Text>
        <Text style={ui.subtitle}>
          Yes. Open an upcoming appointment to reschedule, skip, request cancellation, or request an
          additional service. The recurring plan stays active.
        </Text>
      </Card>
      <Card>
        <Text style={ui.heading}>What does “Pending review” mean?</Text>
        <Text style={ui.subtitle}>
          Your request is waiting for a team decision. Your visit stays confirmed until the change
          is approved. Track its progress under Your requests.
        </Text>
      </Card>
      <Card>
        <Text style={ui.heading}>Will a demo payment charge me?</Text>
        <Text style={ui.subtitle}>
          No. It creates a fictional receipt and marks the demo invoice paid. No bank or payment
          processor is connected.
        </Text>
      </Card>
      <Notice text="This POC is for evaluating the customer experience. Real account recovery, support delivery, identity verification, and Salesforce integration are not connected." />
      <Button title="Open demo conversation" onPress={() => openTab('/messages')} />
    </Screen>
  );
}
