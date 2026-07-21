// Single source of truth for the punctuality rule, so the attendance status and
// the salary late-deduction can never drift apart again.
//
// An employee is LATE only when they check in AFTER 9:30 AM. Checking in exactly
// at 9:30 AM (or earlier) counts as on time. This matches the "Late Status"
// column in the attendance export.
export const LATE_AFTER_MINUTES = 9 * 60 + 30; // 9:30 AM

// Minutes past midnight for a date, read in local time.
export const minutesOfDay = (date) => {
    const d = new Date(date);
    return d.getHours() * 60 + d.getMinutes();
};

// True only when the check-in is after the 9:30 AM cut-off.
export const isLateCheckIn = (checkIn) =>
    !!checkIn && minutesOfDay(checkIn) > LATE_AFTER_MINUTES;

// How many minutes past 9:30 AM the check-in was (0 when on time).
export const minutesLate = (checkIn) =>
    checkIn ? Math.max(0, minutesOfDay(checkIn) - LATE_AFTER_MINUTES) : 0;
