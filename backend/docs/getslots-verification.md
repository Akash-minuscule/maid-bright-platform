# Verifying `FSL.AppointmentBookingService.GetSlots`: readiness report

Org `MaidBrightDemo` (Developer Edition, FSL v262.0). Checked 2026-10-20.
**No Salesforce data, configuration, permissions or licences were changed. `GetSlots` and `ScheduleService` were not called.**
The only Apex run was compile-only or dry-run Anonymous Apex, in which the `GetSlots` line is never reached.

Legend: ✅ **verified** (evidence from this org) · 📄 **documented** (official docs, read through search summaries; direct fetch returned HTTP 403) · ❓ **unverified**.

---

## 1. `GetSlots` signature: ✅ verified

**Evidence:**
1. **The installed package's generated API stub.** `SELECT Body FROM ApexClass WHERE NamespacePrefix='FSL' AND Name='AppointmentBookingService'` returns Salesforce's generated, read-only stub of the global API.
2. **A compile check as the integration user.** The call, with the return type and slot fields, inside an `if (false)` branch compiled and ran: `Compiled successfully. Executed successfully.`. `Type.forName('FSL','AppointmentBookingService')` returned `true`.
3. **A control.** A deliberately wrong 4-argument call failed with `executeCompileFailure`.

**Overloads, all `global static`, so no instance is needed:**
```apex
List<FSL.AppointmentBookingSlot> GetSlots(Id serviceID, Id policyId, Id operatingHoursID, System.TimeZone tz, Boolean exactAppointment)   // ← recommended
List<FSL.AppointmentBookingSlot> GetSlots(Id serviceID, Id policyId, OperatingHours calendar, System.TimeZone tz, Boolean exactAppointment)
List<FSL.AppointmentBookingSlot> GetSlots(Id serviceID, Id policyId, OperatingHours calendar, System.TimeZone tz, FSL.AppointmentBookingService.SortResultsBy sortResults, Boolean exactAppointment)  // enum: Grade, NoSort, SLotDateTime
List<FSL.AppointmentBookingSlot> GetSlots(Id serviceID, Id policyId, OperatingHours calendar, System.TimeZone tz, String sortBy, Boolean exactAppointment)
FSL.ABSlotsResponse            GetABSlots(Id serviceID, Id policyId, OperatingHours calendar, System.TimeZone tz, String sortBy, Boolean exactAppointment)
@InvocableMethod(label='AppointmentBooking GetSlots')
List<AppointmentBookingSlotWrapper> GetSlots(List<AppointmentBookingParamsWrapper> ABParams)
```

**Return type:** `FSL.AppointmentBookingSlot` with these fields (✅):
- `Interval` (`FSL.TimeInterval` with `Datetime Start`, `Datetime Finish`),
- `Decimal Grade`,
- `List<FSL.GradeSlotResult> BestSlotGrades`.

**Parameters for Maid Bright:**

| Parameter | Value | Basis |
|---|---|---|
| `serviceID` | An **existing ServiceAppointment** ID. The appointment's own data drives the search: earliest start, due date, duration, territory, location | ✅ the parameter name; 📄 docs describe it as the service appointment |
| `policyId` | `FSL__Scheduling_Policy__c` ID, e.g. *Customer First* | ✅ |
| `operatingHoursID` | The **arrival-window calendar**: *Maid Bright Arrival Windows* (2-hour slots, America/Chicago) | ✅ exists; 📄 used as the booking calendar |
| `tz` | `TimeZone.getTimeZone('America/Chicago')` | 📄 slots come back expressed in `tz`. The calendar's own time zone is ignored |
| `exactAppointment` | **`false`**: customers get arrival windows, not exact start times | 📄 overrides the work type's exact-appointment flag |

**Usable through REST without deploying Apex** (✅ described in this org, **not invoked**):
- `POST /services/data/v66.0/actions/custom/apex/FSL__AppointmentBookingService`
  - Inputs: `serviceID`, `policyId`, `calendarId` (required), `tz` (**String**, required), `sortBy`, `exactAppointment`.
  - Outputs: `SlotStart`, `SlotFinish`, `Grade`.
