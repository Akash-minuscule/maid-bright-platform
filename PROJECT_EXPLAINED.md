# Maid Bright POC — explained in simple English

## 1. What is this project?

**Maid Bright** is a house-cleaning company. Its customers have regular cleanings (for example, every two weeks).
This project is a **POC (Proof of Concept)**: a working demo of a **customer app** where a customer can manage
their cleanings, pay bills, and talk to the company.

Main points:

- It is built with **React Native + Expo**, so the same code runs on **Android, iPhone, and a web browser**.
- The real plan is to connect it to **Salesforce** (the company's customer database), but **the demo does not connect to Salesforce**.
  All data is **fake ("mock") data kept in memory**. When you reload the page, everything resets.
- No real money is charged and no real SMS or emails are sent.

The goal was to show the business **what the app will look like and how it will behave** before building the expensive real Salesforce integration.

---

## 2. Technologies used

| Thing | What it is | Why it's used |
| --- | --- | --- |
| **React Native** | Build mobile apps with JavaScript/React | One codebase for Android + iOS |
| **Expo (SDK 57)** | Toolkit around React Native | Easy to run, build, and preview on the web |
| **Expo Router** | File-based navigation | Each file in `src/app/` becomes a screen/URL |
| **TypeScript** | JavaScript with types | Catches mistakes early |
| **react-native-web** | Runs React Native in a browser | This is why you can see it in Chrome |
| **expo-crypto** | Hashing (SHA-256) | Demo passwords are hashed, not kept as plain text |
| **Playwright** | Browser automation | Automated "click through the app" tests |

---

## 3. Folder structure (what lives where)

```
maid-bright-poc/
├── src/
│   ├── app/            ← SCREENS / URLS (Expo Router). File name = route.
│   │   ├── welcome.tsx, login.tsx, signup.tsx   ← before login
│   │   └── (customer)/                          ← after login
│   │       ├── (tabs)/  index, appointments, payments, messages, profile  ← the 5 tabs
│   │       ├── appointment/[id].tsx  ← one appointment's details
│   │       ├── change/[id].tsx       ← reschedule / skip / cancel / add services
│   │       ├── invoice/[id].tsx      ← one invoice
│   │       └── requests, notifications, preferences, profile-edit,
│   │           home-instructions, help, demo-controls
│   ├── features/       ← The ACTUAL screen code (app/ files just point here)
│   ├── components/     ← Reusable UI pieces: buttons, cards, password field, grid
│   ├── services/
│   │   ├── contracts.ts          ← The "menu" of things the app can ask the server
│   │   ├── mock/                 ← FAKE server: MockCustomerApi, DemoAuthService, fixtures (sample data)
│   │   └── salesforce/client.ts  ← Skeleton for the future REAL Salesforce connection
│   ├── store/AppProvider.tsx     ← Global state: who is logged in + current data
│   ├── hooks/          ← useAction (loading/error/success), useResponsive (screen size)
│   ├── theme/tokens.ts ← Colors, spacing, font sizes
│   ├── types/          ← Data shapes: Customer, Appointment, Invoice, etc.
│   └── utils/          ← Date/money formatting helpers
├── tests/              ← Automated tests for the fake server and login
├── scripts/            ← Browser smoke tests (Playwright)
└── docs/               ← Original plan, demo guide, Salesforce handoff notes
```

**Simple rule:** `app/` decides *which screen opens at which URL*, `features/` decides *what the screen looks like*,
and `services/` decides *where the data comes from*.

---

## 4. How the app works

```
 Screen (e.g. Payments)
        │  "pay invoice #2"
        ▼
 AppProvider (global store)  ──►  MockCustomerApi (fake server, in memory)
        ▲                                 │ checks rules, updates data,
        │   new "Snapshot" of all data    │ adds a notification
        └─────────────────────────────────┘
```

1. **AppProvider** (`src/store/AppProvider.tsx`) wraps the whole app. It keeps one object called the **Snapshot**,
   which holds everything about the customer: profile, appointments, invoices, payments, messages, notifications, preferences.
2. When a screen wants to do something (pay, reschedule, send a message), it calls the **API**.
3. The **fake API** (`MockCustomerApi.ts`) waits about 300 ms to feel like a real network, checks the business rules,
   changes the data, and returns a **fresh Snapshot**.
4. The store saves the new Snapshot, and every screen re-draws with the new data.

**Important design decision:** the *rules* (can this visit be cancelled? which time slots are free?) live in the
service layer, **not in the screens**. Later, the fake service can be swapped for the real Salesforce one
(`salesforce/client.ts`) without rewriting the screens, because both follow the same `CustomerApi` contract.

### Login protection
`src/app/_layout.tsx` uses `Stack.Protected`:
- **Not logged in** → you can only see Welcome / Login / Sign up.
- **Logged in** → you can only see the customer screens.

---

## 5. Features (what a user can do)

### Login and sign-up
- **Demo login:** `alex.morgan@example.com` / `MaidBright123!`
- **Sign up** checks first/last name, a valid email, a phone with 10+ digits, a password of 8–128 characters, and that "confirm password" matches.
- Passwords are **salted and hashed with SHA-256** and kept only in memory (`DemoAuthService.ts`). New accounts disappear on reload.
- **"Explore the demo"** logs you straight in as Alex.

### Home tab
Next cleaning, outstanding balance, quick-action buttons, and latest updates.

### Appointments tab
- 5 sample visits: **3 upcoming** (2, 16 and 30 days from today) and **2 completed** (12 and 26 days ago). Dates are always relative to *today*.
- Tapping one shows details: time (Eastern Time), address, crew, price, and policy.

### Manage a visit (`ChangeScreen`)
| Action | What happens |
| --- | --- |
| **Reschedule** | Shows 10 free slots (5 days × 2 times), then a review step, then confirmation. Applied immediately. |
| **Skip** | Skips this one visit only. Later visits stay. Applied immediately. |
| **Cancel** | A **reason is required**. Goes to "Pending review". The 3rd visit is set so it *cannot* be cancelled, to show the "contact us" message. |
| **Add services** | Pick extras (carpet $75, upholstery $60, …). Goes to "Pending review". |

Rules enforced by the fake server: only one pending request per visit, notes under 1,000 characters, and you can't add a service twice.

### Requests
Shows each request as **Pending review / Approved / Declined**.

### Payments
Invoices (Due/Paid), a saved card (only brand and last 4 digits are shown), **Pay** → creates a fake receipt. No real money is charged.

### Messages
Chat history with the Maid Bright team. You can send a message (1–1,000 characters).

### Profile
Edit name, email, phone, and address. Changing the address also updates every upcoming visit.
"Your home" holds door access, parking, alarm, pets, and notes for the crew.

### Preferences
On/off switches for email, SMS, push, reminders, and marketing.

### Notifications
Bell icon with an unread count. Every action (payment, request approved, …) creates a notification.
Tapping one opens the related screen.

### Demo controls (testers only)
Switches that **simulate problems**, so you can see how the app handles them:
- **Staff review for changes:** reschedule and skip also wait for approval. Buttons let you approve or decline as if you were staff.
- **Simulate offline:** every change fails with "You are offline".
- **Next slot becomes unavailable:** the next reschedule fails with "time no longer available".
- **Next payment fails:** the next payment fails.
- **Reset demo data**.

### Responsive layout (`useResponsive.ts`)
| Screen width | Layout |
| --- | --- |
| < 768 px (phone) | Tabs at the bottom, 1 column |
| 768–1199 px (tablet) | Tabs at the bottom, 2 columns |
| ≥ 1200 px (desktop) | **Sidebar on the left**, wider content |

---

## 6. The future Salesforce part (not active)

`src/services/salesforce/client.ts` is a **skeleton** for the real version. It lists the planned server URLs, for example:

- `GET /dashboard` → all customer data
- `GET /appointments/{id}/availability` → free slots
- `POST /appointments/{id}/reschedule | skip | cancel`
- `POST /billing/invoices/{id}/pay`
- `PUT /profile`, `PUT /preferences`, `POST /messages`

These would sit under `/services/apexrest/maidbright/v1` (custom Salesforce Apex REST).
A **native Salesforce Mobile SDK** bridge still has to be built for login (OAuth) and secure calls.
If you set `EXPO_PUBLIC_API_MODE` to anything other than `demo`, login is blocked on purpose so the app never pretends to be connected.

Details are in `docs/SALESFORCE_HANDOFF.md` and the original plan is in `docs/source-plan.md`.

---

## 7. Tests

- `tests/customer-api.test.ts`: checks the fake server's rules (cancel needs a reason, payment failure, slot conflict, …).
- `tests/demo-auth.test.ts`: checks login and sign-up validation.
- `scripts/web-smoke.mjs` and `scripts/responsive-smoke.mjs`: open a real browser with Playwright and click through the app at phone, tablet, and desktop sizes.

Commands:
```bash
npm test                 # unit tests
npm run check            # typecheck + lint + tests
npm run test:e2e         # browser test (needs `npm run web` running)
```

---

## 8. How to run it in a browser

```bash
cd maid-bright-poc
npm ci            # only the first time (node_modules is already there)
npm run web       # starts Expo and serves the web version
```
Then open **http://localhost:8081** and log in with `alex.morgan@example.com` / `MaidBright123!`,
or click **Explore the demo**.

Tip: make the browser window narrow or wide to see the phone, tablet, and desktop layouts.

---

## 9. One-line summary

> A clickable demo of a cleaning company's customer app (appointments, reschedule/skip/cancel, payments, messages,
> profile) that runs on phone and web, uses fake in-memory data, and is structured so that a real Salesforce backend can be plugged in later.
