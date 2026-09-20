export const API_BASE_URL = import.meta.env.VITE_API_URL || '/api';

export const POLL_INTERVAL_MS = 3000;

export const JOB_STATUS = {
    PENDING: 'pending',
    SCRAPING: 'scraping',
    FILTERING: 'filtering',
    CLASSIFYING: 'classifying',
    DELIVERING: 'delivering',
    DONE: 'done',
    EMPTY: 'empty',
    FAILED: 'failed',
};

export const FINISHED_STATUSES = [JOB_STATUS.DONE, JOB_STATUS.EMPTY, JOB_STATUS.FAILED];

// display order of the pipeline, with which count each stage reports
export const PIPELINE_STAGES = [
    {
        status: JOB_STATUS.SCRAPING,
        label: 'Scraping job listings',
        countKey: 'scrapedCount',
        countLabel: 'listings',
    },
    {
        status: JOB_STATUS.FILTERING,
        label: 'Applying your filters',
        countKey: 'keptCount',
        countLabel: 'kept',
    },
    {
        status: JOB_STATUS.CLASSIFYING,
        label: 'Checking for staffing agencies',
        countKey: 'companiesCount',
        countLabel: 'companies',
        // only shown when the run uses the AI check
        onlyWhen: (inputs) => inputs?.agencyMode === 'remove' || inputs?.agencyMode === 'flag',
    },
    {
        status: JOB_STATUS.DELIVERING,
        label: 'Sending to your webhook',
        countKey: 'sentCount',
        countLabel: 'rows sent',
    },
    {
        status: JOB_STATUS.DONE,
        label: 'Done',
        countKey: null,
    },
];

export const STAGE_STATE = {
    DONE: 'done',
    ACTIVE: 'active',
    WAITING: 'waiting',
};

export const POSTED_WITHIN_LABELS = {
    any: 'Any time',
    day: 'Past 24 hours',
    three_days: 'Past 3 days',
    week: 'Past week',
    two_weeks: 'Past 2 weeks',
    month: 'Past month',
};

export const REMOVAL_REASON_LABELS = {
    missing_company_data: 'No company name',
    company_size: 'Company size',
    staffing_word_match: 'Staffing word in company name, domain or industry',
    ai_staffing_agency: 'AI judged it a staffing agency',
    no_keyword_match: 'Missing a must-mention word',
    excluded_word: 'Contained an excluded word',
    industry: 'Industry',
    excluded_company: 'Excluded company',
    seniority: 'Seniority level',
    employment_type: 'Employment type',
    per_company_cap: 'Over the per-company limit',
    already_sent: 'Already sent by this schedule',
};

export const AGENCY_MODE_LABELS = {
    remove: 'Removed (words + AI)',
    keywords: 'Removed (word screen only)',
    flag: 'Kept and flagged',
    off: 'Not checked',
};

export const DELIVERY_MODE_LABELS = {
    job: 'one row per job listing',
    company: 'one row per company',
};

export const RECENT_RUNS_LIMIT = 8;
