// Deterministic first pass over a raw job title. Removes the obvious noise
// (location, req id, brackets, salary, urgency) so most titles need no model.

const US_STATES = 'AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY|DC';

const NOISE_SEGMENT = new RegExp(
    '^(remote|hybrid|on.?site|onsite|in.?office|work from home|wfh|urgent(ly)? hiring|hiring now|immediate start|now hiring|' +
    'full.?time|part.?time|contract|temporary|permanent|fte|w2|1099|' +
    'usa?|united states|canada|uk|united kingdom|emea|apac|latam|nam|' +
    '[a-z .\'-]+,\\s*(' + US_STATES + ')|' +          // "Memphis, TN"
    '[a-z .\'-]+,\\s*[a-z .\'-]+|' +                  // "Austin, Texas"
    '\\$[\\d,.]+k?(\\s*-\\s*\\$?[\\d,.]+k?)?.*|' +      // "$95k - $110k"
    '(req|requisition|job)\\s*(id|#|no\\.?)?\\s*[:#]?\\s*[a-z0-9-]+|' +
    '#?\\d{3,}|[a-z]{1,4}-?\\d{3,}' +                 // bare ids "12345", "R-4521"
    ')$',
    'i'
);

// " - Memphis, TN" / ", New York, NY" at the end (city part has no dashes)
const LOCATION_TAIL = new RegExp('\\s*[-–,|]\\s*[a-z .\']+,\\s*(' + US_STATES + ')\\s*$', 'i');
const REGION_TAIL = /\s*[-–/|,]\s*(emea|apac|latam|nam|usa?|us|uk|north america|europe|americas|global)\s*$/i;
const URGENCY_HEAD = /^(urgent(ly)?\s*hiring|hiring\s*now|now\s*hiring|immediate(ly)?\s*hiring|hot\s*job|new)[\s:!\-–]*/i;

// a trailing "." after the abbreviation is swallowed too (lookahead, not \b)
const ABBREVIATIONS = [
    [/\bsr\.?(?=\s|,|$)/gi, 'Senior'],
    [/\bjr\.?(?=\s|,|$)/gi, 'Junior'],
    [/\bmgr\.?(?=\s|,|$)/gi, 'Manager'],
    [/\bdir\.?(?=\s|,|$)/gi, 'Director'],
    [/\bassoc\.?(?=\s|,|$)/gi, 'Associate'],
    [/\bexec\.?(?=\s|,|$)/gi, 'Executive'],
    [/\bv\.?p\.?\b/gi, 'VP'],
    [/\bs\.?v\.?p\.?\b/gi, 'SVP'],
    [/\be\.?v\.?p\.?\b/gi, 'EVP'],
    [/\bengr\b/gi, 'Engineer'],
    [/\bacct\b/gi, 'Account'],
    [/\bmktg\b/gi, 'Marketing'],
    [/\bops\b/gi, 'Operations'],
    [/\bbiz dev\b/gi, 'Business Development'],
    [/\bbd\b/gi, 'Business Development'],
    [/\bhr\b/g, 'HR'],
    [/\bit\b/g, 'IT'],
];

const SMALL_WORDS = new Set(['of', 'and', 'the', 'for', 'to', 'in', 'at', 'on', 'or', 'a', 'an', 'de', 'du']);
const KEEP_UPPER = new Set(['VP', 'SVP', 'EVP', 'AVP', 'CEO', 'CFO', 'COO', 'CTO', 'CIO', 'CMO', 'CRO', 'CHRO', 'CPO', 'CSO', 'CISO', 'CDO', 'CCO', 'CLO', 'GM', 'HR', 'IT', 'AI', 'ML', 'UX', 'UI', 'QA', 'SEO', 'SEM', 'PR', 'B2B', 'B2C', 'SaaS', 'US', 'UK', 'EMEA', 'APAC', 'M&A', 'FP&A', 'R&D', 'IoT', 'API', 'ERP', 'CRM', 'SAP', 'AWS', 'GCP', 'iOS', 'PhD', 'MD', 'RN', 'CPA', 'PMO', 'EHS', 'HSE', 'QC', 'NPI', 'OEM', 'DevOps', 'SDR', 'BDR', 'AE', 'CSM']);

