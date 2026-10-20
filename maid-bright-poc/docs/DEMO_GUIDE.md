# Login, sign-up, and screen sizes

1. Open **Log in** from Welcome. Use **Fill sample login**, then **Log in to demo account** to enter as Alex.
2. Sign out, choose **Sign up**, enter fictional personal details, and create a sample password of at least eight characters. Confirm the same password.
3. The dashboard greets the registered first name. Sign out and log in again with that account without reloading the app.
4. Reloading clears registered accounts. The seeded Alex login always remains available.
5. Resize the web view or rotate the device. Mobile content stacks, tablet content uses two columns, and wide desktop views use a left sidebar.
6. Test mismatched passwords, an existing email, or incorrect login credentials to see the validation messages.

# POC walkthrough

## Main customer journey

1. Start the app and tap **Explore the demo**.
2. On Home, open **View appointment**. Check the date, time, address, and permitted actions.
3. Choose **Reschedule cleaning**. Select a service-provided day and time, review, and confirm. The success view links to the updated request and appointments.
4. On another upcoming appointment, choose **Skip this visit**. Confirm that only that visit moves to Past & changes.
5. Request **Carpet cleaning** for a confirmed appointment. Select it, review the estimate, submit, then open **Your requests**. The appointment remains confirmed while the request is pending.
6. Go to **Profile → POC controls** and approve the pending request. Return to the appointment to see the additional service.
7. In **Payments**, open the due invoice. Tap **Pay with saved demo method**, then **Confirm demo payment**. Verify the receipt and payment history.
8. In **Messages**, send a fictional reply. It appears in the demo conversation; no external message is sent.
9. In **Profile → Your home**, update access instructions or cleaning notes. Save and view the updated information.
10. Change communication preferences, save, navigate away, then reopen to verify the session value.
11. Open the notification bell. Tap an unread update to navigate to its relevant screen.
12. Sign out and confirm. Re-enter to verify that edits and simulated payments have been cleared.

## Review path

1. Reset demo data, then enable **Staff review for changes** in POC controls.
2. Submit a reschedule request.
3. Verify the original appointment time is unchanged and another request is blocked.
4. Approve the request in POC controls. The appointment adopts the requested time.
5. Repeat with another visit and decline the request. Its original schedule remains intact.

## Error scenarios

| Control                       | Action                                      | Expected result                                                                                                            |
| ----------------------------- | ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Next slot becomes unavailable | Confirm a reschedule                        | Friendly conflict message, no changed appointment; choose another slot and retry                                           |
| Next payment fails            | Confirm a demo payment                      | Invoice stays due, no receipt created; retry succeeds                                                                      |
| Simulate offline              | Browse, refresh, and attempt edits          | Last loaded screens remain visible; transactional buttons are disabled and service calls return a friendly offline message |
| Cancellation eligibility      | Open the third upcoming appointment         | Cancellation is disabled; guidance directs the customer to messaging                                                       |
| Required reason               | Open a cancellation request                 | Review stays disabled until a reason is entered                                                                            |
| Profile validation            | Save an invalid email or incomplete address | Friendly validation message, no changes applied                                                                            |
| Duplicate pending request     | Submit another change for a visit in review | It is blocked until the earlier request is resolved                                                                        |
| Reset demo data               | Confirm reset                               | All fictional data and controls return to their initial state                                                              |

Use the controls only for POC demonstrations. Staff approval, communications, and payments are not connected to real services.
