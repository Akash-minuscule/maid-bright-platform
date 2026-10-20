// Maid Bright: READ-ONLY Field Service availability test, policy comparison run ("Emergency").
// Identical to getslots-readonly-test.apex except POLICY_NAME. Diagnostic only: the Emergency policy
// is not meant for customer booking.
//
// What it does: looks up the test appointment, policy and arrival-window calendar by name, asks the
// Field Service engine for available arrival windows, and prints them.
// What it never does: book, schedule, assign, or update anything. It doesn't call FSL.ScheduleService
// and performs no DML of its own.
//
// No savepoint: GetSlots makes HTTP callouts, and Apex can't roll back to a savepoint set before a
// callout ("Attempted to rollback in another transaction, probably after a callout"). Instead, when
// GetSlots runs, the script always ends with an uncaught exception, so Salesforce discards the whole
// transaction and nothing is committed. Expect the run to report MbTestAbortException; that is the
// normal result. Callouts themselves are external requests and can't be undone by any rollback.
//
// Run as the integration user:
//   sf apex run --file backend/docs/getslots-readonly-test-emergency.apex -o MaidBrightDemo | findstr MB_TEST
// Set EXECUTE = false for a dry run (only the read-only lookups run; GetSlots isn't called).

class MbTestAbortException extends Exception {}

Boolean EXECUTE = true;
String APPOINTMENT_NUMBER = 'SA-0002';
String POLICY_NAME = 'Emergency';
String ARRIVAL_CALENDAR_NAME = 'Maid Bright Arrival Windows';
String TZ_NAME = 'America/Chicago';
String FMT = 'yyyy-MM-dd HH:mm';

ServiceAppointment sa = [
    SELECT Id, AppointmentNumber, StatusCategory, EarliestStartTime, DueDate, ServiceTerritoryId, Duration, DurationType
    FROM ServiceAppointment WHERE AppointmentNumber = :APPOINTMENT_NUMBER LIMIT 1
];
FSL__Scheduling_Policy__c policy = [SELECT Id FROM FSL__Scheduling_Policy__c WHERE Name = :POLICY_NAME LIMIT 1];
OperatingHours calendar = [SELECT Id, TimeZone FROM OperatingHours WHERE Name = :ARRIVAL_CALENDAR_NAME LIMIT 1];
TimeZone tz = TimeZone.getTimeZone(TZ_NAME);

System.debug('MB_TEST appointment=' + sa.AppointmentNumber + ' statusCategory=' + sa.StatusCategory
    + ' duration=' + sa.Duration + ' ' + sa.DurationType + ' territorySet=' + (sa.ServiceTerritoryId != null));
System.debug('MB_TEST window (UTC): ' + sa.EarliestStartTime.formatGmt(FMT) + ' -> ' + sa.DueDate.formatGmt(FMT)
    + ' | now (UTC): ' + Datetime.now().formatGmt(FMT));
System.debug('MB_TEST policy=' + POLICY_NAME + ' id=' + policy.Id + ' | calendar=' + ARRIVAL_CALENDAR_NAME + ' id=' + calendar.Id);
System.debug('MB_TEST calendar tz=' + calendar.TimeZone + ' | requested tz=' + tz.getID());

if (sa.StatusCategory != 'None') {
    System.debug('MB_TEST SKIPPED: appointment is not unscheduled (StatusCategory=' + sa.StatusCategory + ').');
} else if (sa.DueDate < Datetime.now()) {
    System.debug('MB_TEST SKIPPED: the appointment window has passed. Use a disposable test appointment with a future window.');
} else if (!EXECUTE) {
    System.debug('MB_TEST DRY RUN: inputs resolved; GetSlots not called.');
} else {
    Integer dmlBase = Limits.getDmlStatements();
    Integer rowBase = Limits.getDmlRows();
    Integer calloutBase = Limits.getCallouts();
    Long started = System.currentTimeMillis();
    try {
        // Verified overload (installed package stub + compile check):
        // global static List<FSL.AppointmentBookingSlot> GetSlots(Id serviceID, Id policyId, Id operatingHoursID, System.TimeZone tz, Boolean exactAppointment)
        // exactAppointment = false: return arrival windows from the calendar, not exact start times.
        List<FSL.AppointmentBookingSlot> slots = FSL.AppointmentBookingService.GetSlots(sa.Id, policy.Id, calendar.Id, tz, false);
        System.debug('MB_TEST slots returned: ' + (slots == null ? 'null' : String.valueOf(slots.size())));
        if (slots != null) {
            for (Integer i = 0; i < slots.size() && i < 50; i++) {
                FSL.AppointmentBookingSlot s = slots[i];
                // Printed exactly as returned (formatGmt). Per the docs, values are expressed in `tz`:
                // 08:00-10:00 means Dallas-local wall time; 13:00-15:00 would mean the values are true UTC.
                System.debug('MB_TEST slot ' + (i + 1) + ': ' + s.Interval.Start.formatGmt(FMT) + ' -> '
                    + s.Interval.Finish.formatGmt(FMT) + ' | grade=' + s.Grade);
            }
        }
    } catch (Exception e) {
        System.debug('MB_TEST FAILED: ' + e.getTypeName() + ': ' + e.getMessage());
        System.debug('MB_TEST stack: ' + e.getStackTraceString());
    }

    // Informational only. Limits counts this script's namespace; Field Service is a certified managed
    // package with its own per-namespace limits, so DML done inside the FSL package does not show here.
    System.debug('MB_TEST usage (default namespace only): DML statements=' + (Limits.getDmlStatements() - dmlBase)
        + ' DML rows=' + (Limits.getDmlRows() - rowBase) + ' callouts=' + (Limits.getCallouts() - calloutBase)
        + ' elapsedMs=' + (System.currentTimeMillis() - started));

    // Always end with an uncaught exception, outside the try/catch on purpose. Salesforce then discards
    // every database write, queued async job and outgoing email from this transaction, in every
    // namespace, including anything the FSL engine did. Allowed even after a callout.
    System.debug('MB_TEST DONE: ending with a deliberate exception so nothing from this run is committed.');
    throw new MbTestAbortException('MB_TEST deliberate abort: availability test finished; transaction discarded.');
}
