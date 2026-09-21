import { PIPELINE_STAGES, STAGE_STATE, JOB_STATUS, FINISHED_STATUSES } from '../constants/statusConstants.js';

export const visibleStages = (inputs) =>
    PIPELINE_STAGES.filter((stage) => !stage.onlyWhen || stage.onlyWhen(inputs));

// where the current status sits in the pipeline
export const getStageState = (stageStatus, currentStatus, stages) => {
    const order = stages.map((stage) => stage.status);
    const stageIndex = order.indexOf(stageStatus);

    // terminal states that are not in the list still mean "everything before is done"
    const effective =
        currentStatus === JOB_STATUS.EMPTY ? JOB_STATUS.DELIVERING :
        currentStatus === JOB_STATUS.FAILED ? currentStatus :
        currentStatus;
    const currentIndex = order.indexOf(effective);

    if (currentIndex > stageIndex) return STAGE_STATE.DONE;
    if (currentIndex === stageIndex) {
        if (stageStatus === JOB_STATUS.DONE) return STAGE_STATE.DONE;
        if (currentStatus === JOB_STATUS.EMPTY) return STAGE_STATE.WAITING;
        return STAGE_STATE.ACTIVE;
    }
    return STAGE_STATE.WAITING;
};

export const isRunning = (status) => Boolean(status) && !FINISHED_STATUSES.includes(status);

export const formatElapsed = (startIso, endIso) => {
    if (!startIso) return '0s';

    const start = new Date(startIso).getTime();
    const end = endIso ? new Date(endIso).getTime() : Date.now();
    const seconds = Math.max(0, Math.floor((end - start) / 1000));

    const minutes = Math.floor(seconds / 60);
    return minutes ? `${minutes}m ${seconds % 60}s` : `${seconds}s`;
};

export const formatDate = (iso) => {
    if (!iso) return '';
    const date = new Date(iso);
    const sameYear = date.getFullYear() === new Date().getFullYear();
    return date.toLocaleString(undefined, {
        month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
        ...(sameYear ? {} : { year: 'numeric' }),
    });
};

export const isValidWebhookUrl = (value) => {
    try {
        const url = new URL(String(value || '').trim());
        return url.protocol === 'https:' || url.protocol === 'http:';
    } catch {
        return false;
    }
};

export const validateForm = (values) => {
    const errors = {};

    if (!values.keywords.length) errors.keywords = 'Add at least one job title';
    if (!values.platforms.length) errors.platforms = 'Pick at least one job board';
    if (!isValidWebhookUrl(values.webhookUrl)) errors.webhookUrl = 'Enter a valid URL starting with https://';

    if (values.filterKeywords.length && !values.filterMatchIn.length) {
        errors.filterMatchIn = 'Pick where to look';
    }
    if (values.excludeWords.length && !values.excludeMatchIn.length) {
        errors.excludeMatchIn = 'Pick where to look';
    }

    const salaryMin = values.salaryMin === '' ? null : Number(values.salaryMin);
    const salaryMax = values.salaryMax === '' ? null : Number(values.salaryMax);
    if (salaryMin !== null && salaryMax !== null && salaryMin > salaryMax) {
        errors.salary = 'Minimum is larger than maximum';
    }

    return errors;
};

// "3 titles × 2 boards = 6 scrapes, up to 150 listings"
export const describeRun = (values) => {
    const titles = values.keywords.length;
    const boards = values.platforms.length;
    if (!titles || !boards) return '';
    const runs = titles * boards;
    const listings = runs * (Math.round(Number(values.jobsPerKeyword)) || 0);
    return `${titles} ${titles === 1 ? 'title' : 'titles'} × ${boards} ${boards === 1 ? 'board' : 'boards'} = ${runs} ${runs === 1 ? 'scrape' : 'scrapes'}, up to ${listings.toLocaleString()} listings`;
};

export const formatDateTime = (iso) => {
    if (!iso) return '';
    return new Date(iso).toLocaleString(undefined, {
        weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
    });
};

// "in 3h 12m", "in 2 days", "overdue"
export const formatUntil = (iso) => {
    if (!iso) return '';
    const diff = new Date(iso).getTime() - Date.now();
    if (diff <= 0) return 'any moment now';
    const minutes = Math.round(diff / 60000);
    if (minutes < 60) return `in ${minutes} min`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `in ${hours}h ${minutes % 60}m`;
    const days = Math.floor(hours / 24);
    return `in ${days} ${days === 1 ? 'day' : 'days'}`;
};

export const validateScheduleFields = (fields) => {
    const errors = {};
    if (fields.frequency === 'weekdays' && !fields.weekdays.length) {
        errors.weekdays = 'Pick at least one day';
    }
    if (fields.frequency === 'every_n_days' && !(Number(fields.everyDays) >= 1)) {
        errors.everyDays = 'Enter 1 or more';
    }
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(fields.runTime || '')) {
        errors.runTime = 'Pick a time';
    }
    return errors;
};

// "3 days ago", "today"
export const formatAgo = (iso) => {
    if (!iso) return '';
    const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
    if (days <= 0) return 'today';
    if (days === 1) return 'yesterday';
    return `${days} days ago`;
};
