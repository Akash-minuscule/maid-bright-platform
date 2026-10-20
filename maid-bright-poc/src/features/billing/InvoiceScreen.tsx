import { useOpenTab } from '../../utils/navigation';
import { useState } from 'react';
import { Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import {
  Badge,
  Button,
  Card,
  Empty,
  Feedback,
  Icon,
  Notice,
  Screen,
  SummaryRow,
} from '../../components/ui';
import { useCustomer } from '../../store/AppProvider';
import { useAction } from '../../hooks/useAction';
import { colors, ui } from '../../theme/tokens';
import { fullDate, money } from '../../utils/format';
export default function InvoiceScreen() {
  const openTab = useOpenTab();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data, api, perform, options } = useCustomer();
  const action = useAction();
  const [confirm, setConfirm] = useState(false);
  const [done, setDone] = useState(false);
  const invoice = data.invoices.find((i) => i.id === id);
  if (!invoice)
    return (
      <Screen narrow>
        <Empty title="Invoice not found" body="Return to Payments and choose another invoice." />
      </Screen>
    );
  const receipt = data.payments.find((p) => p.id === invoice.receiptId);
  const pay = async () => {
    const ok = await action.run(() => perform(() => api.payInvoice(invoice.id)));
    if (ok) {
      setDone(true);
      setConfirm(false);
    }
  };
  return (
    <Screen narrow>
      {done && (
        <View style={{ alignItems: 'center', gap: 13, paddingVertical: 15 }}>
          <Icon name="checkmark-circle-outline" size={52} />
          <Text style={ui.title}>Payment complete</Text>
          <Text style={ui.subtitle}>Your demo receipt is ready. No money was charged.</Text>
        </View>
      )}
      <View style={ui.between}>
        <Text style={ui.label}>{invoice.number}</Text>
        <Badge status={invoice.status} />
      </View>
      <Text style={[ui.title, { fontSize: 42 }]}>{money(invoice.amount)}</Text>
      <Text style={ui.subtitle}>{invoice.description}</Text>
      <Card>
        <SummaryRow label="Issued" value={fullDate(invoice.issuedAt)} />
        <SummaryRow label="Due date" value={fullDate(invoice.dueAt)} />
        <View style={ui.divider} />
        <SummaryRow label="Cleaning service" value={money(invoice.amount)} />
        <SummaryRow label="Total" value={money(invoice.amount)} />
      </Card>
      {receipt && (
        <Card>
          <Text style={ui.heading}>Your receipt</Text>
          <SummaryRow label="Paid" value={fullDate(receipt.paidAt)} />
          <SummaryRow label="Payment method" value={`Visa •••• ${receipt.last4}`} />
          <Text style={ui.caption}>Receipt number</Text>
          <Text style={ui.body}>{receipt.receiptNumber}</Text>
        </Card>
      )}
      {invoice.status === 'Due' && (
        <>
          <Notice text="Demo only: a simulated payment will mark this invoice as paid. No card details are collected and no money is charged. Credits are not applied." />
          {confirm && (
            <Card>
              <Text style={ui.heading}>Confirm demo payment</Text>
              <SummaryRow label="Amount" value={money(invoice.amount)} />
              <SummaryRow
                label="Saved method"
                value={`${data.savedMethod.brand} •••• ${data.savedMethod.last4}`}
              />
            </Card>
          )}
          <Feedback error={action.error} />
          <Button
            title={
              confirm
                ? `Confirm demo payment · ${money(invoice.amount)}`
                : 'Pay with saved demo method'
            }
            icon="card-outline"
            disabled={options.offline}
            busy={action.busy}
            onPress={() => (confirm ? pay() : setConfirm(true))}
          />
          {confirm && (
            <Button
              title="Go back"
              variant="secondary"
              disabled={action.busy}
              onPress={() => {
                setConfirm(false);
                action.clear();
              }}
            />
          )}
        </>
      )}
      <Button title="Back to payments" variant="ghost" onPress={() => openTab('/payments')} />
      <Text style={[ui.caption, { color: colors.muted }]}>
        The POC stores only the card brand, last four digits, and expiry for display.
      </Text>
    </Screen>
  );
}
