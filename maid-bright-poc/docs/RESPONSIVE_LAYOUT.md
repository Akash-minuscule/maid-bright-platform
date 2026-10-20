# Mobile, tablet, and web layout

One React Native codebase adapts to the window's logical width and updates when the window is resized or the device rotates.

| Layout      | Width          | Navigation                     | Content                                                                                    |
| ----------- | -------------- | ------------------------------ | ------------------------------------------------------------------------------------------ |
| Mobile      | Below 768      | Bottom tabs                    | Stacked authentication, dashboard, lists, and forms                                        |
| Tablet      | 768–1199       | Bottom tabs with larger labels | Authentication illustration beside form; two-column dashboard, cards, and profile sections |
| Desktop web | 1200 and above | Left sidebar                   | Two-column content with a wider reading area and capped form widths                        |

The app configuration uses `orientation: default` and retains iOS tablet support. A landscape tablet can switch layout as its logical width crosses a breakpoint. These are layout breakpoints, not device or browser detection.

`useResponsive` supplies breakpoints, gutters, and reading widths. `ResponsiveGrid` wraps cards using their available container width. Large system font scaling collapses grids back to one column. Forms and conversations use a narrower content cap for readability. The customer tab navigator remains the same when layout position changes.

## Authentication

Welcome, login, and sign-up pages use `AuthLayout`. Mobile stacks the content. Wider screens place an illustration and introductory copy next to the form. Password inputs support show/hide, confirmation is checked, and errors are readable on every layout.

## Browser checks

With the app running, install Chromium and execute:

```bash
npx playwright install chromium
npm run test:responsive
```

The suite uses mobile 390×844, tablet 820×1180, and desktop 1440×1000 viewports. It checks invalid login, registration validation, successful registration, logout/re-login, dashboard and list column placement, sidebar/bottom-tab placement, customer screens, horizontal overflow, and resized or rotated layouts.

For an exported build, set `POC_STATIC_DIR=dist` before running the same test. The test serves exported files through browser request interception under an HTTPS origin so Web Crypto is available.

Native bundles are checked separately. Physical device, native keyboard, safe-area, and full accessibility testing still require actual devices or simulators.
