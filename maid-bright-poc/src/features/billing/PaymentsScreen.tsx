import { ResponsiveGrid } from '../../components/ResponsiveGrid';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { router } from 'expo-router';
import {
  Badge,
  Card,
  Empty,
  Icon,
  Notice,
  Screen,
  Segments,
  SummaryRow,
} from '../../components/ui';
import { useCustomer } from '../../store/AppProvider';
import { colors, ui } from '../../theme/tokens';
import { fullDate, money } from '../../utils/format';
export default function PaymentsScreen() {
  const { data } = useCustomer();
  const [tab, setTab] = useState('Invoices');
  const due = data.invoices.filter((i) => i.status === 'Due').reduce((sum, i) => sum + i.amount, 0);
  return (
    <Screen>
      <Text style={ui.title}>Payments, made clear</Text>
      <Text style={ui.subtitle}>Your invoices, receipts, and saved payment method.</Text>
      <ResponsiveGrid>
        <Card>
          <Text style={ui.caption}>Outstanding balance</Text>
          <Text style={[ui.title, { fontSize: 36 }]}>{money(due)}</Text>
          <View style={ui.divider} />
          <SummaryRow label="Available credit" value={money(data.credits)} />
        </Card>
        <View style={[ui.card, { backgroundColor: colors.mintLight }]}>
          <View style={ui.row}>
            <Icon name="card-outline" size={29} />
            <View style={ui.flex}>
              <Text style={[ui.body, { fontWeight: '700' }]}>
                {data.savedMethod.brand} •••• {data.savedMethod.last4}
              </Text>
              <Text style={ui.caption}>
                Expires {data.savedMethod.expiryMonth}/{data.savedMethod.expiryYear} · demo method
              </Text>
            </View>
          </View>
        </View>
      </ResponsiveGrid>
      <Segments items={['Invoices', 'History', 'Credits']} value={tab} onChange={setTab} />
      {tab === 'Invoices' &&
        (data.invoices.length ? (
          <ResponsiveGrid testID="invoices-grid">
            {data.invoices.map((invoice) => (
              <Pressable
                key={invoice.id}
                accessibilityRole="button"
                accessibilityLabel={`View invoice ${invoice.number}`}
                onPress={() => router.push(`/invoice/${invoice.id}`)}
                style={ui.card}
              >
                <View style={ui.between}>
                  <Text style={[ui.body, { fontWeight: '700' }]}>{invoice.number}</Text>
                  <Badge status={invoice.status} />
                </View>
                <Text style={ui.subtitle}>{invoice.description}</Text>
                <View style={ui.between}>
                  <Text style={ui.caption}>Due {fullDate(invoice.dueAt)}</Text>
                  <Text style={[ui.heading, { color: colors.primary }]}>
                    {money(invoice.amount)}
                  </Text>
                </View>
              </Pressable>
            ))}
          </ResponsiveGrid>
        ) : (
          <Empty title="No invoices" body="Your invoices will appear here." />
        ))}
      {tab === 'History' &&
        (data.payments.length ? (
          <ResponsiveGrid>
            {data.payments.map((payment) => (
              <Card key={payment.id}>
                <Badge status="Paid" />
                <Text style={ui.heading}>{money(payment.amount)}</Text>
                <Text style={ui.caption}>
                  {fullDate(payment.paidAt)} · Visa •••• {payment.last4}
                </Text>
                <Text style={ui.caption}>Receipt {payment.receiptNumber}</Text>
                <Text style={ui.body}>
                  Invoice {data.invoices.find((i) => i.id === payment.invoiceId)?.number}
                </Text>
              </Card>
            ))}
          </ResponsiveGrid>
        ) : (
          <Empty
            title="No payments yet"
            body="Your completed payments and receipts will appear here."
          />
        ))}
      {tab === 'Credits' && (
        <Card>
          <Icon name="gift-outline" size={32} />
          <Text style={ui.heading}>{money(data.credits)} available credit</Text>
          <Text style={ui.subtitle}>A fictional welcome credit, shown for the POC.</Text>
          <Notice text="Credits are shown for reference and are not applied by demo payments. Production credit rules come from the billing system." />
        </Card>
      )}
      <Text style={[ui.caption, { textAlign: 'center' }]}>
        All payment actions are simulated. No money is charged.
      </Text>
    </Screen>
  );
}
