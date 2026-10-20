# Maid Bright — React Native customer app POC

A runnable customer experience based on the supplied **React Native + Salesforce Mobile SDK plan**. This POC uses React Native, TypeScript, Expo SDK 57, and Expo Router. It runs with fictional data and requires no Salesforce org, backend, or payment account.

## Start the app

Install **Node.js 22.13 or newer** (Node 24 recommended), then open a terminal in this folder:

```bash
npm ci
npm start
```

Open the QR code with a compatible Expo Go app for SDK 57. For a browser preview:

```bash
npm run web
```

For installed Android or iOS simulators, use `npm run android` or `npm run ios`. The iOS simulator needs macOS. Native builds can be generated with Expo tooling when the platform toolchains are available; `ios/` and `android/` are intentionally not checked in.

Use **Log in**, **Sign up**, or **Explore the demo** from the welcome page. The seeded sample login is:

- Email: `alex.morgan@example.com`
- Password: `MaidBright123!`

Sign-up validates names, email, phone, password length, and password confirmation, then opens a personalized dashboard. A registered demo account can log back in after sign-out during the same running app session. Accounts are in memory and disappear on reload. Use fictional details and a sample password. The `.env.example` file is optional for the demo; the default mode is `demo`.

## Working features

| Area                | POC behavior                                                                                    |
| ------------------- | ----------------------------------------------------------------------------------------------- |
| Authentication      | Login, sign-up, password show/hide, validation, sample credentials, and re-login after sign-out |
| Responsive layout   | Mobile bottom tabs; tablet two-column content; desktop sidebar and wider content                |
| Home                | Next cleaning, outstanding balance, quick actions, latest updates                               |
| Appointments        | Upcoming visits, completed/skipped/cancelled visits, detail and home instructions               |
| Reschedule          | Service-issued dates and slots, review step, confirmation, unavailable-slot error               |
| Skip                | Confirm one visit only; later appointments stay scheduled                                       |
| Cancellation        | Required reason, action eligibility, pending-review state                                       |
| Additional services | Select catalog items, review price estimates, submit and track requests                         |
| Requests            | Approved, pending, declined; simulated staff decisions in POC controls                          |
| Payments            | Invoices, saved-method display, payment confirmation, simulated receipts, history, credits      |
| Messages            | Conversation history and a local demo reply                                                     |
| Profile             | Name, contact details, address, access, parking, alarms, pets, crew notes                       |
| Preferences         | Email, SMS, app notification, reminder and marketing toggles                                    |
| Notifications       | In-app inbox, unread markers, navigation to related screens                                     |
| Demo controls       | Offline preview, staff review, slot conflicts, payment failures, data reset                     |
| Sign out            | Clears customer data and resets the next demo session                                           |

Mock dates are created relative to the device's current date. Appointment times are displayed in **Eastern Time**. Prices are fictional USD examples, not confirmed Maid Bright rates.

## Demo boundaries

- **No live Salesforce Mobile SDK, OAuth, Field Service, Authorize.Net, SMS, push delivery, or staff backend is connected.**
- Service changes live in memory. Reloading, signing out, or resetting the demo clears those changes. Sign-out retains the in-memory account registry so you can log back in; reloading clears registered accounts. Reset keeps the active demo account identity.
- The offline switch simulates loss of connectivity. Read-only screens retain the last loaded snapshot; it is not SmartStore or persistent offline sync.
- Reschedule and skip apply immediately unless staff review is enabled. Cancellation and additional-service requests always require review in this demo. These are demonstration policies, not confirmed business rules.
- Payments never charge money. They mark a demo invoice paid and create a receipt. Credits are displayed but not applied. No card number, CVV, or Salesforce access token is collected. Sample passwords are used only for the local login POC; the registry keeps a salted digest in memory. This is not production password storage or identity verification.
- Additional-service prices are estimates. Approval adds the service to the appointment; it does not generate billing or re-optimize crew scheduling.
- Production signup, Salesforce customer identity, account recovery, email/phone verification, notification delivery, authorization, and operational policies still need live implementation and validation. Profile contact edits do not change the local demo login credentials.
- Setting `EXPO_PUBLIC_API_MODE` to anything except `demo` stops sign-in with a setup message. It cannot silently impersonate a live Salesforce connection.

## Project structure

```text
src/
  app/                     Expo Router screens and navigation
  features/                Customer screens, grouped by feature
  components/              Shared controls, cards, and layout
  config/                  Environment configuration
  hooks/                   Busy/error/success handling
  services/
    contracts.ts           UI-facing API interface
    mock/                  Fictional service, data, and demo policies
    salesforce/client.ts   Native SDK bridge port and proposed Apex REST adapter
  store/                   Session and server snapshot provider
  theme/                   Shared colors, spacing, typography
  types/                   Customer-facing DTOs
  utils/                   Formatting and editable-field helpers
tests/                     Service behavior tests
scripts/                   Browser smoke test
docs/                      Original plan, demo guide, Salesforce handoff, validation
```

UI form state stays in individual screens. The provider holds the current service snapshot. Appointment eligibility, availability, and request outcomes are supplied by the service layer.

## Checks

```bash
npm run check
npm run export:web
npm run export:all
```

`check` runs TypeScript, lint, and service behavior tests. `export:all` checks JavaScript bundling for Android, iOS, and web; it does not compile native binaries.

Optional browser smoke test (with `npm run web` running in another terminal):

```bash
npx playwright install chromium
npm run test:e2e
npm run test:responsive
```

The smoke test can also run against an exported build without a running dev server: set `POC_STATIC_DIR=dist` before `npm run test:e2e`. It checks the customer flows and basic layout widths using Chromium.

See `docs/RESPONSIVE_LAYOUT.md` for breakpoints and layout behavior. See `docs/DEMO_GUIDE.md` for the walkthrough and `docs/VALIDATION.md` for the checks completed while building this POC.

## Salesforce handoff

`src/services/salesforce/client.ts` defines a `SalesforceSdkBridge` port. It is an integration seam, **not a native SDK implementation**. The adapter documents proposed REST routes and returns customer DTOs, keeping raw Salesforce object names out of the screens.

For a live build, create/configure a supported native Salesforce Mobile SDK project, implement the bridge with SDK-owned authentication and networking, confirm React Native/Expo compatibility, wire that client into a provider without demo capabilities, and implement/validate the Salesforce endpoints. Do not assume changing environment values activates OAuth.

The proposed `/dashboard` contract returns the complete `Snapshot` used by this POC; that is broader than the original plan's dashboard example and must be agreed with the backend team. Endpoint contracts and open decisions are in `docs/SALESFORCE_HANDOFF.md`.

Official references:

- [Expo SDK 57 reference](https://docs.expo.dev/versions/v57.0.0/)
- [Expo Router installation](https://docs.expo.dev/router/installation/)
- [Salesforce React Native project creation](https://developer.salesforce.com/docs/platform/mobile-sdk/guide/react-native-new-project.html)
- [Salesforce Mobile SDK components](https://developer.salesforce.com/docs/platform/mobile-sdk/guide/react-native-components.html)
