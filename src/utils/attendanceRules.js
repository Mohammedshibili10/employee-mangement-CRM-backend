// Single source of truth for the punctuality rules, driven by each employee's
// OWN working hours (workStartTime / workEndTime) rather than one global timing.
// The attendance status and the salary late-deduction both read from here so
// they can never drift apart.
//
// Rules, relative to the employee's start time:
//   - check-in at or before start        -> on time  (status 'present')
//   - after start, within 4 hours         -> 'late'   (deduction by how late)
//   - more than 4 hours after start        -> 'half-day'
//   - check-out after the end time         -> overtime
// Company defaults (used when an employee has no custom hours): 09:30 - 18:00.

export const DEFAULT_START = '09:30';
export const DEFAULT_END = '18:00';
export const DEFAULT_START_MINUTES = 9 * 60 + 30; // 09:30
export const DEFAULT_END_MINUTES = 18 * 60;       // 18:00

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

// True only when the check-in is after the employee's start time.
export const isLateCheckIn = (checkIn, startMinutes = DEFAULT_START_MINUTES) =>
    !!checkIn && minutesOfDay(checkIn) > startMinutes;

// How many minutes past the start time the check-in was (0 when on time).
export const minutesLate = (checkIn, startMinutes = DEFAULT_START_MINUTES) =>
    checkIn ? Math.max(0, minutesOfDay(checkIn) - startMinutes) : 0;

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
