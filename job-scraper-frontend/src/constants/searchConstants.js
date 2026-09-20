export const PLATFORMS = [
    { value: 'linkedin', label: 'LinkedIn' },
    { value: 'indeed', label: 'Indeed' },
];

export const COMPANY_SIZE_BANDS = [
    { value: '1-10', label: '1–10' },
    { value: '11-50', label: '11–50' },
    { value: '51-200', label: '51–200' },
    { value: '201-500', label: '201–500' },
    { value: '501-1000', label: '501–1K' },
    { value: '1001-5000', label: '1K–5K' },
    { value: '5001-10000', label: '5K–10K' },
    { value: '10001+', label: '10K+' },
];

export const AGENCY_MODE_OPTIONS = [
    {
        value: 'remove',
        label: 'Remove agencies',
        hint: 'Word screen, then the website check on companies not already in memory. Recommended.',
    },
    {
        value: 'keywords',
        label: 'Word screen only',
        hint: 'Free and instant. Drops companies with "staffing", "recruiting" and similar in the name, domain or industry, plus anything already known as an agency.',
    },
    {
        value: 'flag',
        label: 'Keep but flag',
        hint: 'Nothing is dropped. Each row gets an isStaffingAgency field.',
    },
    {
        value: 'off',
        label: 'Off',
        hint: 'No agency checks at all.',
    },
];

export const DELIVERY_MODE_OPTIONS = [
    { value: 'job', label: 'One row per job listing', hint: 'Every listing becomes a row, with its company fields.' },
    { value: 'company', label: 'One row per company', hint: 'Companies are deduplicated. Their listings are nested in a jobs field.' },
];

export const SENIORITY_OPTIONS = [
    'Internship', 'Entry level', 'Associate', 'Mid-Senior level', 'Director', 'Executive',
];

export const EMPLOYMENT_TYPE_OPTIONS = [
    'Full-time', 'Part-time', 'Contract', 'Temporary', 'Internship',
];

export const DEFAULT_FORM_VALUES = {
    keywords: [],
    location: '',
    platforms: ['linkedin'],
    jobsPerKeyword: 25,
    postedWithin: 'week',
    maxJobsPerCompany: 0,

    companySizes: ['11-50', '51-200', '201-500'],
    includeUnknownSize: false,
    filterKeywords: [],
    filterMatchIn: ['title'],
    excludeWords: [],
    excludeMatchIn: ['title'],
    includeIndustries: [],
    excludeIndustries: [],
    excludeCompanies: [],
    seniorityLevels: [],
    employmentTypes: [],
    agencyMode: 'remove',

    webhookUrl: '',
    deliveryMode: 'job',
    cooldownDays: 21,
    findMissingDomains: true,
    extractSalaries: true,
    salaryMin: '',
    salaryMax: '',
    includeNoSalary: true,
    launchSpacingMinutes: 0,
};

export const JOBS_PER_KEYWORD_OPTIONS = [10, 25, 50, 100, 250, 500];

export const FIELD_HINTS = {
    keywords: 'Each title runs as its own search on every board you pick. Press Enter after each one.',
    location: 'City, state or country. Leave empty for anywhere.',
    companySizes: 'Pick the bands you want. Nothing selected means any size.',
    includeUnknownSize: 'Some listings have no company size. Tick to keep them anyway.',
    filterKeywords: 'Keep a listing only if it mentions at least one of these.',
    excludeWords: 'Drop a listing if it mentions any of these, for example intern, senior, clearance.',
    includeIndustries: 'Keep only companies whose industry contains one of these, for example software, healthcare.',
    excludeIndustries: 'Drop companies whose industry contains any of these.',
    excludeCompanies: 'Company names or domains to skip, for example amazon.com.',
    seniorityLevels: 'LinkedIn only. Listings without a level are kept.',
    employmentTypes: 'LinkedIn only. Listings without a type are kept.',
    maxJobsPerCompany: 'Stops one big employer flooding the results. 0 means no limit.',
    webhookUrl: 'Every row is POSTed here as JSON. Works with Clay, Zapier, Make, n8n or your own endpoint.',
    postedWithin: 'Recent postings are a stronger hiring signal and cost less to process.',
    launchSpacingMinutes: 'The first keyword starts at the scheduled time; each next keyword starts this many minutes later, on every board. Results are processed once, after the last one finishes. 0 launches everything at once.',
    salary: 'Yearly figures. Pay stated per hour, week or month is converted to a year. Leave both empty for any salary.',
    includeNoSalary: 'Many listings state no pay at all. Untick to drop them.',
    extractSalaries: 'When the board gives no usable figure, Claude reads the description and pulls out any stated pay. A fraction of a cent per listing.',
    findMissingDomains: 'Shorteners, social links and job-board pages never count as a domain. When a company has no usable domain, Google is searched for its website (5 ScrapingDog credits per company, remembered afterwards).',
    cooldownDays: 'Once a company is sent, hold it back for this many days across every run and schedule, even if it posts more jobs. 0 turns this off.',
};

export const POSTED_WITHIN_OPTIONS = [
    { value: 'day', label: 'Past 24 hours' },
    { value: 'three_days', label: 'Past 3 days' },
    { value: 'week', label: 'Past week' },
    { value: 'two_weeks', label: 'Past 2 weeks' },
    { value: 'month', label: 'Past month' },
    { value: 'any', label: 'Any time' },
];

export const MATCH_IN_OPTIONS = [
    { value: 'title', label: 'Job title' },
    { value: 'description', label: 'Job description' },
];