// "Senior Director, Product" -> "Senior Director of Product"
// "VP, Sales" -> "VP of Sales"; "Head, People Operations" -> "Head of People Operations"
const ROLE_WORDS = /\b(director|manager|head|president|vp|svp|evp|avp|officer|lead|partner|controller|chief|counsel|principal|treasurer|executive|gm|engineer|architect|analyst|specialist|coordinator|consultant|scientist|designer|developer|recruiter|administrator|supervisor|associate)\.?$/i;
const FUNCTION_TAIL_OK = /^[a-z0-9&/+ .'-]{2,40}$/i;

const REGION_WORD = /^(north america|emea|apac|latam|usa?|us|uk|europe|global|remote|hybrid|east|west|central|americas|international|northeast|southeast|midwest|southwest|northwest|canada|mexico)$/i;

export const commaToOf = (text) => {
    let parts = text.split(',').map((p) => p.trim()).filter(Boolean);
    // "Executive Director, Enterprise Sales, West" -> drop the trailing region
    while (parts.length > 2 && REGION_WORD.test(parts[parts.length - 1])) parts = parts.slice(0, -1);
    if (parts.length !== 2) return parts.join(', ');
    const [role, fn] = parts;
    if (!ROLE_WORDS.test(role)) return text;               // "Sales, Marketing Director" stays
    if (/\bof\b/i.test(role) || /^(of|for|and)\b/i.test(fn)) return text;   // already "X of Y, Z"
    if (!FUNCTION_TAIL_OK.test(fn)) return text;
    // regions / modifiers after the comma are not functions
    if (REGION_WORD.test(fn)) return role;
    return `${role} of ${fn}`;
};

export const titleCase = (text) =>
    text
        .split(/\s+/)
        .map((word, i) => {
            const upper = word.toUpperCase();
            const keep = [...KEEP_UPPER].find((k) => k.toUpperCase() === upper);
            if (keep) return keep;
            if (/^[A-Z]{2,5}$/.test(word)) return word;            // unknown acronym, leave it
            const lower = word.toLowerCase();
            if (i > 0 && SMALL_WORDS.has(lower)) return lower;
            return lower.replace(/(^|[-/(])([a-z])/g, (m, p, c) => p + c.toUpperCase());
        })
        .join(' ');

/**
 * Rule-based clean. Returns { clean, confident }: confident is false when
 * the result still looks odd (very short, or still has digits / symbols),
 * which is when Claude gets a look.
 */
export const cleanTitleWithRules = (raw) => {
    let t = String(raw || '').replace(/[–—]/g, '-').replace(/\s+/g, ' ').trim();
    if (!t) return { clean: '', confident: false };

    t = t.replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, '');          // emoji
    t = t.replace(/\s*[([{][^)\]}]*[)\]}]\s*/g, ' ');                          // (Remote), [Hybrid], {ID}
    t = t.replace(/\s*!+/g, '');
    t = t.replace(URGENCY_HEAD, '');
    t = t.replace(LOCATION_TAIL, '');
    t = t.replace(REGION_TAIL, '');

    // split on separators and drop segments that are noise
    const segments = t.split(/\s*(?:\s-\s|\s–\s|\||\/\/|:)\s*/).map((s) => s.trim()).filter(Boolean);
    const kept = segments.filter((seg) => !NOISE_SEGMENT.test(seg));
    t = (kept.length ? kept : segments.slice(0, 1)).join(' - ');
    // if several role segments remain, keep the first (the role) unless it is tiny
    if (t.includes(' - ')) {
        const parts = t.split(' - ');
        t = parts[0].length >= 6 ? parts[0] : parts.join(' ');
    }

    t = t.replace(/\s*,\s*$/, '').replace(/^\s*,\s*/, '');
    ABBREVIATIONS.forEach(([rx, rep]) => { t = t.replace(rx, rep); });
    t = t.replace(/\s{2,}/g, ' ').trim();
    t = commaToOf(t);
    t = titleCase(t);

    const isAcronym = /^[A-Z]{2,5}$/.test(t);
    const confident = (t.length >= 4 || isAcronym) && !/[\d#@$%*_=<>~^]/.test(t) && !/\b(remote|hybrid|urgent|hiring)\b/i.test(t);
    return { clean: t, confident };
};

export const titleKey = (raw) => String(raw || '').toLowerCase().replace(/\s+/g, ' ').trim();
