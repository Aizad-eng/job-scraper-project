export const API_BASE_URL = import.meta.env.VITE_API_URL || '/api';

export const POLL_INTERVAL_MS = 3000;

export const JOB_STATUS = {
    PENDING: 'pending',
    SCRAPING: 'scraping',
    FILTERING: 'filtering',
    CLASSIFYING: 'classifying',
    FINDING_CONTACTS: 'finding_contacts',
    READY: 'ready',
    EMPTY: 'empty',
    FAILED: 'failed',
};

// display order of the pipeline, with which count each stage reports
export const PIPELINE_STAGES = [
    {
        status: JOB_STATUS.SCRAPING,
        label: 'Scraping job listings',
        countKey: 'scrapedCount',
        countLabel: 'jobs',
    },
    {
        status: JOB_STATUS.FILTERING,
        label: 'Applying your filters',
        countKey: null,
    },
    {
        status: JOB_STATUS.CLASSIFYING,
        label: 'Removing staffing agencies',
        countKey: 'companiesCount',
        countLabel: 'companies kept',
    },
    {
        status: JOB_STATUS.FINDING_CONTACTS,
        label: 'Finding contacts',
        countKey: 'contactsCount',
        countLabel: 'contacts',
    },
    {
        status: JOB_STATUS.READY,
        label: 'Ready to download',
        countKey: null,
    },
];

export const STAGE_STATE = {
    DONE: 'done',
    ACTIVE: 'active',
    WAITING: 'waiting',
};

export const EXPORT_FORMATS = [
    { value: 'xlsx', label: 'Excel (.xlsx)' },
    { value: 'csv', label: 'CSV' },
];

export const POSTED_WITHIN_LABELS = {
    any: 'Any time',
    day: 'Past 24 hours',
    week: 'Past week',
    month: 'Past month',
};