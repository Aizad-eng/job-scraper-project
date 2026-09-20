export const REPEAT_OPTIONS = [
    { value: 'once', label: 'Run once now', hint: 'Starts immediately.' },
    { value: 'schedule', label: 'Run on a schedule', hint: 'Save it and let it run by itself. Listings already sent are skipped next time.' },
];

export const FREQUENCY_OPTIONS = [
    { value: 'daily', label: 'Every day' },
    { value: 'every_n_days', label: 'Every N days' },
    { value: 'weekdays', label: 'Chosen weekdays' },
];

export const WEEKDAY_OPTIONS = [
    { value: 1, label: 'Mon' },
    { value: 2, label: 'Tue' },
    { value: 3, label: 'Wed' },
    { value: 4, label: 'Thu' },
    { value: 5, label: 'Fri' },
    { value: 6, label: 'Sat' },
    { value: 0, label: 'Sun' },
];

export const BROWSER_TIMEZONE = (() => {
    try {
        return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    } catch {
        return 'UTC';
    }
})();

export const DEFAULT_SCHEDULE_FIELDS = {
    name: '',
    frequency: 'daily',
    everyDays: 2,
    weekdays: [1, 2, 3, 4, 5],
    runTime: '08:00',
    timezone: BROWSER_TIMEZONE,
    skipAlreadySent: true,
};

export const SCHEDULES_REFRESH_MS = 20000;

// default gap between keyword searches for a schedule
export const DEFAULT_LAUNCH_SPACING_MINUTES = 20;
