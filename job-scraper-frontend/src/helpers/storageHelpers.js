import { RECENT_RUNS_LIMIT } from '../constants/statusConstants.js';

const RUNS_KEY = 'jobScraperRecentRuns';
const WEBHOOK_KEY = 'jobScraperWebhookUrl';
const FORM_KEY = 'jobScraperLastForm';

const read = (key, fallback) => {
    try {
        const raw = localStorage.getItem(key);
        return raw ? JSON.parse(raw) : fallback;
    } catch {
        return fallback;
    }
};

const write = (key, value) => {
    try {
        localStorage.setItem(key, JSON.stringify(value));
    } catch {
        /* private browsing — nothing is remembered */
    }
};

export const getRecentRuns = () => read(RUNS_KEY, []);

export const rememberRun = (run) => {
    const others = getRecentRuns().filter((item) => item.jobId !== run.jobId);
    write(RUNS_KEY, [run, ...others].slice(0, RECENT_RUNS_LIMIT));
};

export const updateRecentRun = (jobId, patch) => {
    const runs = getRecentRuns();
    const index = runs.findIndex((item) => item.jobId === jobId);
    if (index === -1) return;
    runs[index] = { ...runs[index], ...patch };
    write(RUNS_KEY, runs);
};

export const forgetRun = (jobId) => {
    write(RUNS_KEY, getRecentRuns().filter((item) => item.jobId !== jobId));
};

export const getRememberedWebhook = () => read(WEBHOOK_KEY, '');
export const rememberWebhook = (url) => write(WEBHOOK_KEY, url);

export const getLastForm = () => read(FORM_KEY, null);
export const rememberForm = (values) => write(FORM_KEY, values);
