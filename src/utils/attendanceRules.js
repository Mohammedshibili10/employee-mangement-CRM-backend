// Single source of truth for the punctuality rules, driven by each employee's
// OWN working hours (workStartTime / workEndTime) rather than one global timing.
// The attendance status and the salary late-deduction both read from here so
// they can never drift apart.
//
// Rules, relative to the employee's OWN start time plus a 5-minute grace (so a
// 09:30 start is graced to 09:35, a 10:00 start to 10:05, and so on):
//   - check-in at or before the grace time -> on time  (status 'present')
//   - after the grace, within 4 hours      -> 'late'   (always deducted)
//   - more than 4 hours later              -> 'half-day'
//   - check-out after the end time         -> overtime
// Company defaults (used when an employee has no custom hours): 09:30 - 18:00.

export const DEFAULT_START = '09:30';
export const DEFAULT_END = '18:00';
export const DEFAULT_START_MINUTES = 9 * 60 + 30; // 09:30
export const DEFAULT_END_MINUTES = 18 * 60;       // 18:00

// Grace period after the start time. A check-in is only late once it is past
// start + grace — so on the default 09:30 start, lateness begins at 09:35 and
// the minutes late are counted from there.
export const LATE_GRACE_MINUTES = 5;

// The moment lateness starts for an employee: their start time plus the grace.
export const lateFromMinutes = (startMinutes = DEFAULT_START_MINUTES) =>
    startMinutes + LATE_GRACE_MINUTES;

// A check-in more than this many minutes after start is a half-day.
export const HALF_DAY_AFTER_MINUTES = 4 * 60; // 4 hours

// Parse "HH:MM" -> minutes past midnight. Returns the fallback for anything
// missing or malformed, so bad data never breaks attendance.
export const parseTimeToMinutes = (value, fallback) => {
    if (typeof value !== 'string') return fallback;
    const m = value.match(/^([01]\d|2[0-3]):([0-5]\d)$/);
    if (!m) return fallback;
    return Number(m[1]) * 60 + Number(m[2]);
};

// Minutes past midnight for a Date, read in local (server) time.
export const minutesOfDay = (date) => {
    const d = new Date(date);
    return d.getHours() * 60 + d.getMinutes();
};

// Resolve an employee's working hours to minutes, falling back to the defaults.
export const startMinutesOf = (employee) =>
    parseTimeToMinutes(employee?.workStartTime, DEFAULT_START_MINUTES);
export const endMinutesOf = (employee) =>
    parseTimeToMinutes(employee?.workEndTime, DEFAULT_END_MINUTES);

// True only when the check-in is past the start time plus the grace (09:35 on
// the default 09:30 start).
export const isLateCheckIn = (checkIn, startMinutes = DEFAULT_START_MINUTES) =>
    !!checkIn && minutesOfDay(checkIn) > lateFromMinutes(startMinutes);

// How many minutes late the check-in was, counted from the end of the grace
// period — so 10:15 on a 09:30 start is 40 minutes late, not 45. Zero whenever
// the arrival is within the grace.
export const minutesLate = (checkIn, startMinutes = DEFAULT_START_MINUTES) =>
    checkIn ? Math.max(0, minutesOfDay(checkIn) - lateFromMinutes(startMinutes)) : 0;

// ---- late-arrival deduction --------------------------------------------------
// The charge is assessed on the MONTH'S TOTAL late minutes, not day by day. Each
// day contributes its own minutes past that employee's grace; those minutes are
// summed for the month and the ladder is applied once.
//
// One full slab of 90 minutes costs one day's pay. What is left over after the
// completed slabs is then charged on its own band:
//
//   total <= 40            -> nothing at all
//   otherwise              -> floor(total / 90) days
//                             + 0     if there is no remainder
//                             + 0.25  if the remainder is 1 - 60
//                             + 0.50  if the remainder is 61 - 89
//
// The 40-minute allowance is spent ONCE, against the month's total. It is not
// granted again to the minutes left over after a slab: past the first 40, every
// leftover minute is charged at 0.25 of a day or more.
//
// e.g. 140 minutes = one complete 90-minute slab (1 day) + 50 left over, which
// falls in the 1-60 band, so 0.25 more — 1.25 days in total.
//      100 minutes = one slab + 10 left over -> 1.25 days, not 1.
//
// The grace itself is relative to the employee's OWN start time, so a 09:30
// start is late from 09:36 and a 10:00 start is late from 10:06.
export const LATE_SLAB_MINUTES = 90;   // a completed slab = one day's pay
export const LATE_FREE_MINUTES = 40;   // a month at or under this costs nothing

// Fraction of one day's pay owed for a whole month's late minutes.
export const lateDeductionForMinutes = (totalMinutes) => {
    const total = Math.max(0, Math.round(Number(totalMinutes) || 0));
    // The free allowance is tested here and ONLY here — against the month's
    // total, never again against a remainder.
    if (total <= LATE_FREE_MINUTES) return 0;

    const slabs = Math.floor(total / LATE_SLAB_MINUTES);
    const remainder = total % LATE_SLAB_MINUTES;

    let extra = 0;
    if (remainder > 60) extra = 0.5;
    else if (remainder > 0) extra = 0.25;

    return slabs + extra;
};

// The month's late minutes split into the parts the ladder charges on: the
// completed 90-minute slabs, and the leftover minutes that did not fill one.
// The leftover is what the Salary Adjustments page lets an admin edit down.
export const splitLateMinutes = (totalMinutes) => {
    const total = Math.max(0, Math.round(Number(totalMinutes) || 0));
    return {
        totalMinutes: total,
        slabs: Math.floor(total / LATE_SLAB_MINUTES),
        extraMinutes: total % LATE_SLAB_MINUTES,
    };
};

// Attendance status derived purely from the check-in and the employee's start.
export const deriveStatusFor = (checkIn, startMinutes = DEFAULT_START_MINUTES) => {
    if (!checkIn) return 'present';
    const late = minutesLate(checkIn, startMinutes);
    if (late === 0) return 'present';
    if (late > HALF_DAY_AFTER_MINUTES) return 'half-day';
    return 'late';
};

// Overtime = checking out after the employee's end time.
export const overtimeFor = (checkOut, endMinutes = DEFAULT_END_MINUTES) => {
    if (!checkOut) return { overtime: false, overtimeMinutes: 0 };
    const m = minutesOfDay(checkOut);
    const over = m > endMinutes;
    return { overtime: over, overtimeMinutes: over ? m - endMinutes : 0 };
};
