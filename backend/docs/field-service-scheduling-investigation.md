# Field Service scheduling: investigation and requirements gap analysis

Investigation only: no code, Salesforce data or configuration was changed.
Org: `MaidBrightDemo` (`00Dfj00000Jmj6LEAR`, Developer Edition, FSL package v262.0 Summer 2026), checked on 2026-10-20.
Related: [service-appointment-schema.md](./service-appointment-schema.md) and *Maid Bright – Detailed Requirements (Draft)*, Sep 28, 2026.

> **Main caveat:** `MaidBrightDemo` is **our demo developer org, not Maid Bright's production org.**
> The requirements doc *assumes* the client "already has Field Service fully licensed and configured" and lists
> "Can we get sandbox access to the current FSL config?" as an open question. Everything below describes the
> demo org. It shows what our design must support, not how Maid Bright schedules today.

---

## 1. How appointments are scheduled in this org today

**Conclusion: appointments are created and updated by hand (script or admin). The Field Service scheduling engine has never run here.**

| Evidence (read-only queries) | Result |
|---|---|
| `FSL__FSL_Operation__c` (the engine's operation log) | **0** |
| `FSL__Optimization_Request__c`, `FSL__Territory_Optimization_Request__c` | **0** |
| `FSL__UserSetting__c` (created when someone opens the Dispatcher Console) | **0** |
| ServiceAppointments with `FSL__Scheduling_Policy_Used__c` set | **0 of 7** |
| ServiceAppointments with `FSL__Schedule_Mode__c` ≠ `None` | **0 of 7** |
| `ServiceAppointmentHistory` rows other than "created" | **0** (no status or time changes were ever tracked) |
| Who created the records | All 7 by a System Administrator. SA-0001 to SA-0005 within 2 seconds (2026-10-12 12:34): **seed data** |
| SA-0004 (the only scheduled one) | Its AssignedResource was created **6 minutes later**, and the record was updated to *Completed* 2 minutes after that. **Set by hand**, not by the engine |
| The assigned cleaner | A ServiceResource linked to a different user, not the integration user |

### How records are linked
- **SA-0001 to SA-0005:**
  - `ParentRecordId` → **WorkOrder** (WO has Account, Contact, WorkType, ServiceTerritory).
  - `AccountId` and `ContactId` are filled in on the appointment.
  - The Work Order status matches (New / Completed / Canceled).
- **SA-0006 and SA-0007:**
  - `ParentRecordId` → **Account** directly.
  - **No Work Order, WorkType, ServiceTerritory, address or geocode.** The engine can't schedule them, because the policies require *Match Territory*.
- **AssignedResource:** only SA-0004 has one.

### Configuration state

| Item | Status in the demo org |
|---|---|
| Field Service enabled (`fieldServiceOrgPref`) | ✅ true |
| Enhanced Scheduling and Optimization (`o2EngineEnabled`, `optimizationServiceAccess`) | ✅ true. Scheduling calls go to the ESO service by callout |
| Service Appointment Life Cycle feature (`enableServiceAppointmentLifecycle`) | ❌ false |
| Service territory | ✅ 1 active (Dallas). Operating hours Mon–Fri 08:00–18:00, Sat 09:00–15:00 (America/Chicago) |
| Arrival-window operating hours | ⚠️ "Maid Bright Arrival Windows" (2-hour slots) exists but is **not linked** to any territory, work type, member or Account |
| Service resources | ⚠️ **1** active technician, primary member of Dallas since 2026-08-13 |
| Scheduling policies | ✅ 4 standard policies (Customer First, High Intensity, Soft Boundaries, Emergency) with work rules and goals. Never used |
| Scheduling recipes | 4 records (`FSL__SchedulingRecipe__c`). Not inspected further |
| **Blackout dates** (`Holiday`, `OperatingHoursHoliday`) | ❌ **0** |
| **Resource absences** | ❌ **0** |
| **Skills** (`Skill`, `SkillRequirement`, `ServiceResourceSkill`) | ❌ **0**. The "Match Skills" rule therefore has nothing to check |
| **Recurring work** (`MaintenancePlan`, `MaintenanceWorkRule`) | ❌ **0**. No recurrence configured |
| Capacity, resource preferences | ❌ 0 |
| **FSL permission sets** (Admin, Dispatcher, Agent, Resource, Self-Service) | ❌ **Not created** in the org |
| **Field Service licences** (permission set licences) | Standard 0/10, **Scheduling 0/2**, **Dispatcher 0/2**, Mobile 2/2. **None assigned to the integration user** |
| FSL global Apex classes | Present (`AppointmentBookingService`, `AppointmentBookingSlot`, `GradeSlotsService`, `ScheduleService`, `ScheduleResult`, `OAAS`, API 66). `IsValid=false` is common for managed classes not yet compiled in a subscriber org, so **callability is not verified** |

---

## 2. What the client explicitly requires (from the requirements doc)

- Customers can see upcoming and past visits, and can **request** a skip, reschedule or cancellation.
- Availability shown to customers must **"reflect live Field Service scheduling/optimization output, not a cached snapshot"**, using real crew availability, service areas and blackout dates. Never a slot the business can't honour.
- **"Conflicts, recurring appointments, blackout dates, service areas, and cancellation deadlines are driven by Field Service's own Scheduling Policies, Service Territories, and Operating Hours — not duplicated in app-side logic."**
- **Real-time two-way sync:** reschedule, skip and cancel write straight to the matching Service Appointment / Work Order. Changes appear immediately on the office side.
- **Maid Bright decides** which changes are self-service and which need office review ("auto-apply vs. staff-review cutoff", an open question for the client).
- Customers can request extra services (carpet, upholstery).
- Field Service stays the system of record. Access is only through Salesforce APIs, via headless middleware (AWS).
- Also relevant: existing customers are matched to Contact/Account **by email or phone, with dedupe**. **MFA is required** for portal login.

---

## 3. Requirements gap analysis

Classification: **✅ Implemented and verified** · **🟡 Partial** · **❌ Not implemented** · **⛔ Blocked** (configuration, licence or decision) · **❓ Unknown**.
"Verified" means against the real demo org unless marked *(automated tests)*.

| Feature | Status | Evidence and notes |
|---|---|---|
| View upcoming and past appointments | ✅ / 🟡 | Real SOQL verified against the org. The backend is covered by automated tests. The **UI hasn't been checked in a browser**. Shows the household's (Account's) visits |
| View the real arrival window | ✅ / 🟡 | Field read and shown in Dallas time. Only SA-0004 has one; real values are confirmed for that record |
| Retrieve live available slots | ⛔ | Needs `FSL.AppointmentBookingService.getSlots` via an Apex wrapper, plus FSL permission set and licence. Blackout dates, absences and skills aren't configured, so results would only reflect hours, territory and the single resource |
| Request a skip | ❌ / ⛔ | No native "skip" in Field Service. Depends on how recurrence is modelled (none configured) and on the policy decision |
| Request a cancellation | ❌ | Fields are writable (`Status=Canceled`, `CancellationReason` ≤255). Whether the cancel goes straight through or to office review is ⛔ a policy decision. The **cancellation deadline** has no native Field Service field (none found in the org), so ❓ ask how the client wants it enforced |
| Request or perform a reschedule | ❌ / ⛔ | A direct reschedule needs `getSlots` + `ScheduleService.schedule` (blocked as above). A "request" path needs no engine |
| Self-service vs. office approval | ⛔ | Business decision pending (in the client's open-clarifications table) |
| Sync with Salesforce and Field Service | 🟡 | Reads are live, and onboarding writes Account/Contact live and verified. No appointment writes yet |
| Recurring appointments, blackout dates, conflicts | ⛔ / ❓ | None configured in the demo org. Conflict prevention only exists when the engine books. Direct field writes skip it |
| Customer-level data isolation | ✅ | The backend filters by the session's Account. Covered by automated tests (cross-customer case). The SOQL was verified against the org |
| Failures and the authoritative result | 🟡 | Read errors are mapped and Salesforce errors surfaced. No write flow yet, so there's no read-back of the result |
| Additional services | ❌ / ❓ | Data model not decided (Work Order Line Items? extra Work Orders?) |
| Match by phone with dedupe, MFA | ❌ | Current login matches by email + OTP only, with no MFA. Out of scope here, noted for completeness |

---

## 4. Scheduling engine: what is documented

The pages below are official Salesforce docs. Their text could only be read through search summaries (direct fetch returns HTTP 403), so **every signature must be confirmed by compiling against the org** before we rely on it.

| Need | Documented operation | Notes |
|---|---|---|
| **Get available slots** | `FSL.AppointmentBookingService.getSlots(Id serviceId, Id policyId, Id/OperatingHours calendar, System.TimeZone tz, [String sortBy,] Boolean exactAppointment)` → `List<FSL.AppointmentBookingSlot>` | Applies the policy's work rules and goals. `calendar` = the arrival-window operating hours. Returns slots in `tz`. **Doesn't book anything**. The work type's exact-appointment flag is ignored ([docs](https://developer.salesforce.com/docs/atlas.en-us.field_service_dev.meta/field_service_dev/apex_class_FSL_AppointmentBookingService.htm)) |
| Grade slots per resource | `new FSL.GradeSlotsService(policyId, serviceAppointmentId).getGradedMatrix(Boolean resultsInUserTimeZone)` | Synchronous with ESO (enabled here). Similar to the "Candidates" action ([docs](https://developer.salesforce.com/docs/atlas.en-us.field_service_dev.meta/field_service_dev/apex_class_FSL_GradeSlotsService.htm)) |
| **Book or reschedule** | `FSL.ScheduleService.schedule(Id policy, Id serviceId)` → `FSL.ScheduleResult` (null when no slot) | One appointment per call. With ESO it makes a **callout**, so **no DML earlier in the same transaction**. The documented flow is: customer picks a slot → set `ArrivalWindowStartTime/EndTime` → call `schedule` ([docs](https://developer.salesforce.com/docs/atlas.en-us.264.0.field_service_dev.meta/field_service_dev/apex_class_FSL_ScheduleService.htm)) |
| Permissions | The running user needs one of the managed permission sets: **FSL Admin, Dispatcher, Agent or Self-Service**. FSL Agent is the documented one for booking ([namespace docs](https://developer.salesforce.com/docs/atlas.en-us.262.0.field_service_dev.meta/field_service_dev/apex_namespace_FSL.htm)) | Which permission set **licence** goes with Agent or Dispatcher in this org is ❓. Expected: Scheduling or Dispatcher, both 0/2 available |
| Optimization | `FSL.OAAS` | Bulk or territory optimization. Not needed for customer self-service |

**How the rules are applied:**
- The engine applies the chosen **scheduling policy's work rules**: earliest start and due date, resource availability, territory, skills, visiting hours, and scheduled start and end.
- It uses the **territory and member operating hours**, **resource absences**, **holidays**, and **travel time** (ESO).
- **Double-booking** is avoided only when the engine books, because `schedule` re-checks availability at booking time and returns null if the slot is gone.
- Writing `SchedStartTime`/`SchedEndTime` directly **skips all of these checks**.

**The integration user can't do any of this today:** there's no FSL permission set (none exist), no Field Service licence, and REST can't call Apex. An Apex REST wrapper is needed.

---

## 5. Recommended architecture

```
React Native / web app
  │  (cookie session; never Salesforce IDs or credentials)
  ▼
Node/TypeScript backend  ── authorizes every call: appointment must belong to the session's Account (and Contact, if decided)
  │                        ── applies Maid Bright's self-service vs. approval policy
  │                        ── re-reads the appointment after every write and returns Salesforce's state
  ├─ Standard REST: SOQL reads, Case/request creation, cancel field updates, arrival-window update
  └─ Apex REST wrapper (deployed to Salesforce, called as the integration user with the FSL Agent/Dispatcher permission set)
        /maidbright/v1/slots     → FSL.AppointmentBookingService.getSlots (read-only)
        /maidbright/v1/schedule  → FSL.ScheduleService.schedule (books; result or "no longer available")
```

**Apex wrapper:**
- Keep it **thin**: no business policy and no authorization decisions. Only Field Service calls, input checks, and an ownership check that confirms the appointment belongs to the Account the backend passes in (a second line of defence).
- Return data with the IDs stripped, and errors as codes.

**Booking sequence (to verify in a sandbox):**
1. The backend requests slots and shows only those.
2. The customer picks one, and the backend sets the arrival window on the appointment (transaction 1, REST).
3. The backend calls `schedule` (transaction 2, so ESO's callout doesn't follow DML).
4. If `schedule` returns null, the backend restores the previous window and tells the customer the slot was just taken.
5. The backend re-reads the appointment and reports the authoritative result.

**Office-approval path (when the policy requires review):**
- The backend creates a **request record** in Salesforce, for example a Case of type "Appointment change request" linked to the Contact, Account and appointment. The appointment itself is **left unchanged**.
- The app shows "Requested – awaiting confirmation" and keeps showing the appointment's real current time.
- Office staff act in Salesforce (Dispatcher Console or the engine). The app shows the change only once the appointment really changes.
- Which object to use (Case or a custom object) is a client decision.

**Cancel:**
- REST update of `Status=Canceled` and `CancellationReason`, only from None or Scheduled, followed by a read-back.
- Two things to confirm in a sandbox: what the 17 FSL triggers do, and whether the parent Work Order should change too.

**Skip:**
- Only meaningful once recurrence is modelled (maintenance plans or a recurring Work Order pattern).
- Until then, "skip" = cancel this one visit with reason "Skipped by customer", or a request record.

**Never:** compute availability in the backend, or show times that didn't come from `getSlots`.

---

## 6. Implementation plan (ordered by dependency)

| # | Phase | Depends on | Content |
|---|---|---|---|
| 0 | **Clarify with the client and get access** | none | Answers to §7. **Sandbox access to Maid Bright's real FSL config**, the main dependency, because the demo org isn't theirs |
| 1 | **Finish read-only** | none | Check list and detail in the browser. Decide Account vs. Contact scope. Fix seed data (SA-0006/0007 have no territory or work type) |
| 2 | **Field Service configuration and access spike** (demo org first, then client sandbox) | 0 | Create the FSL permission sets (Field Service Admin app). Assign the Agent or Dispatcher permission set plus a Scheduling or Dispatcher licence to the integration user. Link the arrival-window hours. Add a holiday and an absence for realism. **Then run `getSlots` once from anonymous Apex** for a test appointment, to confirm signatures, permissions and results |
| 3 | **Request workflow** (office approval) | 0 (decision), 1 | Cancel, skip and reschedule requests as request records. Works without the engine, so it can ship before phase 4 |
| 4 | **Live availability** | 2 | Apex `slots` wrapper, a backend endpoint with ownership checks, and a UI that shows real slots |
| 5 | **Direct reschedule or booking** (only where policy allows) | 2, 4 | `schedule` wrapper, the two-step sequence above, conflict handling, read-back |
| 6 | **Direct cancel** (if allowed) | 0 (policy, deadline), sandbox check of transitions and triggers | Status and reason update, deadline rule, Work Order handling, read-back |

---

## 7. Questions for the client

1. **Self-service vs. review:** which of reschedule, skip and cancel apply automatically, and within which time limits (e.g. no self-service change within 48 h)?
2. **Cancellation deadline and fees:** what's the rule? Field Service has no native deadline field, so where should it live (a Salesforce validation rule or flow, or the backend)?
3. **Recurrence:** how are repeat visits created today (maintenance plans, a scheduled job, staff by hand)? What does "skip" mean in their model?
4. **Scheduling today:** do dispatchers use the Dispatcher Console, auto-scheduling or optimization? Which scheduling policy, and which arrival-window hours?
5. **Sandbox access** to the production FSL configuration, and to the integration user's licences.
6. **Licences:** can one Field Service Scheduling or Dispatcher licence be assigned to the integration user?
7. **Requests:** where should change requests live (Case, a custom object, existing Appointment Assistant flows)? Who handles them?
8. **Visibility:** should every Contact on a household Account see all of its visits, or only their own?
9. **Work Order:** when a visit is cancelled, should its Work Order be cancelled too?
10. **Additional services:** how are carpet and upholstery modelled (Work Order Line Items, separate Work Orders)?

---

## 8. Next concrete task

**Phase 2 spike, in the demo org, with your approval** (it changes configuration, so it was not done here):
1. In the Field Service Admin app, create the FSL permission sets.
2. Assign *FSL Agent* (or Dispatcher) plus one Field Service Scheduling licence to the integration user.
3. Link "Maid Bright Arrival Windows" for use as the booking calendar.
4. Run `FSL.AppointmentBookingService.getSlots` once from anonymous Apex for SA-0002, and record the exact signature and the slots returned.

This settles the biggest unknown: whether live availability works with this org and user. Phase 3 (request workflow) can run alongside it once the client answers questions 1, 7 and 8.

---

### What was run (all read-only)
- **SOQL counts and lists:**
  - Engine traces: Holiday, OperatingHoursHoliday, ResourceAbsence, Skill, SkillRequirement, ServiceResourceSkill, MaintenancePlan, MaintenanceWorkRule, ServiceResourceCapacity, ResourcePreference, FSL__FSL_Operation__c, FSL__Optimization_Request__c, FSL__UserSetting__c, FSL__SchedulingRecipe__c.
  - ServiceAppointment engine fields and history; creator profile and timestamps of appointments and AssignedResource.
- **Tooling:** FSL ApexClass metadata, InstalledSubscriberPackage.
- **Metadata retrieve:** `Settings:FieldService` (to a local scratch folder).
- **Object list:** `sf sobject list` (FSL custom objects).
- **Documentation:** web search of the official Field Service Developer Guide. Direct page fetch was blocked (HTTP 403).
- Earlier read-only results reused from `service-appointment-schema.md`.
