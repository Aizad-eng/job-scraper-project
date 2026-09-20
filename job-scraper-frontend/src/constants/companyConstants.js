export const COMPANY_FILTERS = [
    { value: 'all', label: 'All' },
    { value: 'agency', label: 'Agencies' },
    { value: 'employer', label: 'Direct employers' },
    { value: 'unknown', label: 'Unchecked' },
    { value: 'overridden', label: 'Set by hand' },
];

export const VERDICT_LABEL = {
    true: 'Agency',
    false: 'Direct employer',
    null: 'Unchecked',
};

export const SEARCH_DEBOUNCE_MS = 300;
