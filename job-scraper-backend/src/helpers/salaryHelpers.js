import { PERIOD_TO_YEAR } from '../constants/salaryConstants.js';

const CURRENCY_SYMBOLS = { $: 'USD', '€': 'EUR', '£': 'GBP', '₹': 'INR', 'C$': 'CAD', 'A$': 'AUD', 'CA$': 'CAD', 'AU$': 'AUD' };
const CURRENCY_CODES = ['USD', 'EUR', 'GBP', 'CAD', 'AUD', 'INR', 'CHF', 'SGD', 'AED', 'NZD', 'SEK', 'NOK', 'DKK', 'PLN', 'ZAR'];

const PERIOD_WORDS = [
    [/\b(per|an|a|\/)\s*(hour|hr)\b|\bhourly\b|\/h\b/i, 'hour'],
    [/\b(per|a|\/)\s*day\b|\bdaily\b/i, 'day'],
    [/\b(per|a|\/)\s*(week|wk)\b|\bweekly\b/i, 'week'],
    [/\b(per|a|\/)\s*(month|mo)\b|\bmonthly\b/i, 'month'],
    [/\b(per|a|\/)\s*(year|yr|annum)\b|\bannual(ly)?\b|\byearly\b|\bp\.?a\.?\b/i, 'year'],
];

// "$70k" -> 70000, "100,000.00" -> 100000
const toNumber = (raw) => {
    if (raw === null || raw === undefined) return null;
    const text = String(raw).toLowerCase().replace(/,/g, '').trim();
    const m = text.match(/(\d+(?:\.\d+)?)\s*(k)?/);
    if (!m) return null;
    let n = Number(m[1]);
    if (m[2]) n *= 1000;
    return Number.isFinite(n) ? n : null;
};

export const detectCurrency = (text) => {
    const upper = String(text || '').toUpperCase();
    for (const code of CURRENCY_CODES) if (new RegExp(`\\b${code}\\b`).test(upper)) return code;
    for (const [symbol, code] of Object.entries(CURRENCY_SYMBOLS).sort((a, b) => b[0].length - a[0].length)) {
        if (String(text || '').includes(symbol)) return code;
    }
    return null;
};

export const detectPeriod = (text) => {
    for (const [rx, period] of PERIOD_WORDS) if (rx.test(String(text || ''))) return period;
    return null;
};

/**
 * Deterministic parse of a board salary string such as
 * "Base pay range $100,000.00/yr - $225,000.00/yr", "$70,000 - $90,000 per year",
 * "€18.50 per hour", "$25/hr". Returns { min, max, currency, period } or null.
 */
export const parseSalaryText = (text) => {
    if (!text) return null;
    const clean = String(text).replace(/–|—/g, '-');
    const period = detectPeriod(clean);
    const currency = detectCurrency(clean);

    // numbers that look like money (allow 18.50, 70,000, 70k)
    const numbers = [...clean.matchAll(/(?:[$€£₹]\s*)?(\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?)\s*(k)?(?![\d%])/gi)]
        .map((m) => toNumber(`${m[1]}${m[2] || ''}`))
        .filter((n) => n !== null && n > 0);

    if (!numbers.length) return null;

    // a period is required unless the numbers are clearly annual-sized
    const guessPeriod = period || (numbers.every((n) => n >= 10_000) ? 'year' : numbers.every((n) => n < 500) ? 'hour' : null);
    if (!guessPeriod) return null;

    const min = Math.min(...numbers);
    const max = Math.max(...numbers);
    return { min, max, currency, period: guessPeriod };
};

export const toYearly = (amount, period) => {
    if (amount === null || amount === undefined) return null;
    const factor = PERIOD_TO_YEAR[period] ?? null;
    if (!factor) return null;
    return Math.round(amount * factor);
};

// Applies { min, max, currency, period } to a job as yearly numbers.
export const applySalary = (job, parsed, source) => {
    const min = toYearly(parsed.min, parsed.period);
    const max = toYearly(parsed.max ?? parsed.min, parsed.period);
    if (min === null && max === null) return false;
    job.salaryMinPerYear = min;
    job.salaryMaxPerYear = max ?? min;
    job.salaryCurrency = parsed.currency || null;
    job.salaryPeriodOriginal = parsed.period || null;
    job.salarySource = source;
    return true;
};

export const hasSalary = (job) =>
    Number.isFinite(job.salaryMinPerYear) || Number.isFinite(job.salaryMaxPerYear);
