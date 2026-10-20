import { CustomerApi } from '../contracts';
import { ApiError } from '../errors';
import { ChangeRequest, Preferences, ProfileUpdate, Slot, Snapshot } from '../../types/domain';

/** Implement this port in a native Salesforce Mobile SDK project.
 * Its implementation must own OAuth, token refresh, and the authenticated network bridge.
 * No raw token or password is passed to UI code. The POC does not ship a native SDK binding.
 */
export interface SalesforceSdkBridge {
  authenticate(): Promise<void>;
  logout(): Promise<void>;
  request<T>(input: { method: 'GET' | 'POST' | 'PUT'; path: string; body?: unknown }): Promise<T>;
}
export function createSalesforceClient(
  bridge: SalesforceSdkBridge,
  base = '/services/apexrest/maidbright/v1',
): CustomerApi {
  const request = async <T>(
    method: 'GET' | 'POST' | 'PUT',
    path: string,
    body?: unknown,
  ): Promise<T> => {
    try {
      return await bridge.request<T>({ method, path: `${base}${path}`, body });
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw new ApiError(
        'SALESFORCE_UNAVAILABLE',
        'We could not reach Maid Bright. Please try again.',
      );
    }
  };
  const getSnapshot = () => request<Snapshot>('GET', '/dashboard');
  const mutate = async (method: 'POST' | 'PUT', path: string, body?: unknown) => {
    await request(method, path, body);
    return getSnapshot();
  };
  return {
    signIn: async () => {
      await bridge.authenticate();
      return getSnapshot();
    },
    signOut: () => bridge.logout(),
    getSnapshot,
    getAvailability: (id: string) =>
      request<Slot[]>('GET', `/appointments/${encodeURIComponent(id)}/availability`),
    submitChange: (input: ChangeRequest) =>
      input.kind === 'add-service'
        ? mutate('POST', '/service-requests', input)
        : mutate('POST', `/appointments/${encodeURIComponent(input.appointmentId)}/${input.kind}`, {
            note: input.note,
            slotId: input.slotId,
          }),
    payInvoice: (id: string) =>
      mutate('POST', `/billing/invoices/${encodeURIComponent(id)}/pay`, { useSavedMethod: true }),
    updateProfile: (input: ProfileUpdate) => mutate('PUT', '/profile', input),
    updatePreferences: (input: Preferences) => mutate('PUT', '/preferences', input),
    sendMessage: (body: string) => mutate('POST', '/messages', { body }),
    markNotificationRead: (id: string) =>
      mutate('PUT', `/notifications/${encodeURIComponent(id)}`, { read: true }),
  };
}