- A booking action, `FSL__ScheduleServiceProcess` ("ScheduleServiceAppointments"), also exists. Its REST description lists **no inputs**. It was not investigated further or called.

This corrects the earlier investigation, which assumed a custom Apex wrapper was *required*. The standard REST invocable may be enough for slots.

**Transaction and callout behaviour:**
- 📄 With Enhanced Scheduling and Optimization (ESO), the scheduling calls go to the ESO service by callout, so no DML can come earlier in the same transaction.
- ✅ **ESO is enabled for the org (`o2EngineEnabled=true`) but *not* on the Dallas territory (`FSL__O2_Enabled__c = false`).** That suggests this territory uses the standard (non-ESO) engine.
- ❓ Whether `GetSlots` makes a callout or writes internal records here is unverified. The test script measures both.

---

## 2. Permissions and licences

| Item | Finding | Basis |
|---|---|---|
| Managed permission set required | One of **FSL Admin, Dispatcher, Agent or Self-Service**. FSL Agent is the documented choice for booking | 📄 |
| Those permission sets in this org | **Not created** (no `FSL`-namespace permission sets exist) | ✅ |
| FSL custom permissions held by the integration user | **All 70** (e.g. `Agent_Schedule`, `Schedule`, `Policy_Picker_In_Appointment_Booking`), through the System Administrator profile | ✅ |
| Apex class visible and callable by that user | Visible and compiles ✅. Runtime licence enforcement ❓ | ✅ / ❓ |
| Licence (PSL) for FSL Agent | ❓ **Unverified.** Candidates: *Field Service Scheduling* (0/2 used) or *Dispatcher* (0/2). The Field Service Admin app shows the required licence when it creates the permission sets | ❓ |
| Integration user's Field Service licences | **None** | ✅ |
| Anonymous Apex running user | `sf apex run` runs as the CLI-authenticated user, **the same user as the integration user** (useradoptiontest). The test therefore checks the integration user's own access | ✅ |
| ESO external access | `optimizationServiceAccess=true`. The territory isn't ESO-enabled, so ❓ ESO is probably not involved for Dallas | ✅ / ❓ |

**Integration-user readiness:** it has the custom permissions and full object access through the admin profile, but **no Field Service licence and no FSL managed permission set**. Whether the engine refuses this user at runtime is the main open question. The test answers it directly: either slots come back, or there's an error naming the missing licence or permission.

---

## 3. Is SA-0002 suitable? ✅ Yes, data-wise, until its window passes

| Requirement | SA-0002 |
|---|---|
| Parent / customer | Work Order ✅ (Account and Contact set) |
| Work type, duration | Standard Home Cleaning, **3 hours** ✅ |
| Earliest start → due date | **2026-10-21 13:00 → 2026-10-23 23:00 UTC** (Wed 08:00 → Fri 18:00 Dallas). Still in the future ✅, but **it expires on Oct 23** |
| Status | None (unscheduled), not pinned, not multi-day, no arrival window, no assigned resource ✅ |
| Territory | Maid Bright – Dallas, TX, active, geocoded ✅. Territory hours Mon–Fri 08–18, Sat 09–15 |
| Location | Geocoded ✅ |
| Arrival calendar | *Maid Bright Arrival Windows*: Wed–Fri 08–10, 10–12, 12–14, 14–16 ✅ |
| Resources | 1 technician: active, active user, primary member since 2026-08-13, home base geocoded ✅. Has the Field Service Mobile licence. **`IsOptimizationCapable = false`** ❓ (matters for optimization; whether booking is affected is unverified) |
| Conflicts in window | 0 bookings ✅ |
| Absences, holidays, skills | None, so nothing restricts slots ✅ |
| Policy | *Customer First*: Match Territory, availability, skills (none), earliest/due date, visiting hours (Account has no visiting hours → no restriction) ✅ |

