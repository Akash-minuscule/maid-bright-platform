# Salesforce integration handoff

The supplied source plan remains unchanged in `source-plan.md`. This file distinguishes the implemented customer POC from the work required to connect it to Salesforce.

## Current implementation

Screens use the customer-facing types in `src/types/domain.ts`. `CustomerApi` is the service boundary. `MockCustomerApi` stands in for Salesforce/Apex/Field Service; it supplies availability and policy decisions. Demo-only staff review is a separate method and is deliberately absent from `CustomerApi`.

`createSalesforceClient` is a typed transport adapter. It requires an implementation of `SalesforceSdkBridge`. The bridge must supply native SDK authentication, logout and authenticated requests; this repo intentionally contains no pretend token exchange, native SDK binding, or production credentials.

## Proposed endpoint contracts

| Method | Path below `/services/apexrest/maidbright/v1` | Request                                     | Response expected by adapter                     |
| ------ | --------------------------------------------- | ------------------------------------------- | ------------------------------------------------ |
| GET    | `/dashboard`                                  | Authenticated customer                      | `Snapshot` containing all customer modules       |
| GET    | `/appointments/{id}/availability`             | Owned appointment                           | `Slot[]` with opaque slot IDs and ISO timestamps |
| POST   | `/appointments/{id}/reschedule`               | `{ slotId, note }`                          | Successful mutation acknowledgement              |
| POST   | `/appointments/{id}/skip`                     | `{ note }`                                  | Successful mutation acknowledgement              |
| POST   | `/appointments/{id}/cancel`                   | `{ note }`                                  | Successful mutation acknowledgement              |
| POST   | `/service-requests`                           | `{ appointmentId, kind, serviceIds, note }` | Successful mutation acknowledgement              |
| POST   | `/billing/invoices/{id}/pay`                  | `{ useSavedMethod: true }`                  | Successful mutation acknowledgement              |
| PUT    | `/profile`                                    | Explicit editable `ProfileUpdate` fields    | Successful mutation acknowledgement              |
| PUT    | `/preferences`                                | `Preferences`                               | Successful mutation acknowledgement              |
| POST   | `/messages`                                   | `{ body }`                                  | Successful mutation acknowledgement              |
| PUT    | `/notifications/{id}`                         | `{ read: true }`                            | Successful mutation acknowledgement              |

After a mutation, the adapter fetches `/dashboard` to refresh the snapshot. This is a simple POC contract, not a finalized scalable API. A live implementation must handle the case where a mutation succeeds but the refresh fails, so it does not invite duplicate payment or change submissions. Add server idempotency keys and a mutation response/reconciliation strategy before live transactional use.

Availability, preferences, payment, and notification routes extend the original plan and require backend agreement. For production, split module reads or adopt query caching if the complete snapshot becomes too large. Validate DTOs at the API boundary; the typed adapter currently trusts a conforming response.

## Mobile SDK integration sequence

1. Confirm the customer identity/licensing model and Contact-to-User mapping.
2. Choose a supported Salesforce Mobile SDK release and scaffold its native React Native TypeScript project using the official Salesforce tooling.
3. Verify the supported React Native version and native architecture against the POC's Expo/Router dependencies. Adjust the app runtime or transplant compatible screen/service code; simply installing a JavaScript package does not install the SDK's native bridges.
4. Configure the External Client App, approved callback, scopes, login domain, and SDK token lifecycle. No client secret belongs in the mobile app.
5. Implement `SalesforceSdkBridge` against the SDK's actual OAuth/network bridge. Translate known server errors into the shared `ApiError` contract; never expose raw exceptions or tokens to UI/logs.
6. Replace the demo provider with one that consumes `CustomerApi`, tracks authentication separately, and has no mock controls or staff-approval capabilities.
7. Implement and test Apex REST ownership, sharing, CRUD/FLS, field allowlists, transactional validation and audit logging.
8. Make Field Service the source of slots and scheduling decisions. Revalidate availability on submit and approval.
9. Wire tokenized payments and billing to the agreed provider. Enforce idempotency on the server, reconcile pending processor results, and return safe method display fields only.
10. Confirm one owner for consent and communication history. Add actual push registration/deep-link handling and approved offline caching only when required.
11. Run native device, integration, permission, session-expiry, offline, accessibility and security tests before UAT.

## Feature mapping

| Customer feature       | Intended Salesforce responsibility                                          | POC behavior                            |
| ---------------------- | --------------------------------------------------------------------------- | --------------------------------------- |
| Identity               | External identity, User/Contact resolution, record authorization            | Single fictional session                |
| Profile/home notes     | Approved customer fields and allowed related records                        | Session-local updates                   |
| Visits                 | Work Order / Service Appointment DTOs                                       | Fictional records                       |
| Availability           | Field Service scheduling services                                           | Mock service-issued slots               |
| Reschedule/skip/cancel | Policy checks, appointment update or staff request                          | Immediate or pending demo outcome       |
| Add services           | Existing service/product model, scope/scheduling/billing validation         | Catalog estimate and reviewed request   |
| Billing                | Approved invoice/receipt source and Authorize.Net tokenization if confirmed | Display-only saved method, fake receipt |
| Messaging              | Existing communication platform and consent ownership                       | Local conversation                      |
| Push/offline           | Approved push provider, SmartStore/Mobile Sync if justified                 | In-app updates and in-memory preview    |

The POC does not prove Salesforce permissions, production OAuth, Field Service scheduling, processor charging, or native deployment. Those remain separate integration acceptance criteria.

## Login and sign-up POC update

Version 0.2 adds an in-memory `DemoAuthService` and responsive login/sign-up screens. Its local digest comparison is only a UI demonstration, not Salesforce authentication or a production password verifier. Replace this service with the approved customer identity flow. Live signup requires identity provisioning, verification, external-user licensing, Contact/User association, and customer record authorization.

Do not send the POC form's password to the generic Salesforce record API. The live Mobile SDK/identity flow should own credentials and token lifecycle. Demo signup, account fixtures, and sample credentials must remain disabled in a live provider.
