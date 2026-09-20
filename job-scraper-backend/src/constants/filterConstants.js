// Company size bands as LinkedIn reports them. Indeed reports "51 to 200"
// style ranges, which parse to the same numbers.
export const COMPANY_SIZE_BANDS = [
    { value: '1-10', min: 1, max: 10 },
    { value: '11-50', min: 11, max: 50 },
    { value: '51-200', min: 51, max: 200 },
    { value: '201-500', min: 201, max: 500 },
    { value: '501-1000', min: 501, max: 1000 },
    { value: '1001-5000', min: 1001, max: 5000 },
    { value: '5001-10000', min: 5001, max: 10000 },
    { value: '10001+', min: 10001, max: Infinity },
];

export const STAFFING_MATCH_FIELDS = ['companyName', 'companyDomain', 'companyIndustry'];

export const DEFAULT_STAFFING_WORDS = [
    'staff', 'staffing', 'staffed', 'recruit', 'recruits', 'recruiter',
    'recruiters', 'recruiting', 'recruitment', 'headhunter', 'headhunters',
    'headhunting', 'personnel', 'employment', 'placement', 'placements',
    'manpower', 'workforce', 'resourcing', 'temp', 'temps', 'temping',
    'hr', 'human resources', 'talent acquisition', 'executive search',
];

// How staffing agencies are handled.
//   off       – keep everything, no checks at all
//   keywords  – free: drop companies whose name / domain / industry has a staffing word
//   flag      – keywords + AI, but keep the rows and mark isStaffingAgency
//   remove    – keywords + AI, drop anything judged an agency (default)
export const AGENCY_MODE = {
    OFF: 'off',
    KEYWORDS: 'keywords',
    FLAG: 'flag',
    REMOVE: 'remove',
};

export const DEFAULT_AGENCY_MODE = AGENCY_MODE.REMOVE;

export const REMOVAL_REASON = {
    NO_COMPANY_DATA: 'missing_company_data',
    COMPANY_SIZE: 'company_size',
    STAFFING_WORD: 'staffing_word_match',
    AI_AGENCY: 'ai_staffing_agency',
    KEYWORD_MISMATCH: 'no_keyword_match',
    EXCLUDED_WORD: 'excluded_word',
    INDUSTRY: 'industry',
    EXCLUDED_COMPANY: 'excluded_company',
    SENIORITY: 'seniority',
    EMPLOYMENT_TYPE: 'employment_type',
    PER_COMPANY_CAP: 'per_company_cap',
    ALREADY_SENT: 'already_sent',
    KNOWN_AGENCY: 'known_agency',
    COMPANY_COOLDOWN: 'company_cooldown',
};

export const REMOVAL_REASON_LABELS = {
    missing_company_data: 'No company name',
    company_size: 'Company size',
    staffing_word_match: 'Staffing word in company',
    ai_staffing_agency: 'AI judged a staffing agency',
    no_keyword_match: 'Missing a must-mention word',
    excluded_word: 'Contained an excluded word',
    industry: 'Industry',
    excluded_company: 'Excluded company',
    seniority: 'Seniority level',
    employment_type: 'Employment type',
    per_company_cap: 'Over the per-company cap',
    already_sent: 'Already sent by this schedule',
    known_agency: 'Known staffing agency (company memory)',
    company_cooldown: 'Company sent recently (cooldown)',
};

export const STRIPPED_JOB_FIELDS = [
    'descriptionHtml', 'trackingId', 'refId', 'companyLogo', 'attributes',
    'attributesWithKeys', 'companyHeaderImage', 'companyCeoPhoto',
    'occupations', 'occupationsWithKeys', 'inputUrl',
];

export const MATCH_IN = {
    TITLE: 'title',
    DESCRIPTION: 'description',
};

export const MATCH_IN_FIELD_MAP = {
    [MATCH_IN.TITLE]: 'title',
    [MATCH_IN.DESCRIPTION]: 'descriptionText',
};

export const DEFAULT_MATCH_IN = [MATCH_IN.TITLE];

// LinkedIn's own labels. Indeed does not report these, so jobs with no value
// are kept when the filter is on.
export const SENIORITY_LEVELS = [
    'Internship', 'Entry level', 'Associate', 'Mid-Senior level', 'Director', 'Executive',
];

export const EMPLOYMENT_TYPES = [
    'Full-time', 'Part-time', 'Contract', 'Temporary', 'Internship', 'Volunteer', 'Other',
];
