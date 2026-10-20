import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { DemoOptions, Snapshot } from '../types/domain';
import { MockCustomerApi, defaultDemoOptions } from '../services/mock/MockCustomerApi';
import { environment } from '../config/environment';
import { ApiError } from '../services/errors';
import { CryptoDigestAlgorithm, digestStringAsync } from 'expo-crypto';
import { DemoAuthService, demoIdentity } from '../services/mock/DemoAuthService';
import { DemoIdentity, LoginInput, SignUpInput } from '../types/auth';
import { BackendAuthService } from '../services/backend/BackendAuthService';
const api = new MockCustomerApi();
const auth = new DemoAuthService((value) => digestStringAsync(CryptoDigestAlgorithm.SHA256, value));
// In 'backend' mode login, onboarding and appointments are real; payments, messages etc. are still demo data.
const backendAuth = environment.usesBackendLogin ? new BackendAuthService() : null;
interface AppContextValue {
  data: Snapshot | null;
  api: MockCustomerApi;
  options: DemoOptions;
  signIn(input?: LoginInput): Promise<void>;
  signUp(input: SignUpInput): Promise<void>;
  signOut(): Promise<void>;
  /** Backend mode only: login/onboarding calls. Null in demo mode. */
  customerAuth: BackendAuthService | null;
  /** Backend mode: open the app for a customer whose session the backend just created. */
  completeOnboarding(identity: DemoIdentity): Promise<void>;
  refresh(): Promise<void>;
  perform(work: () => Promise<Snapshot>): Promise<void>;
  setOptions(patch: Partial<DemoOptions>): void;
  reset(): Promise<void>;
}
const AppContext = createContext<AppContextValue | null>(null);
export function AppProvider({ children }: React.PropsWithChildren) {
  const [data, setData] = useState<Snapshot | null>(null);
  const [options, updateOptions] = useState<DemoOptions>({ ...defaultDemoOptions });
  const epoch = useRef(0);
  const perform = useCallback(async (work: () => Promise<Snapshot>) => {
    const current = epoch.current;
    try {
      const next = await work();
      if (current === epoch.current) setData(next);
    } finally {
      if (current === epoch.current) updateOptions({ ...api.options });
    }
  }, []);
  const ensureDemoMode = () => {
    if (environment.mode !== 'demo')
      throw new ApiError(
        'SDK_NOT_CONFIGURED',
        'This project runs in demo mode. A native Salesforce SDK bridge is required for a live connection.',
        false,
      );
  };
  /** Loads the customer's real appointments, then opens the app. */
  const loadCustomer = useCallback(
    async (identity: DemoIdentity) => {
      api.setRealAppointments(await backendAuth!.appointments());
      await perform(() => api.signIn(identity));
    },
    [perform],
  );
  // Restore a saved backend session (e.g. after a page reload) so the customer stays logged in.
  useEffect(() => {
    if (!backendAuth) return;
    let active = true;
    backendAuth
      .currentCustomer()
      .then((identity) => {
        if (active && identity) return loadCustomer(identity);
      })
      .catch(() => undefined); // offline or backend down: stay on the login screen
    return () => {
      active = false;
    };
  }, [loadCustomer]);
  const signIn = async (input?: LoginInput) => {
    if (backendAuth) {
      if (!input)
        throw new ApiError('LOGIN_REQUIRED', 'Log in with the account Maid Bright set up for you.');
      await loadCustomer(await backendAuth.logIn(input));
      return;
    }
    ensureDemoMode();
    const identity = input ? await auth.logIn(input) : demoIdentity;
    await perform(() => api.signIn(identity));
  };
  const signUp = async (input: SignUpInput) => {
    if (backendAuth)
      throw new ApiError(
        'SIGNUP_DISABLED',
        'Use “Create a new customer account” on the login screen.',
      );
    ensureDemoMode();
    const identity = await auth.signUp(input);
    await perform(() => api.signIn(identity));
  };
  const signOut = async () => {
    // End the server session first, so a failed logout never leaves a live cookie behind a logged-out screen.
    if (backendAuth) await backendAuth.logOut();
    epoch.current++;
    setData(null);
    await api.signOut();
    updateOptions({ ...api.options });
  };
  const setOptions = (patch: Partial<DemoOptions>) => {
    api.setOptions(patch);
    updateOptions({ ...api.options });
  };
  return (
    <AppContext.Provider
      value={{
        data,
        api,
        options,
        signIn,
        signUp,
        signOut,
        perform,
        setOptions,
        customerAuth: backendAuth,
        completeOnboarding: loadCustomer,
        refresh: async () => {
          if (backendAuth) api.setRealAppointments(await backendAuth.appointments());
          await perform(() => api.getSnapshot());
        },
        reset: () => perform(() => api.resetDemo()),
      }}
    >
      {children}
    </AppContext.Provider>
  );
}
export function useApp() {
  const value = useContext(AppContext);
  if (!value) throw new Error('AppProvider is required');
  return value;
}
export function useCustomer() {
  const app = useApp();
  if (!app.data) throw new Error('Customer screen requires an active demo session');
  return { ...app, data: app.data };
}
