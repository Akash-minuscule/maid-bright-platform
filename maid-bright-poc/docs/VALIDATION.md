# POC validation

Validated on 14 October 2026 with Node.js 24.19.0.

| Check                                                        | Result                                                                                         |
| ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------- |
| TypeScript strict compile (`tsc --noEmit`)                   | Passed                                                                                         |
| Expo ESLint                                                  | Passed                                                                                         |
| Service behavior suite                                       | 18 tests passed                                                                                |
| Android JavaScript/Hermes bundle export                      | Passed                                                                                         |
| iOS JavaScript/Hermes bundle export                          | Passed                                                                                         |
| Web bundle export                                            | Passed                                                                                         |
| SDK dependency version check                                 | Matched Expo's bundled compatibility data; remote React Native Directory check was unavailable |
| Chromium customer walkthrough against exported web build     | Passed                                                                                         |
| Basic horizontal overflow checks at 320, 768 and 1280 pixels | Passed                                                                                         |
| Uncaught browser exceptions in walkthrough                   | None                                                                                           |

The browser walkthrough used a 390 × 844 viewport and the app's back buttons and tab navigation. It covered demo entry, dashboard, reschedule and confirmation, review-required skip, simulated staff approval, skipped history, additional-service submission, invoice payment and receipt, local messaging, home instructions, preferences, offline read-only viewing, and sign-out/data reset. It also verified that returning from a completed appointment flow retains one tab navigator.

Service tests verified session gating and snapshot isolation; server-issued slots; conflict/retry behavior; pending-review semantics and duplicate-request blocking; skip scope; cancellation reason, eligibility and decline; additional-service validation and approval; payment failure and duplicate/concurrent payment prevention; offline rejection without data mutation; profile/preference/message changes; and logout with an in-flight request.

## Remaining validation

The exported iOS and Android bundles are **not compiled native apps**. No simulator or physical-device session, signed IPA/APK build, store submission, native Salesforce SDK binding, OAuth login, Field Service integration, payment processor, external communication delivery, production access-control check, or full accessibility audit was performed. Those require the corresponding native toolchains, devices, org configuration, and backend integration.

This validation establishes a functioning customer-experience POC with mock services. It does not establish production integration readiness.

## Version 0.2 authentication and layout checks

Seven new service tests verify the seeded login, normalized email, invalid credentials, registration validation, password confirmation, duplicate/concurrent registration, identity isolation, signup/login after logout, reset preserving identity, and registered-account lifetime.

The responsive browser suite verifies login and registration UI at all three screen sizes, wrong-password and confirmation errors, personalized dashboard greeting, successful login after sign-out, actual two-column versus stacked card placement, sidebar versus bottom navigation, appointment/detail/additional-service/payment/message/profile views, horizontal overflow, and resizing or rotation. Source formatting, strict TypeScript and lint also passed.

The customer walkthrough was repeated after the new screens and layouts were added. It passed appointment changes, requests and simulated staff approval, payment confirmation, messaging, profile edits, preferences, offline read-only display and data purge on sign-out.