**What to expect:** with one free technician, arrival windows of 2 hours and a 3-hour job, one or more windows on Wed–Fri should be returned, if the engine and licensing allow it. ❓ This is a prediction, not a verified result.

**After Oct 23**, SA-0002 can't be used. Prepare a **disposable test appointment** under a test Work Order with:
- the same Account, territory and work type,
- duration 3 h,
- earliest start / due date a few days ahead,
- status None.

Don't reuse a customer's real visit. (Not created, per instructions.)

---

## 4. Read-only test script

File: [`getslots-readonly-test.apex`](./getslots-readonly-test.apex).

- Finds the appointment, policy and calendar **by name**, with no hard-coded IDs.
- Refuses to run if the appointment isn't unscheduled or its window has passed.
- Calls only `GetSlots(serviceId, policyId, operatingHoursId, tz, false)`, inside a **savepoint that is always rolled back**.
- Prints the slot count, start/finish and grade, plus how many **DML statements and callouts** the engine used, and the time taken.
- Never calls `ScheduleService`, and prints no customer personal data.
- **Dry run already done (`EXECUTE = false`): compiled and executed; all inputs resolve.**

**Known risk:** if the engine makes a callout *after* the savepoint, Salesforce raises "You have uncommitted work pending". That would itself prove the engine calls out. Don't remove the savepoint to work around it without a separate decision.

### How to run
```powershell
cd C:\Users\AkashBabu\Downloads\maid-bright-poc-responsive
sf apex run --file backend/docs/getslots-readonly-test.apex -o MaidBrightDemo | Select-String MB_TEST
```

### How to read the result
| Output | Meaning | Next step |
|---|---|---|
| `slots returned: N` (N > 0), `DML…=0 callouts=0` | **The engine works for the integration user**, read-only | Check the times (next row), then try the REST invocable |
| Slot times like `…08:00 → …10:00` | Values are **Dallas wall time** expressed as GMT, per the docs | The backend must convert from `tz` to real UTC |
| Slot times like `…13:00 → …15:00` | Values are **true UTC** | No conversion needed |
| `slots returned: 0` | Engine runs, but finds nothing | Check `IsOptimizationCapable`, territory membership, calendar vs. territory hours, policy rules |
| `FAILED: …licen…` / `…permission…` / `…not authorized…` | **The licence or FSL permission set is enforced** | Phase 2: create the FSL permission sets and assign Agent (or Dispatcher) plus the licence the admin app names |
| `FAILED: …uncommitted work pending…` | The engine makes a callout | Re-plan the transaction design (REST invocable has no savepoint) |
| `DML statements > 0` | The engine writes internally (rolled back here) | The REST call would persist those writes. Record this as a known side effect |
| `SKIPPED: window has passed` | SA-0002 has expired | Use a disposable test appointment |

**Optional second step, only after the Apex test succeeds with DML=0:** call the REST invocable with the same values. It has no savepoint, which is why it comes second.

---

## 5. Uncertainties

1. Whether the engine enforces a Field Service licence or the managed permission set at runtime for a System Administrator.
2. Which licence the FSL Agent permission set needs (Scheduling or Dispatcher).
3. How the returned times are encoded (Dallas wall time vs. true UTC).
4. Whether `GetSlots` makes callouts or internal DML in this territory (it isn't ESO-enabled).
5. Whether `IsOptimizationCapable=false` excludes the technician from appointment booking.
6. The input contract of the `FSL__ScheduleServiceProcess` action.

## 6. Recommended next action

**Run the read-only test above, before SA-0002's window passes (by 2026-10-23).** It changes nothing and answers uncertainties 1, 3, 4 and 5 in one go.
- **If it succeeds:** live availability works for the integration user, and Phase 4 (slots in the app) can start using the REST invocable, with no Apex deployment needed.
- **If it fails on licensing or permissions:** do the Phase 2 configuration (with your approval), then re-run the same script.
