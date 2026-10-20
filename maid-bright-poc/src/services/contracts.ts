import { ChangeRequest, Preferences, ProfileUpdate, Slot, Snapshot } from '../types/domain';
export interface CustomerApi {
  signIn(): Promise<Snapshot>;
  signOut(): Promise<void>;
  getSnapshot(): Promise<Snapshot>;
  getAvailability(appointmentId: string): Promise<Slot[]>;
  submitChange(input: ChangeRequest): Promise<Snapshot>;
  payInvoice(invoiceId: string): Promise<Snapshot>;
  updateProfile(input: ProfileUpdate): Promise<Snapshot>;
  updatePreferences(input: Preferences): Promise<Snapshot>;
  sendMessage(body: string): Promise<Snapshot>;
  markNotificationRead(id: string): Promise<Snapshot>;
}
