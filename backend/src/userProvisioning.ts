/**
 * Decides and performs Salesforce external Customer User provisioning for one Maid Bright customer.
 * Pure logic: Salesforce access is injected, so every outcome can be tested without a server or database.
 */

export type ProvisioningStatus = 'provisioned' | 'failed' | 'blocked';

export interface ProvisioningOutcome {
  status: ProvisioningStatus;
  sfUserId?: string;
  /** "CODE: detail". Codes: NOT_CONFIGURED, PROFILE_NOT_FOUND, PROFILE_NOT_EXTERNAL, USER_INACTIVE,
   * LICENSE_LIMIT_EXCEEDED, ACCOUNT_OWNER_ROLE_MISSING, DUPLICATE_USERNAME, CONFIGURATION_ERROR, TIMEOUT,
   * SALESFORCE_UNAVAILABLE, UNEXPECTED. */
  error?: string;
}

export interface CustomerForProvisioning {
  email: string;
  firstName: string;
  lastName: string;
  contactId: string;
}

export interface CustomerUserSettings {
  profileId: string | undefined;
  usernameSuffix: string | undefined;
  timeZone: string;
  locale: string;
  language: string;
  emailEncoding: string;
}

export interface SalesforceUserApi {
  findUserByContact(contactId: string): Promise<{ Id: string; IsActive: boolean } | undefined>;
  /** Profile.UserType, or undefined when the profile doesn't exist. */
  getProfileUserType(profileId: string): Promise<string | undefined>;
  /** Inserts the User (its own REST request, so never in the same transaction as Account/Contact DML). */
  createUser(fields: Record<string, string>): Promise<string>;
}

/** External (customer/partner) user types. Anything else would be an internal user, which is never created. */
export const EXTERNAL_USER_TYPES = ['CspLitePortal', 'CustomerSuccess', 'PowerCustomerSuccess', 'PowerPartner'];

/** Shape of errors thrown by the Salesforce client (duck-typed so this module has no runtime dependencies). */
interface SalesforceFailure {
  code?: string;
  sfErrorCode?: string;
  unreachable?: boolean;
  message?: string;
}

const slug = (value: string) =>
  value
    .normalize('NFKD')
    .replace(/[^A-Za-z0-9]/g, '')
    .toLowerCase();

/** Candidate usernames, most readable first. Usernames are unique across all Salesforce orgs. */
export function usernameCandidates(email: string, contactId: string, suffix: string): string[] {
  const candidates = [`${email.toLowerCase()}.${suffix}`, `${contactId.toLowerCase()}@${suffix}`];
  return candidates.filter((u) => u.length <= 80);
}

/** Candidate nicknames. CommunityNickname must be unique in the org (max 40 characters). */
export function nicknameCandidates(firstName: string, lastName: string, contactId: string): string[] {
  const base = slug(`${firstName}${lastName}`).slice(0, 25) || 'customer';
  return [`${base}.${contactId.slice(-6).toLowerCase()}`, `mb.${contactId.toLowerCase()}`];
}

export function aliasFor(firstName: string, lastName: string): string {
  return (slug(firstName).slice(0, 1) + slug(lastName)).slice(0, 8) || 'mbcust';
}

function describe(error: unknown): string {
  const e = error as SalesforceFailure;
  return `${e.sfErrorCode ?? e.code ?? 'ERROR'}: ${(e.message ?? String(error)).replace(/<[^>]+>/g, ' ').slice(0, 300)}`;
}

