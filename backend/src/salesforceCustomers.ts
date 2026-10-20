import { dataPath, integrationRequest, requireIntegration } from './integration.js';
import { SalesforceError } from './salesforce.js';

const SF_ID = /^[A-Za-z0-9]{15}([A-Za-z0-9]{3})?$/;

const soqlString = (value: string) => `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
function soqlId(value: string) {
  if (!SF_ID.test(value)) throw new Error('Invalid Salesforce ID');
  return `'${value}'`;
}

const query = async <T>(soql: string) =>
  (await integrationRequest<{ records: T[] }>(`/query?q=${encodeURIComponent(soql)}`)).records;

export interface ContactMatch {
  Id: string;
  AccountId: string | null;
  FirstName: string | null;
  LastName: string;
  Phone: string | null;
}

/** Contacts whose Email equals this address (case-insensitive in Salesforce). Never more than a handful. */
export const findContactsByEmail = (email: string) =>
  query<ContactMatch>(
    `SELECT Id, AccountId, FirstName, LastName, Phone FROM Contact WHERE Email = ${soqlString(email)} ORDER BY CreatedDate LIMIT 5`,
  );

export interface NewCustomerDetails {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
}

export class RegistrationError extends Error {
  constructor(
    readonly code: 'DUPLICATE_RECORD' | 'CREATE_FAILED',
    message: string,
  ) {
    super(message);
  }
}

interface RecordTypeInfo {
  recordTypeId: string;
  developerName: string;
  name: string;
  active: boolean;
  available: boolean;
  master: boolean;
  defaultRecordTypeMapping: boolean;
}

// Cached per connected org; record types rarely change.
let accountRecordType: { orgId: string; id: Promise<string | null> } | undefined;

/**
 * The business Account record type to use in the connected org, read from Salesforce (never hardcoded).
 * Candidates are active, available to the integration user, not the Master type (Salesforce rejects an explicit
 * Master ID once an object has record types) and not person-account types. Labels can mislead: in the demo org
 * the business type is labelled "Person Account". Preference: SF_ACCOUNT_RECORD_TYPE (developer name), then the
 * user's default, then the only candidate. Returns null when Account has no record types at all.
 */
function businessAccountRecordType(): Promise<string | null> {
  const { orgId } = requireIntegration();
  if (accountRecordType?.orgId !== orgId) {
    const id = resolveBusinessAccountRecordType();
    id.catch(() => (accountRecordType = undefined)); // retry on the next registration
    accountRecordType = { orgId, id };
  }
  return accountRecordType.id;
}

async function resolveBusinessAccountRecordType(): Promise<string | null> {
  const { recordTypeInfos } = await integrationRequest<{ recordTypeInfos: RecordTypeInfo[] }>('/sobjects/Account/describe');
  const usable = recordTypeInfos.filter((r) => r.active && r.available && !r.master);
  if (!usable.length) return null; // no record types: Salesforce assigns Master itself

  let personTypes = new Set<string>();
  try {
    personTypes = new Set(
      (await query<{ Id: string }>("SELECT Id FROM RecordType WHERE SobjectType = 'Account' AND IsPersonType = true")).map((r) => r.Id),
    );
  } catch {
    // IsPersonType exists only when Person Accounts are enabled; without them every Account type is a business type.
  }
  const candidates = usable.filter((r) => !personTypes.has(r.recordTypeId));
  const configured = process.env.SF_ACCOUNT_RECORD_TYPE?.trim();
  const chosen = configured
    ? candidates.find((r) => r.developerName === configured)
    : (candidates.find((r) => r.defaultRecordTypeMapping) ?? (candidates.length === 1 ? candidates[0] : undefined));
  const listed = candidates.map((r) => `${r.developerName} (${r.name}, ${r.recordTypeId})`).join('; ') || 'none';
  if (!chosen) {
    console.error(
      `[salesforce] no business Account record type to use. Candidates: ${listed}. ` +
        'Set SF_ACCOUNT_RECORD_TYPE in backend/.env to one of the developer names.',
    );
    throw new RegistrationError('CREATE_FAILED', 'No usable business Account record type.');
  }
  console.info(`[salesforce] new customer Accounts use record type ${chosen.developerName} (${chosen.name}, ${chosen.recordTypeId})`);
  return chosen.recordTypeId;
}

interface CompositeResponse {
  compositeResponse: Array<{
    referenceId: string;
    httpStatusCode: number;
    body: { id?: string } | Array<{ errorCode?: string; message?: string; fields?: string[] }>;
  }>;
}

/**
 * Creates the household Account and its Contact in one all-or-nothing Composite request, so a failure can
 * never leave an Account without its Contact.
 */
export async function createAccountAndContact(details: NewCustomerDetails): Promise<{ accountId: string; contactId: string }> {
  const base = await dataPath();
  const recordTypeId = await businessAccountRecordType();
  const result = await integrationRequest<CompositeResponse>('/composite', {
    method: 'POST',
    body: {
      allOrNone: true,
      compositeRequest: [
        {
          method: 'POST',
          url: `${base}/sobjects/Account`,
          referenceId: 'account',
          body: {
            ...(recordTypeId ? { RecordTypeId: recordTypeId } : {}),
            Name: `${details.firstName} ${details.lastName} Household`.trim(),
            Phone: details.phone,
            Type: 'Customer - Direct',
          },
        },
        {
          method: 'POST',
          url: `${base}/sobjects/Contact`,
          referenceId: 'contact',
          body: {
            AccountId: '@{account.id}',
            FirstName: details.firstName,
            LastName: details.lastName,
            Email: details.email,
            Phone: details.phone,
          },
        },
      ],
    },
  });

  const byRef = new Map(result.compositeResponse.map((r) => [r.referenceId, r]));
  const account = byRef.get('account');
  const contact = byRef.get('contact');
  const accountId = account && !Array.isArray(account.body) ? account.body.id : undefined;
  const contactId = contact && !Array.isArray(contact.body) ? contact.body.id : undefined;
  if (accountId && contactId) return { accountId, contactId };

  const errors = result.compositeResponse.flatMap((r) =>
    (Array.isArray(r.body) ? r.body : [])
      .filter((e) => e.errorCode !== 'PROCESSING_HALTED')
      .map((e) => ({ ...e, referenceId: r.referenceId })),
  );
  // Safe to log: Salesforce error codes, messages and field names (the request holds no passwords, codes or tokens).
  for (const e of errors)
    console.warn(
      `[salesforce] account/contact creation failed at "${e.referenceId}": ${e.errorCode} - ${e.message}` +
        (e.fields?.length ? ` (fields: ${e.fields.join(', ')})` : ''),
    );
  if (errors.some((e) => e.errorCode === 'INVALID_CROSS_REFERENCE_KEY' && e.fields?.includes('RecordTypeId')))
    accountRecordType = undefined; // look the record type up again next time
  if (errors.some((e) => e.errorCode === 'DUPLICATES_DETECTED'))
    throw new RegistrationError('DUPLICATE_RECORD', 'Salesforce flagged a possible duplicate customer record.');
  throw new RegistrationError('CREATE_FAILED', errors[0]?.message ?? 'Salesforce did not create the customer records.');
}

/**
 * After a create request whose response was lost: finds the Contact it may have created, so a retry adopts
 * it instead of creating a second Account and Contact.
 */
export async function findContactCreatedSince(email: string, since: Date) {
  const { sfUserId } = requireIntegration();
  const rows = await query<ContactMatch>(
    `SELECT Id, AccountId, FirstName, LastName, Phone FROM Contact
     WHERE Email = ${soqlString(email)} AND CreatedById = ${soqlId(sfUserId)} AND CreatedDate >= ${since.toISOString().replace(/\.\d+Z$/, 'Z')}`,
  );
  return rows.length === 1 && rows[0]!.AccountId ? rows[0]! : undefined;
}

// ---------- Appointments (read-only) ----------

export type AppointmentStatus = 'Requested' | 'Confirmed' | 'Completed' | 'Cancelled';

interface TimeRange {
  start: string;
  end: string;
}

/**
 * What the customer app gets for one visit. Deliberately contains no Salesforce record IDs and no
 * Field Service package fields: the appointment number is the only identifier.
 */
export interface CustomerAppointment {
  reference: string;
  serviceName: string;
  workType: string | null;
  status: AppointmentStatus;
  /** Finer stage for display, e.g. "In progress". Null when the status says it all. */
  statusDetail: string | null;
  scheduled: boolean;
  /** Exact visit time when scheduled; otherwise the requested window. Used for sorting and the date heading. */
  scheduledStart: string;
  scheduledEnd: string;
  /** The window the customer accepts (EarliestStartTime to DueDate). */
  requestedWindow: TimeRange;
  /** The arrival window promised to the customer, when one has been set. */
  arrivalWindow: TimeRange | null;
  duration: { value: number; unit: 'hours' | 'minutes' } | null;
  address: { line1: string; city: string; state: string; postalCode: string } | null;
  territory: string | null;
  cleaners: string[];
  notes: string | null;
  cancellationReason: string | null;
}

interface ServiceAppointmentRow {
  AppointmentNumber: string;
  Status: string | null;
  StatusCategory: string | null;
  WorkType: { Name: string } | null;
  ServiceTerritory: { Name: string } | null;
  SchedStartTime: string | null;
  SchedEndTime: string | null;
  EarliestStartTime: string;
  DueDate: string;
  ArrivalWindowStartTime: string | null;
  ArrivalWindowEndTime: string | null;
  Duration: number | null;
  DurationType: string | null;
  Street: string | null;
  City: string | null;
  State: string | null;
  PostalCode: string | null;
  Description: string | null;
  CancellationReason: string | null;
  ServiceResources: { records: Array<{ ServiceResource: { Name: string } | null }> } | null;
}

/** Salesforce sends "+0000" offsets, which some mobile JS engines cannot parse; send standard ISO-8601 instead. */
const iso = (value: string) => new Date(value).toISOString();
const range = (start: string | null, end: string | null) => (start && end ? { start: iso(start), end: iso(end) } : null);

/** By StatusCategory (stable even if an admin relabels Status values). */
const STATUS: Record<string, [AppointmentStatus, string | null]> = {
  None: ['Requested', null],
  Scheduled: ['Confirmed', null],
  Dispatched: ['Confirmed', 'Cleaner assigned'],
  CheckedIn: ['Confirmed', 'Cleaner checked in'],
  InProgress: ['Confirmed', 'In progress'],
  Completed: ['Completed', null],
  CannotComplete: ['Cancelled', 'Could not be completed'],
  Canceled: ['Cancelled', null],
};

/**
 * Service Appointments for one Account only. ServiceAppointment.AccountId is set by Salesforce from the parent
 * record, and the Account ID always comes from the customer's server-side session, never from the request.
 */
export async function listAppointments(accountId: string): Promise<CustomerAppointment[]> {
  const rows = await query<ServiceAppointmentRow>(
    `SELECT AppointmentNumber, Status, StatusCategory, WorkType.Name, ServiceTerritory.Name,
            SchedStartTime, SchedEndTime, EarliestStartTime, DueDate, ArrivalWindowStartTime, ArrivalWindowEndTime,
            Duration, DurationType, Street, City, State, PostalCode, Description, CancellationReason,
            (SELECT ServiceResource.Name FROM ServiceResources)
     FROM ServiceAppointment
     WHERE AccountId = ${soqlId(accountId)}
     ORDER BY EarliestStartTime DESC
     LIMIT 100`,
  );
  return rows.map((row) => {
    const scheduledTime = range(row.SchedStartTime, row.SchedEndTime);
    const requestedWindow = range(row.EarliestStartTime, row.DueDate)!;
    let [status, statusDetail] = STATUS[row.StatusCategory ?? row.Status ?? 'None'] ?? ['Requested', row.Status];
    if (status === 'Confirmed' && !scheduledTime) [status, statusDetail] = ['Requested', statusDetail];
    const hasAddress = Boolean(row.Street || row.City || row.PostalCode);
    return {
      reference: row.AppointmentNumber,
      serviceName: row.WorkType?.Name ?? 'Home cleaning',
      workType: row.WorkType?.Name ?? null,
      status,
      statusDetail,
      scheduled: Boolean(scheduledTime),
      scheduledStart: (scheduledTime ?? requestedWindow).start,
      scheduledEnd: (scheduledTime ?? requestedWindow).end,
      requestedWindow,
      arrivalWindow: range(row.ArrivalWindowStartTime, row.ArrivalWindowEndTime),
      duration:
        row.Duration != null && row.Duration > 0
          ? { value: row.Duration, unit: row.DurationType === 'Minutes' ? 'minutes' : 'hours' }
          : null,
      address: hasAddress
        ? { line1: row.Street ?? '', city: row.City ?? '', state: row.State ?? '', postalCode: row.PostalCode ?? '' }
        : null,
      territory: row.ServiceTerritory?.Name ?? null,
      cleaners: (row.ServiceResources?.records ?? []).map((r) => r.ServiceResource?.Name).filter((n): n is string => Boolean(n)),
      notes: row.Description?.trim() || null,
      cancellationReason: status === 'Cancelled' ? row.CancellationReason?.trim() || null : null,
    };
  });
}

// ---------- External Customer Users ----------

/** Salesforce calls used by userProvisioning.ts, each its own REST request (no mixed DML with Account/Contact). */
export const salesforceUserApi = {
  async findUserByContact(contactId: string) {
    const rows = await query<{ Id: string; IsActive: boolean }>(
      `SELECT Id, IsActive FROM User WHERE ContactId = ${soqlId(contactId)} LIMIT 1`,
    );
    return rows[0];
  },
  async getProfileUserType(profileId: string) {
    const rows = await query<{ UserType: string }>(`SELECT UserType FROM Profile WHERE Id = ${soqlId(profileId)} LIMIT 1`);
    return rows[0]?.UserType;
  },
  async createUser(fields: Record<string, string>) {
    const result = await integrationRequest<{ id: string }>('/sobjects/User', { method: 'POST', body: fields });
    return result.id;
  },
};

export const isSalesforceDown = (error: unknown) =>
  error instanceof SalesforceError && (error as { unreachable?: boolean }).unreachable === true;
