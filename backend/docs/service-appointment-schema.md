# ServiceAppointment schema and Field Service configuration: MaidBrightDemo

Discovery report. Read-only: no records were created, updated, rescheduled, cancelled or deleted.
Source: metadata and SOQL against org `00Dfj00000Jmj6LEAR` (alias `MaidBrightDemo`), API v66.0, on 2026-10-20.
The queries ran as the integration user (System Administrator profile). Customer names, emails and addresses are left out on purpose.

Legend: **C** = createable, **U** = updateable, **REQ** = required (not nillable), **RO** = read-only.

---

## 1. Fields by category

### 1.1 Identity
| API name | Label | Type | C/U | Purpose |
|---|---|---|---|---|
| `Id` | Service Appointment ID | id | RO | Record ID |
| `AppointmentNumber` | Appointment Number | string(255), auto | RO | Human reference (SA-0001…) |
| `Subject` | Subject | string(255) | C U | Short title |
| `OwnerId` | Owner ID | reference → User/Group | C U REQ | Record owner |

### 1.2 Customer relationships
| API name | Label | Type | C/U | Purpose |
|---|---|---|---|---|
| `ParentRecordId` | Parent Record ID | reference → Account, Asset, Case, Lead, Opportunity, ProductServiceCampaignItem, **WorkOrder**, WorkOrderLineItem | **C only** (can't be changed) | The job this visit belongs to. There is no separate `WorkOrderId` field |
| `ParentRecordType` | Parent Record Type | string(50) | RO | `WorkOrder` or `Account` in this org |
| `AccountId` | Account ID | reference → Account | **RO** | Filled in by Salesforce from the parent. This is what the app filters on |
| `ContactId` | Contact ID | reference → Contact | C U | Customer contact |
| `Email`, `Phone` | Email, Phone | email(80), phone(40) | C U | Customer contact details on the visit (never filled in) |
| `ParentRecordStatusCategory` | Parent Record Status Category | picklist | RO | Status category of the parent Work Order |

### 1.3 Scheduling
| API name | Label | Type | C/U | Purpose |
|---|---|---|---|---|
| `EarliestStartTime` | Earliest Start Permitted | datetime | C U **REQ** | Start of the window the customer will accept |
| `DueDate` | Due Date | datetime | C U **REQ** | End of that window |
| `SchedStartTime` / `SchedEndTime` | Scheduled Start / End | datetime | C U | Booked visit time. Validation rules require **both or neither** |
| `ArrivalWindowStartTime` / `ArrivalWindowEndTime` | Arrival Window Start / End | datetime | C U | Arrival window promised to the customer |
| `Duration` | Duration | double | C U | Required by validation rule `isDurationExist` |
| `DurationType` | Duration Type | picklist [Hours, Minutes] | C U | Unit for `Duration` |
| `DurationInMinutes` | Duration in Minutes | double | RO | Calculated |
| `FSL__Duration_In_Minutes__c` | Scheduled Duration | formula | RO | Field Service formula |
| `ActualStartTime` / `ActualEndTime` / `ActualDuration` | Actual Start / End / Duration (Minutes) | datetime / double | C U | Set by the technician, not the customer app |
| `TimeZone` | Time Zone | picklist (IANA zones) | C U | Never filled in |
| `TravelTimeBuffer` | Travel Time Buffer (minutes) | int | C U | Not used |
| `FSL__Schedule_Mode__c` | Schedule Mode | picklist [Manual, Automatic, Optimization, None, Drag and Drop, Schedule, Global Optimization, In Day Optimization, Resource Optimization] | C U | How it was scheduled. `None` on every record today |
| `FSL__Scheduling_Policy_Used__c` | Scheduling Policy Used | reference → FSL__Scheduling_Policy__c | C U | Set by the scheduling engine. Empty today |
| `FSL__Pinned__c` | Pinned | boolean | C U | Stops optimization from moving the visit |
| `FSL__Auto_Schedule__c` | Auto Schedule | boolean | C U | Scheduled automatically when created |
| `FSL__Emergency__c` | Emergency | boolean | C U | Emergency handling |
| `FSL__Appointment_Grade__c` | Appointment Grade | double | C U | Quality score of the chosen time slot |
| `FSL__IsMultiDay__c`, `FSL__Same_Day__c`, `FSL__Same_Resource__c`, `FSL__Related_Service__c`, `FSL__Time_Dependency__c` [Same Start, Start After Finish, Finish Before Start] | – | various | C U | Multi-day and linked visits (3 validation rules apply) |

### 1.4 Status and lifecycle
| API name | Label | Type | C/U | Purpose |
|---|---|---|---|---|
| `Status` | Status | picklist | C U | Values (all active): **None** (default), Scheduled, Dispatched, In Progress, Cannot Complete, Completed, **Canceled** |
| `StatusCategory` | Status Category | picklist | **RO** | Derived: None, Scheduled, Dispatched, InProgress, CannotComplete, Completed, Canceled, CheckedIn |
| `FSL__InJeopardy__c` / `FSL__InJeopardyReason__c` | In Jeopardy / Reason | boolean / picklist [Delayed Start, Delayed Finish, No Response, Due Date Approaching] | C U | Dispatcher risk flag |

`ServiceAppointmentStatus` (read-only setup object) lists the same 7 statuses: None (default, 1) → Scheduled (2) → Dispatched (3) → In Progress (4) → Cannot Complete (5) → Completed (6) → Canceled (7).

### 1.5 Service details
| API name | Label | Type | C/U | Purpose |
|---|---|---|---|---|
| `WorkTypeId` | Work Type ID | reference → WorkType | C U | e.g. "Standard Home Cleaning" |
| *(Work Order)* | – | via `ParentRecordId` | C only | Work Order is the parent; there's no direct field |
| `Description` | Description | textarea(32000) | C U | Job description |
| `ServiceNote` | Service Note | textarea(32000) | C U | Technician's notes (never filled in) |
| `AdditionalInformation` | Additional Information | string(255) | C U | Never filled in. Could hold customer requests |
| `Comments` | Comment | string(255) | C U | Never filled in |
| `AppointmentType` | Appointment Type | picklist | C U | **No values defined** |

### 1.6 Address and service location
| API name | Label | Type | C/U | Purpose |
|---|---|---|---|---|
| `Street` | Street | textarea(255) | C U | |
| `City` | City | string(40) | C U | |
| `State` | State/Province | string(80) | C U | |
| `PostalCode` | Zip/Postal Code | string(20) | C U | |
| `Country` | Country | string(80) | C U | |
| `StateCode`, `CountryCode` | State Code, Country Code | picklist | C U | **State and country picklists are switched on.** Address updates must use valid codes (e.g. `TX`, `US`) |
| `Latitude`, `Longitude`, `GeocodeAccuracy` | – | double / picklist | C U | Geocoding, used for travel time |
| `Address` | Address | address (compound) | RO | Read-only combination of the fields above |
| `FSL__InternalSLRGeolocation__c` (+ `__Latitude__s`/`__Longitude__s`) | Internal SLR Geolocation | location | RO / C U | Internal to Field Service. Don't write |
| `IsOffsiteAppointment` | Offsite Appointment | boolean | C U | Not used |

### 1.7 Assigned resources and territory
| Item | Details |
|---|---|
| `ServiceTerritoryId` (Territory ID) | reference → ServiceTerritory, C U. Required by the policies' "Match Territory" rule |
| **AssignedResource** (child, relationship `ServiceResources`) | `ServiceAppointmentId`, `ServiceResourceId`, `IsRequiredResource`, `EstimatedTravelTime`. **This is how the assigned cleaner is stored** |
| ServiceResource | 1 active technician (`ResourceType = T`, not capacity-based), linked to a Salesforce user |
| ServiceTerritoryMember | 1 primary member of "Maid Bright - Dallas, TX" since 2026-08-13, no end date, no own operating hours |
| `RelatedBundleId`, `IsBundle`, `IsBundleMember`, `IsManuallyBundled`, `BundlePolicyId` | Appointment bundling. Not used |

### 1.8 Cancellation
| API name | Label | Type | C/U | Purpose |
|---|---|---|---|---|
| `Status` = `Canceled` | Status | picklist | C U | The cancelled state (value is active) |
| `CancellationReason` | Cancellation Reason | string(**255**) | C U | Free text. Never filled in today (SA-0005 was cancelled without a reason) |

### 1.9 Custom fields
- **No org-specific (non-namespaced) custom fields on ServiceAppointment.**
- All 31 custom fields come from the Field Service managed package (`FSL__`).
- Relevant to booking: `FSL__Pinned__c`, `FSL__Emergency__c`, `FSL__Auto_Schedule__c`, `FSL__Scheduling_Policy_Used__c`, `FSL__Schedule_Mode__c`, `FSL__Appointment_Grade__c`.
- Internal to the package, so the app **must not** write them: `FSL__Gantt*`, `FSL__Last_Updated_Epoch__c`, `FSL__UpdatedByOptimization__c`, `FSL__InternalSLRGeolocation__*`, `FSL__MDS_*`, `FSL__MDT_*`, `FSL__IsFillInCandidate__c`, `FSL__Use_Async_Logic__c`, `FSL__Virtual_Service_For_Chatter_Action__c`, `FSL__Prevent_Geocoding_For_Chatter_Actions__c`.
- Present but unrelated (Salesforce Scheduler and group events): `AppointmentInvitationId`, `EngagementChannelTypeId`, `AppointmentCategoryId`, `AttendeeLimit`, `AttendeeCount`, `AppointmentMode`, `GroupAppointmentAccessType`, `IsAnonymousBooking`, `ApptBookingInfoUrl`, `CheckedInTime`, `Transaction`, `ReceiptOrderId`.

---

## 2. What the existing records contain (7 Service Appointments)

| Appt | Status | Parent | Scheduled time | Arrival window | Territory | Work type | Address and geo | Duration |
|---|---|---|---|---|---|---|---|---|
| SA-0001 | None | WorkOrder (New) | – | – | ✓ | ✓ | ✓ | 3 h |
| SA-0002 | None | WorkOrder (New) | – | – | ✓ | ✓ | ✓ | 3 h |
| SA-0003 | None | WorkOrder (New) | – | – | ✓ | ✓ | ✓ | 3 h |
| SA-0004 | Completed | WorkOrder (Completed) | ✓ | ✓ | ✓ | ✓ | ✓ | 3 h, actuals set, 1 assigned resource |
| SA-0005 | Canceled | WorkOrder (Canceled) | – | – | ✓ | ✓ | ✓ | 3 h, **no cancellation reason** |
| SA-0006 | None | **Account** (no Work Order) | – | – | **✗** | **✗** | **✗** | 1 h |
| SA-0007 | None | **Account** (no Work Order) | – | – | **✗** | **✗** | **✗** | 1 h |

- **Filled in on every record:** `ParentRecordId/Type`, `AccountId`, `ContactId`, `EarliestStartTime`, `DueDate`, `Duration(+Type)`, `Status`/`StatusCategory`, `FSL__Schedule_Mode__c` (= None).
- **Filled in on the Work-Order-based records:** `Subject`, `Description`, `WorkTypeId`, `ServiceTerritoryId`, address and geocode.
- **Never filled in:** `CancellationReason`, `TimeZone`, `FSL__Scheduling_Policy_Used__c`, `FSL__Pinned__c`, `AdditionalInformation`, `Comments`, `Email`, `Phone`, `ServiceNote`.
- **SA-0006 and SA-0007** were created on 2026-10-16 directly under an Account. They have no territory, work type or address, so the scheduling engine can't place them, and the app shows an empty address.

---

## 3. Field Service configuration

### Relationships
```
Account (household) ─┬─ Contact
                     └─ WorkOrder (AccountId, ContactId, WorkTypeId, ServiceTerritoryId, Status)
                           └─ ServiceAppointment (ParentRecordId → WorkOrder; AccountId derived)
                                 └─ AssignedResource (ServiceAppointmentId, ServiceResourceId)
                                       └─ ServiceResource ── ServiceTerritoryMember ── ServiceTerritory ── OperatingHours ── TimeSlot
```

### Territory, hours and work type
| Item | Details |
|---|---|
| ServiceTerritory | 1 active: **Maid Bright - Dallas, TX**, operating hours *Maid Bright Dallas Service Hours* |
| OperatingHours | *Maid Bright Dallas Service Hours* (America/Chicago): Mon–Fri 08:00–18:00, Sat 09:00–15:00 |
| | *Maid Bright Arrival Windows* (America/Chicago): 2-hour windows Mon–Fri 08–10, 10–12, 12–14, 14–16 and Sat 09–11, 11–13. **Not linked to any territory, work type, member or Account.** Probably meant for arrival-window slots when booking |
| | *Base Calendar*, *Gold Appointments Calendar* (Asia/Kolkata): Field Service defaults, not used by Maid Bright |
| WorkType | 1: **Standard Home Cleaning**, 3 hours. Doesn't create appointments automatically. "Exact Appointments" is off. No own operating hours |
| ResourceAbsence | 0 |
| Org default time zone | Asia/Kolkata (the territory uses America/Chicago) |

### Scheduling policies (Field Service managed package)
| Policy | Work rules | Goals (weight) |
|---|---|---|
| Customer First | Earliest Start Permitted, Due Date, Resource Availability, Required Service Resource, Match Skills, Match Territory, Active Resources, Visiting Hours, Crew Availability, Scheduled Start, Scheduled End | Preferred Resource 4, ASAP 4, Minimize Travel 2, Resource Priority 1 |
| High Intensity | same 11 rules | Minimize Travel 7, ASAP 2, Preferred Resource 1 |
| Soft Boundaries | same, without Match Territory | Preferred Resource 4, ASAP 4, Minimize Travel 2, Resource Priority 1 |
| Emergency | Earliest Start, Due Date, Resource Availability, Match Territory, Active Resources, Crew Availability | – |

### Automation on ServiceAppointment, AssignedResource and WorkOrder
- **Triggers:** 17 active Field Service package triggers (before/after insert and update) on ServiceAppointment, AssignedResource and WorkOrder. Every update runs Field Service logic.
- **Flows:** no record-triggered flows on these three objects.
- **Active validation rules on ServiceAppointment:**
  - `Schedule_Start_Required` / `Schedule_End_Required`: scheduled start and end must be set together.
  - `isDurationExist`: `Duration` is required.
  - `Dont_allow_scheduled_or_dispatched`: a **new** appointment can't be created as Scheduled or Dispatched (controlled by a Field Service setting).
  - `Related_Service_with_time_dependency`, `Time_dependency_with_related_service`, `Same_Resource_Same_Start`: rules for linked visits.
  - `Service_Color_HEX_Format`: Gantt colour format.
- **Inactive rules:** `isDueDateExist`, `isEarliestStartTimeExist`, `startTimeShouldPrecedeEndTime`.
- **Field history:** `ServiceAppointmentHistory` records changes.

---

## 4. APIs for rescheduling, changing time and cancelling

| Option | What exists in the org | Fit for Maid Bright | Status |
|---|---|---|---|
| **A. Field Service scheduling engine (managed Apex)** | Global classes present: `FSL.AppointmentBookingService`, `FSL.AppointmentBookingSlot`, `FSL.GradeSlotsService`, `FSL.ScheduleService`, `FSL.ScheduleResult`, `FSL.OAAS` | **Recommended.** Gets real available arrival windows (policy, territory, availability, travel) and books with conflict checks | **Apex-only.** Needs a small custom Apex REST or invocable wrapper deployed to the org, plus Field Service permissions (see §6). Not tested |
| **B. Write fields directly** (`SchedStartTime`/`SchedEndTime`/`ArrivalWindow*`, `Status`, plus AssignedResource) | Standard REST (integration user has C/U) | Only for a manual "request a change, staff confirm" flow. **Doesn't check availability or conflicts** | Field permissions verified. What the triggers do is not tested |
| **C. Salesforce Scheduler actions** `saveAppointment`, `cancelAppointment` (standard invocable) | Present. `cancelAppointment` needs `recordId` + `cancelStatus`, optional `cancellationReason` | Built for Salesforce Scheduler, a separate product. **Not recommended** alongside Field Service scheduling | Scheduler licence 0/5 assigned. Not tested |

**Cancellation:**
- The fields exist and the integration user can write them: `Status = 'Canceled'` and `CancellationReason` (≤255 characters).
- **Not verified:** whether Field Service's status-transition rules (Field Service Admin → Service Appointment Life Cycle) allow *None → Canceled* and *Scheduled → Canceled*. These settings can't be read through the API.
- **Also not verified:** whether the parent Work Order is updated automatically. Today WO 00000005 is Canceled alongside SA-0005, but there's no record-triggered flow, so this may have been done by hand.

---

## 5. Fields the app needs

**To display appointments** (current query in brackets):
- `Id`, `AppointmentNumber` [✓]
- `Status` [✓]; `StatusCategory` [not yet]
- `WorkType.Name` [✓], `Subject` [✓]
- `SchedStartTime`/`SchedEndTime` [✓], `EarliestStartTime`/`DueDate` [✓]
- **`ArrivalWindowStartTime`/`ArrivalWindowEndTime` [missing]**: the time actually promised to the customer
- `Duration` + `DurationType` [not yet]
- `Street`/`City`/`State`/`PostalCode` [✓]
- `ServiceResources → ServiceResource.Name` [✓]
- **`ServiceTerritory.OperatingHours.TimeZone` [missing]**: needed to show local Dallas time. The app currently shows ET.
- `CancellationReason` [not yet]

**To cancel:**
- `Status` (→ `Canceled`) and `CancellationReason` (≤255).
- Read `StatusCategory` before changing anything, and only cancel from None or Scheduled.

**To reschedule or change the time:**
- Option A gets slots with `AppointmentBookingService.GetSlots` (policy + arrival-window operating hours), then books with `ScheduleService.schedule`.
- The engine then sets `SchedStartTime`/`SchedEndTime`, `ArrivalWindow*`, the AssignedResource, `Status` and `FSL__Scheduling_Policy_Used__c`.
- A customer "preferred window" request can instead update `EarliestStartTime`/`DueDate` (both required, writable) and let staff or the engine schedule it.

**The app must never write:**
- **Read-only:** `Id`, `AppointmentNumber`, `AccountId`, `ParentRecordType`, `ParentRecordStatusCategory`, `StatusCategory`, `DurationInMinutes`, `Address`, `AttendeeCount`, `FSL__Duration_In_Minutes__c`, `FSL__InternalSLRGeolocation__c`, and system audit fields.
- **Create-only:** `ParentRecordId`, `AppointmentMode`.
- **Writable but not the customer app's job:** `Actual*`, `ServiceNote`, `OwnerId`, `ServiceTerritoryId`, the internal `FSL__` fields in §1.9, and `AssignedResource` records. Those are for the scheduling engine, dispatcher or technician.

---

## 6. Missing configuration and permissions

1. **Field Service permission sets haven't been created.** No `FSL`-namespace permission sets (FSL Admin, Dispatcher, Resource, Agent permissions) exist in the org. Create them in the Field Service Admin app → Field Service Settings → Getting Started → Permission Sets.
2. **The integration user has no Field Service licence.** Available: Field Service Standard 0/10, Scheduling 0/2, Dispatcher 0/2. Assigned to this user: none. Option A will almost certainly need the Scheduling or Dispatcher licence plus a matching FSL permission set.
3. **No Apex wrapper exists** for `FSL.AppointmentBookingService` / `FSL.ScheduleService`. REST can't call them directly.
4. **The arrival-window operating hours aren't linked** to anything. Option A would pass them explicitly, or they need linking.
5. **SA-0006 and SA-0007 have no territory, work type or address**, so they can't be scheduled. Either fix the data, or decide whether appointments without a Work Order are allowed.
6. **Skills weren't inspected.** Policies include "Match Skills". Check that the work type and the resource have matching skill requirements.
7. **Status transitions aren't verified.** The Field Service life-cycle settings can't be read through the API. Check them in the Field Service Admin app, or test on a throwaway appointment.

---

## Appendix: all 104 ServiceAppointment fields (generated from `sobject describe`)

Long picklists (StateCode, CountryCode, TimeZone) are shortened to their value count.

| API name | Label | Type | Required | Create | Update | Custom | References / picklist |
|---|---|---|---|---|---|---|---|
| `Id` | Service Appointment ID | id(18) | yes |  |  |  |  |
| `OwnerId` | Owner ID | reference(18) | yes | yes | yes |  | → Group, User |
| `IsDeleted` | Deleted | boolean | yes |  |  |  |  |
| `AppointmentNumber` | Appointment Number | string(255) | yes |  |  |  |  |
| `CurrencyIsoCode` | Currency ISO Code | picklist(3) |  | yes | yes |  | USD |
| `CreatedDate` | Created Date | datetime | yes |  |  |  |  |
| `CreatedById` | Created By ID | reference(18) | yes |  |  |  | → User |
| `LastModifiedDate` | Last Modified Date | datetime | yes |  |  |  |  |
| `LastModifiedById` | Last Modified By ID | reference(18) | yes |  |  |  | → User |
| `SystemModstamp` | System Modstamp | datetime | yes |  |  |  |  |
| `LastViewedDate` | Last Viewed Date | datetime |  |  |  |  |  |
| `LastReferencedDate` | Last Referenced Date | datetime |  |  |  |  |  |
| `ParentRecordId` | Parent Record ID | reference(18) |  | yes |  |  | → Account, Asset, Case, Lead, Opportunity, ProductServiceCampaignItem, WorkOrder, WorkOrderLineItem |
| `ParentRecordType` | Parent Record Type | string(50) |  |  |  |  |  |
| `AccountId` | Account ID | reference(18) |  |  |  |  | → Account |
| `WorkTypeId` | Work Type ID | reference(18) |  | yes | yes |  | → WorkType |
| `ContactId` | Contact ID | reference(18) |  | yes | yes |  | → Contact |
| `Street` | Street | textarea(255) |  | yes | yes |  |  |
| `City` | City | string(40) |  | yes | yes |  |  |
| `State` | State/Province | string(80) |  | yes | yes |  |  |
| `PostalCode` | Zip/Postal Code | string(20) |  | yes | yes |  |  |
| `Country` | Country | string(80) |  | yes | yes |  |  |
| `StateCode` | State Code | picklist(10) |  | yes | yes |  | 384 values |
| `CountryCode` | Country Code | picklist(10) |  | yes | yes |  | 235 values |
| `Latitude` | Latitude | double |  | yes | yes |  |  |
| `Longitude` | Longitude | double |  | yes | yes |  |  |
| `GeocodeAccuracy` | Geocode Accuracy | picklist(40) |  | yes | yes |  | Address, NearAddress, Block, Street, ExtendedZip, Zip, Neighborhood, City, County, State, Unknown |
| `Address` | Address | address | yes |  |  |  |  |
| `Description` | Description | textarea(32000) |  | yes | yes |  |  |
| `EarliestStartTime` | Earliest Start Permitted | datetime | yes | yes | yes |  |  |
| `DueDate` | Due Date | datetime | yes | yes | yes |  |  |
| `Duration` | Duration | double |  | yes | yes |  |  |
| `ArrivalWindowStartTime` | Arrival Window Start | datetime |  | yes | yes |  |  |
| `ArrivalWindowEndTime` | Arrival Window End | datetime |  | yes | yes |  |  |
| `Status` | Status | picklist(40) |  | yes | yes |  | None, Scheduled, Dispatched, In Progress, Cannot Complete, Completed, Canceled |
| `SchedStartTime` | Scheduled Start | datetime |  | yes | yes |  |  |
| `SchedEndTime` | Scheduled End | datetime |  | yes | yes |  |  |
| `ActualStartTime` | Actual Start | datetime |  | yes | yes |  |  |
| `ActualEndTime` | Actual End | datetime |  | yes | yes |  |  |
| `ActualDuration` | Actual Duration (Minutes) | double |  | yes | yes |  |  |
| `DurationType` | Duration Type | picklist(255) |  | yes | yes |  | Hours, Minutes |
| `DurationInMinutes` | Duration in Minutes | double |  |  |  |  |  |
| `ServiceTerritoryId` | Territory ID | reference(18) |  | yes | yes |  | → ServiceTerritory |
| `Subject` | Subject | string(255) |  | yes | yes |  |  |
| `ParentRecordStatusCategory` | Parent Record Status Category | picklist(255) |  |  |  |  | New, InProgress, OnHold, Completed, Closed, None, CannotComplete, Canceled |
| `StatusCategory` | Status Category | picklist(255) |  |  |  |  | None, Scheduled, Dispatched, InProgress, CannotComplete, Completed, Canceled, CheckedIn |
| `ServiceNote` | Service Note | textarea(32000) |  | yes | yes |  |  |
| `AppointmentType` | Appointment Type | picklist(40) |  | yes | yes |  | (no values) |
| `Email` | Email | email(80) |  | yes | yes |  |  |
| `Phone` | Phone | phone(40) |  | yes | yes |  |  |
| `CancellationReason` | Cancellation Reason | string(255) |  | yes | yes |  |  |
| `AdditionalInformation` | Additional Information | string(255) |  | yes | yes |  |  |
| `Comments` | Comment | string(255) |  | yes | yes |  |  |
| `IsAnonymousBooking` | Anonymous Booking | boolean | yes | yes | yes |  |  |
| `RelatedBundleId` | Related Bundle ID | reference(18) |  | yes | yes |  | → ServiceAppointment |
| `IsManuallyBundled` | Manually Bundled | boolean | yes | yes | yes |  |  |
| `IsBundleMember` | Bundle Member | boolean | yes | yes | yes |  |  |
| `IsBundle` | Bundle | boolean | yes | yes | yes |  |  |
| `BundlePolicyId` | Appointment Bundle Policy ID | reference(18) |  | yes | yes |  | → ApptBundlePolicy |
| `IsOffsiteAppointment` | Offsite Appointment | boolean | yes | yes | yes |  |  |
| `ApptBookingInfoUrl` | Appointment Booking URL | textarea(4000) |  | yes | yes |  |  |
| `AppointmentInvitationId` | Appointment Invitation ID | reference(18) |  | yes | yes |  | → AppointmentInvitation |
| `EngagementChannelTypeId` | Engagement Channel Type ID | reference(18) |  | yes | yes |  | → EngagementChannelType |
| `AppointmentCategoryId` | Appointment Category ID | reference(18) |  | yes | yes |  | → AppointmentCategory |
| `CheckedInTime` | Checked In Time | datetime |  | yes | yes |  |  |
| `AttendeeLimit` | Attendee Limit | int |  | yes | yes |  |  |
| `AppointmentMode` | Appointment Mode | picklist(255) |  | yes |  |  | Regular, Group |
| `AttendeeCount` | Attendee Count | int |  |  |  |  |  |
| `GroupAppointmentAccessType` | Group Appointment Access Type | picklist(255) |  | yes | yes |  | AddedUsers, AddedAndCommunityUsers, AddedAndCommunityAndInvitedUsers |
| `Transaction` | Transaction | string(255) |  | yes | yes |  |  |
| `ReceiptOrderId` | Order ID | reference(18) |  | yes | yes |  | → Order |
| `TimeZone` | Time Zone | picklist(255) |  | yes | yes |  | 426 values |
| `TravelTimeBuffer` | Travel Time Buffer (in minutes) | int |  | yes | yes |  |  |
| `FSL__Appointment_Grade__c` | Appointment Grade | double |  | yes | yes | yes |  |
| `FSL__Auto_Schedule__c` | Auto Schedule | boolean | yes | yes | yes | yes |  |
| `FSL__Duration_In_Minutes__c` | Scheduled Duration | double formula |  |  |  | yes |  |
| `FSL__Emergency__c` | Emergency | boolean | yes | yes | yes | yes |  |
| `FSL__GanttColor__c` | Gantt Color | string(7) |  | yes | yes | yes |  |
| `FSL__GanttIcon__c` | Gantt Icon | textarea(2048) |  | yes | yes | yes |  |
| `FSL__GanttLabel__c` | Gantt Label | string(255) |  | yes | yes | yes |  |
| `FSL__Gantt_Display_Date__c` | Gantt Display Date | datetime |  | yes | yes | yes |  |
| `FSL__Gantt_Label_Details__c` | Gantt Label Details | string(255) |  | yes | yes | yes |  |
| `FSL__InJeopardyReason__c` | In Jeopardy Reason | picklist(255) |  | yes | yes | yes | Delayed Start, Delayed Finish, No Response, Due Date Approaching |
| `FSL__InJeopardy__c` | In Jeopardy | boolean | yes | yes | yes | yes |  |
| `FSL__InternalSLRGeolocation__Latitude__s` | Internal SLR Geolocation (Latitude) | double |  | yes | yes | yes |  |
| `FSL__InternalSLRGeolocation__Longitude__s` | Internal SLR Geolocation (Longitude) | double |  | yes | yes | yes |  |
| `FSL__InternalSLRGeolocation__c` | Internal SLR Geolocation | location |  |  |  | yes |  |
| `FSL__IsFillInCandidate__c` | Is Fill In Candidate | boolean | yes | yes | yes | yes |  |
| `FSL__IsMultiDay__c` | Is MultiDay | boolean | yes | yes | yes | yes |  |
| `FSL__Last_Updated_Epoch__c` | Last Updated Epoch | double |  | yes | yes | yes |  |
| `FSL__MDS_Calculated_length__c` | Multiday Work Calculated length | double |  | yes | yes | yes |  |
| `FSL__MDT_Operational_Time__c` | Multiday Work Operational Time | textarea(131072) |  | yes | yes | yes |  |
| `FSL__Pinned__c` | Pinned | boolean | yes | yes | yes | yes |  |
| `FSL__Prevent_Geocoding_For_Chatter_Actions__c` | Prevent Geocoding For Chatter Actions | boolean | yes | yes | yes | yes |  |
| `FSL__Related_Service__c` | Related Service | reference(18) |  | yes | yes | yes | → ServiceAppointment |
| `FSL__Same_Day__c` | Same Day | boolean | yes | yes | yes | yes |  |
| `FSL__Same_Resource__c` | Same Resource | boolean | yes | yes | yes | yes |  |
| `FSL__Schedule_Mode__c` | Schedule Mode | picklist(255) |  | yes | yes | yes | Manual, Automatic, Optimization, None, Drag and Drop, Schedule, Global Optimization, In Day Optimization, Resource Optimization |
| `FSL__Schedule_over_lower_priority_appointment__c` | Schedule Over Lower Priority Appointment | boolean | yes | yes | yes | yes |  |
| `FSL__Scheduling_Policy_Used__c` | Scheduling Policy Used | reference(18) |  | yes | yes | yes | → FSL__Scheduling_Policy__c |
| `FSL__Time_Dependency__c` | Time Dependency | picklist(255) |  | yes | yes | yes | Same Start, Start After Finish, Finish Before Start |
| `FSL__UpdatedByOptimization__c` | UpdatedByOptimization | boolean | yes | yes | yes | yes |  |
| `FSL__Use_Async_Logic__c` | Use Async Logic | boolean | yes | yes | yes | yes |  |
| `FSL__Virtual_Service_For_Chatter_Action__c` | Virtual Service For Chatter Action (SLR) | boolean | yes | yes | yes | yes |  |
