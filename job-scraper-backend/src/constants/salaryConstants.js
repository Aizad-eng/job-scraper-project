// Cheapest current Claude model; salary extraction is a small, well-bounded task.
export const SALARY_MODEL = 'claude-haiku-4-5';

// Only this much of a description is sent; pay is almost always near the
// top or in a short "compensation" paragraph.
export const SALARY_MAX_DESCRIPTION_CHARS = 8_000;

export const SALARY_CONCURRENCY = 5;

// hours / days / weeks / months in a working year
export const PERIOD_TO_YEAR = {
    hour: 2080,
    day: 260,
    week: 52,
    fortnight: 26,
    month: 12,
    year: 1,
};

export const SALARY_SOURCE = {
    BOARD: 'board',                 // numeric annual figures from the job board
    PARSED: 'parsed',               // parsed from the board's salary text
    CLAUDE_TEXT: 'claude-text',     // Claude read the board's salary text
    CLAUDE_DESCRIPTION: 'claude-description',  // Claude read the description
    NONE: 'none',
};

export const SALARY_SYSTEM_PROMPT =
    'You extract the pay offered by a job listing. Read the text and report the salary or pay range ' +
    'exactly as the listing states it: the lowest and highest numbers, the currency (ISO code such as USD, EUR, GBP), ' +
    'and the period the numbers refer to (hour, day, week, month, year). ' +
    'If only one figure is given, use it for both min and max. ' +
    'Ignore signing bonuses, equity, benefits, and figures that are not pay for this role. ' +
    'If the listing states no pay at all, set found to false and leave the numbers null. Never guess or estimate.';
