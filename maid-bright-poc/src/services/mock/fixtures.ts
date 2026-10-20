import { Snapshot } from '../../types/domain';
export function atDay(offset: number, hour = 14, now = new Date()): string {
  const d = new Date(now);
  d.setUTCDate(d.getUTCDate() + offset);
  d.setUTCHours(hour, 0, 0, 0);
  return d.toISOString();
}
export function createFixtures(now = new Date()): Snapshot {
  const address = { line1: '184 Cedar Lane', city: 'Fairfax', state: 'VA', postalCode: '22030' };
  const actions = { canReschedule: true, canSkip: true, canCancel: true, canAddService: true };
  return {
    customer: {
      id: 'demo-customer',
      firstName: 'Alex',
      lastName: 'Morgan',
      email: 'alex.morgan@example.com',
      phone: '+1 (555) 010-2048',
      address,
      accessInstructions: 'Please ring the doorbell. I will let you in.',
      parkingNotes: 'Use the driveway on the left.',
      alarmInstructions: 'Alarm will be disarmed before the visit.',
      petInformation: 'One friendly cat, Luna. Please keep the front door closed.',
      serviceNotes: 'Please give extra attention to the kitchen and upstairs bathroom.',
    },
    appointments: [2, 16, 30, -12, -26].map((offset, i) => ({
      id: `apt-${i + 1}`,
      serviceName: 'Standard Home Cleaning',
      scheduledStart: atDay(offset, 14, now),
      scheduledEnd: atDay(offset, 16, now),
      status: i < 3 ? 'Confirmed' : 'Completed',
      address: { ...address },
      crewName: 'Your Maid Bright team',
      price: 165,
      addons: [],
      actions:
        i < 3
          ? { ...actions, canCancel: i !== 2 }
          : { canReschedule: false, canSkip: false, canCancel: false, canAddService: false },
      policy:
        'Demo policy: changes apply only to this visit. Your recurring cleaning plan stays active.',
      cancellationNotice:
        i === 2
          ? 'This visit needs help from our team. Send us a message to discuss cancellation.'
          : undefined,
    })),
    requests: [],
    services: [
      {
        id: 'svc-carpet',
        name: 'Carpet cleaning',
        description: 'Freshen high-traffic areas with a focused carpet clean.',
        price: 75,
        duration: '45 minutes',
        icon: 'grid-outline',
      },
      {
        id: 'svc-upholstery',
        name: 'Upholstery cleaning',
        description: 'A little extra care for your favorite sofa or armchair.',
        price: 60,
        duration: '30 minutes',
        icon: 'bed-outline',
      },
      {
        id: 'svc-deep',
        name: 'Deep cleaning',
        description: 'Detailed attention to corners, surfaces, and hard-to-reach areas.',
        price: 110,
        duration: '60 minutes',
        icon: 'sparkles-outline',
      },
      {
        id: 'svc-oven',
        name: 'Inside oven',
        description: 'Remove built-up residue and refresh the inside of your oven.',
        price: 35,
        duration: '25 minutes',
        icon: 'flame-outline',
      },
    ],
    invoices: [
      {
        id: 'inv-1',
        number: 'MB-2026-1042',
        appointmentId: 'apt-1',
        issuedAt: atDay(-2, 14, now),
        dueAt: atDay(2, 14, now),
        description: 'Standard Home Cleaning',
        amount: 165,
        status: 'Due',
      },
      {
        id: 'inv-2',
        number: 'MB-2026-1028',
        appointmentId: 'apt-4',
        issuedAt: atDay(-12, 14, now),
        dueAt: atDay(-12, 14, now),
        description: 'Standard Home Cleaning',
        amount: 165,
        status: 'Paid',
        receiptId: 'pay-seed',
      },
    ],
    payments: [
      {
        id: 'pay-seed',
        invoiceId: 'inv-2',
        amount: 165,
        paidAt: atDay(-12, 16, now),
        last4: '4242',
        receiptNumber: 'RCP-1028',
      },
    ],
    credits: 25,
    savedMethod: { brand: 'Visa', last4: '4242', expiryMonth: 12, expiryYear: 2029 },
    messages: [
      {
        id: 'msg-1',
        sender: 'team',
        body: 'Hi Alex! Your next cleaning is confirmed. Let us know if there is anything you would like us to focus on.',
        sentAt: atDay(-1, 15, now),
      },
      {
        id: 'msg-2',
        sender: 'customer',
        body: 'Thank you! Please give the kitchen a little extra attention.',
        sentAt: atDay(-1, 16, now),
      },
      {
        id: 'msg-3',
        sender: 'team',
        body: 'Of course. We have added that note for your cleaning team. See you soon!',
        sentAt: atDay(-1, 17, now),
      },
    ],
    notifications: [
      {
        id: 'ntf-1',
        title: 'Your next clean is confirmed',
        body: 'Everything is set for your next visit. View your appointment for details.',
        read: false,
        createdAt: atDay(-1, 15, now),
        appointmentId: 'apt-1',
      },
      {
        id: 'ntf-2',
        title: 'A new message from Maid Bright',
        body: 'Your cleaning notes have been shared with the team.',
        read: false,
        createdAt: atDay(-1, 17, now),
        destination: 'messages',
      },
    ],
    preferences: { email: true, sms: true, push: true, reminders: true, marketing: false },
  };
}