/** Maps a create failure to a retry class. Configuration problems are 'blocked' and need a Salesforce fix. */
function classify(error: unknown): ProvisioningOutcome {
  const e = error as SalesforceFailure;
  const detail = describe(error);
  if (e.unreachable) return { status: 'failed', error: `TIMEOUT: no response from Salesforce; will check for the user before retrying` };
  if (e.code === 'INTEGRATION_NOT_CONNECTED') return { status: 'failed', error: `SALESFORCE_UNAVAILABLE: ${detail}` };
  if (e.sfErrorCode === 'LICENSE_LIMIT_EXCEEDED') return { status: 'blocked', error: `LICENSE_LIMIT_EXCEEDED: ${detail}` };
  if (/role/i.test(e.message ?? '') && /owner|portal|account/i.test(e.message ?? ''))
    return { status: 'blocked', error: `ACCOUNT_OWNER_ROLE_MISSING: ${detail}` };
  if (
    e.sfErrorCode &&
    ['INVALID_CROSS_REFERENCE_KEY', 'FIELD_INTEGRITY_EXCEPTION', 'INVALID_FIELD', 'REQUIRED_FIELD_MISSING', 'INSUFFICIENT_ACCESS_OR_READONLY', 'INSUFFICIENT_ACCESS_ON_CROSS_REFERENCE_ENTITY', 'INVALID_OPERATION'].includes(e.sfErrorCode)
  )
    return { status: 'blocked', error: `CONFIGURATION_ERROR: ${detail}` };
  if (e.code === 'SALESFORCE_UNAVAILABLE' && !e.sfErrorCode) return { status: 'failed', error: `SALESFORCE_UNAVAILABLE: ${detail}` };
  return { status: 'failed', error: `UNEXPECTED: ${detail}` };
}

export async function provisionCustomerUser(
  customer: CustomerForProvisioning,
  api: SalesforceUserApi,
  settings: CustomerUserSettings,
): Promise<ProvisioningOutcome> {
  if (!settings.profileId || !settings.usernameSuffix)
    return { status: 'blocked', error: 'NOT_CONFIGURED: set SF_CUSTOMER_PROFILE_ID and SF_CUSTOMER_USERNAME_SUFFIX in backend/.env' };

  try {
    // Reuse first: also makes a retry after a timeout safe, because a user created by the lost request is found here.
    const existing = await api.findUserByContact(customer.contactId);
    if (existing)
      return existing.IsActive
        ? { status: 'provisioned', sfUserId: existing.Id }
        : { status: 'blocked', sfUserId: existing.Id, error: 'USER_INACTIVE: the Contact already has an inactive Salesforce User; reactivate it in Salesforce (uses a licence)' };

    const userType = await api.getProfileUserType(settings.profileId);
    if (!userType) return { status: 'blocked', error: `PROFILE_NOT_FOUND: profile ${settings.profileId} does not exist` };
    if (!EXTERNAL_USER_TYPES.includes(userType))
      return { status: 'blocked', error: `PROFILE_NOT_EXTERNAL: profile user type is ${userType}; an external customer profile is required` };
  } catch (error) {
    return classify(error);
  }

  const usernames = usernameCandidates(customer.email, customer.contactId, settings.usernameSuffix);
  const nicknames = nicknameCandidates(customer.firstName, customer.lastName, customer.contactId);
  let u = 0;
  let n = 0;
  for (;;) {
    const fields = {
      ContactId: customer.contactId,
      ProfileId: settings.profileId,
      Username: usernames[u]!,
      Email: customer.email,
      FirstName: customer.firstName,
      LastName: customer.lastName,
      Alias: aliasFor(customer.firstName, customer.lastName),
      CommunityNickname: nicknames[n]!,
      TimeZoneSidKey: settings.timeZone,
      LocaleSidKey: settings.locale,
      EmailEncodingKey: settings.emailEncoding,
      LanguageLocaleKey: settings.language,
    };
    try {
      return { status: 'provisioned', sfUserId: await api.createUser(fields) };
    } catch (error) {
      const code = (error as SalesforceFailure).sfErrorCode;
      if (code === 'DUPLICATE_USERNAME') {
        if (++u < usernames.length) continue;
        return { status: 'blocked', error: `DUPLICATE_USERNAME: every candidate username is taken (${describe(error)})` };
      }
      if (code === 'DUPLICATE_COMMUNITY_NICKNAME' && ++n < nicknames.length) continue;
      if (code === 'PORTAL_USER_ALREADY_EXISTS_FOR_CONTACT') {
        const existing = await api.findUserByContact(customer.contactId).catch(() => undefined);
        if (existing) return { status: 'provisioned', sfUserId: existing.Id };
      }
      return classify(error);
    }
  }
}

/** Delay before the next attempt: quick retries for temporary failures, slow ones for configuration blocks. */
export function nextAttemptDelayMs(status: ProvisioningStatus, attempts: number): number | null {
  if (status === 'provisioned') return null;
  if (status === 'blocked') return 6 * 60 * 60 * 1000;
  const minutes = [1, 5, 15, 60, 240][Math.min(attempts - 1, 4)] ?? 240;
  return minutes * 60 * 1000;
}
