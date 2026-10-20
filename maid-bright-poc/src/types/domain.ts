/** 'Requested' = booked in Salesforce but no visit time set yet (shown as its date window). */
export type AppointmentStatus = 'Requested' | 'Confirmed' | 'Completed' | 'Skipped' | 'Cancelled';
export type ActionKind = 'reschedule' | 'skip' | 'cancel' | 'add-service';
export type RequestStatus = 'Pending review' | 'Approved' | 'Declined';
export interface Address {
  line1: string;
  city: string;
  state: string;
  postalCode: string;
}
export interface Customer {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  address: Address;
  accessInstructions: string;
  parkingNotes: string;
  alarmInstructions: string;
  petInformation: string;
  serviceNotes: string;
}
export interface Appointment {
  id: string;
  serviceName: string;
  scheduledStart: string;
  scheduledEnd: string;
  status: AppointmentStatus;
  address: Address;
  crewName: string;
  price: number;
  actions: { canReschedule: boolean; canSkip: boolean; canCancel: boolean; canAddService: boolean };
  policy: string;
  cancellationNotice?: string;
  addons: string[];
  /** Set for real Salesforce Service Appointments (backend mode); absent for demo data. */
  source?: 'salesforce';
  /** Salesforce appointment number, e.g. SA-0002. */
  reference?: string;
  /** Extra read-only details for real Salesforce visits (backend mode). Absent for demo data. */
  visit?: VisitDetails;
}
export interface TimeWindow {
  start: string;
  end: string;
}
/** Customer-safe details of a Salesforce Service Appointment. Null means "not set in Salesforce". */
export interface VisitDetails {
  scheduled: boolean;
  statusDetail: string | null;
  workType: string | null;
  territory: string | null;
  requestedWindow: TimeWindow;
  arrivalWindow: TimeWindow | null;
  duration: { value: number; unit: 'hours' | 'minutes' } | null;
  hasAddress: boolean;
  cleaners: string[];
  notes: string | null;
  cancellationReason: string | null;
}
export interface Slot {
  id: string;
  start: string;
  end: string;
}
export interface Service {
  id: string;
  name: string;
  description: string;
  price: number;
  duration: string;
  icon: string;
}
export interface CustomerRequest {
  id: string;
  appointmentId: string;
  kind: ActionKind;
  title: string;
  note: string;
  status: RequestStatus;
  createdAt: string;
  slot?: Slot;
  serviceIds?: string[];
}
export interface Invoice {
  id: string;
  number: string;
  appointmentId: string;
  issuedAt: string;
  dueAt: string;
  description: string;
  amount: number;
  status: 'Due' | 'Paid';
  receiptId?: string;
}
export interface Payment {
  id: string;
  invoiceId: string;
  amount: number;
  paidAt: string;
  last4: string;
  receiptNumber: string;
}
export interface SavedMethod {
  brand: string;
  last4: string;
  expiryMonth: number;
  expiryYear: number;
}
export interface Message {
  id: string;
  sender: 'customer' | 'team';
  body: string;
  sentAt: string;
}
export interface Notification {
  id: string;
  title: string;
  body: string;
  read: boolean;
  createdAt: string;
  appointmentId?: string;
  destination?: 'messages' | 'payments' | 'requests';
}
export interface Preferences {
  email: boolean;
  sms: boolean;
  push: boolean;
  reminders: boolean;
  marketing: boolean;
}
export interface Snapshot {
  customer: Customer;
  appointments: Appointment[];
  requests: CustomerRequest[];
  services: Service[];
  invoices: Invoice[];
  payments: Payment[];
  credits: number;
  savedMethod: SavedMethod;
  messages: Message[];
  notifications: Notification[];
  preferences: Preferences;
}
export interface DemoOptions {
  offline: boolean;
  requireReview: boolean;
  failNextPayment: boolean;
  conflictNextSlot: boolean;
}
export interface ChangeRequest {
  appointmentId: string;
  kind: ActionKind;
  note: string;
  slotId?: string;
  serviceIds?: string[];
}
export type ProfileUpdate = Pick<
  Customer,
  | 'firstName'
  | 'lastName'
  | 'email'
  | 'phone'
  | 'address'
  | 'accessInstructions'
  | 'parkingNotes'
  | 'alarmInstructions'
  | 'petInformation'
  | 'serviceNotes'
>;
