import { randomUUID } from 'crypto';
import Job from '../models/job.model.js';
import { launchDueSearches } from './launchQueue.service.js';
import { JOB_STATUS, PLATFORMS, MAX_ACTOR_RUNS_GLOBAL, DEFAULT_MAX_CONCURRENT_RUNS } from '../constants/apifyConstants.js';
import { AGENCY_MODE, DEFAULT_AGENCY_MODE, DEFAULT_MATCH_IN, COMPANY_SIZE_BANDS } from '../constants/filterConstants.js';
import { DELIVERY_MODE, DEFAULT_DELIVERY_MODE } from '../constants/deliveryConstants.js';
import { DEFAULT_COOLDOWN_DAYS, MAX_COOLDOWN_DAYS } from '../constants/companyConstants.js';

const cleanList = (value) => {
    if (!Array.isArray(value)) return [];
    const seen = new Set();
    return value
        .map((item) => String(item ?? '').trim())
        .filter((item) => item && !seen.has(item.toLowerCase()) && seen.add(item.toLowerCase()));
};

const oneOf = (value, allowed, fallback) => (allowed.includes(value) ? value : fallback);

export const isValidWebhookUrl = (value) => {
    try {
        const url = new URL(String(value || ''));
        return url.protocol === 'https:' || url.protocol === 'http:';
    } catch {
        return false;
    }
};

// Turns a raw request body into a clean, validated inputs object.
// Throws an Error with a user-facing message when something is missing.
export const parseInputs = (body = {}) => {
    const inputs = {
        keywords: cleanList(body.keywords),
        location: String(body.location || '').trim(),
        platforms: cleanList(body.platforms).filter((p) => Object.values(PLATFORMS).includes(p)),
        jobsPerKeyword: Math.min(Math.max(Math.round(Number(body.jobsPerKeyword)) || 25, 1), 5000),
        postedWithin: body.postedWithin || 'any',
        maxJobsPerCompany: Math.min(Math.max(Number(body.maxJobsPerCompany) || 0, 0), 50),

        companySizes: cleanList(body.companySizes).filter((v) => COMPANY_SIZE_BANDS.some((b) => b.value === v)),
        includeUnknownSize: Boolean(body.includeUnknownSize),
        filterKeywords: cleanList(body.filterKeywords),
        filterMatchIn: cleanList(body.filterMatchIn).length ? cleanList(body.filterMatchIn) : DEFAULT_MATCH_IN,
        excludeWords: cleanList(body.excludeWords),
        excludeMatchIn: cleanList(body.excludeMatchIn).length ? cleanList(body.excludeMatchIn) : DEFAULT_MATCH_IN,
        wholeWordMatch: body.wholeWordMatch !== false,
        dropBankVps: body.dropBankVps === true,
        includeIndustries: cleanList(body.includeIndustries),
        excludeIndustries: cleanList(body.excludeIndustries),
        excludeCompanies: cleanList(body.excludeCompanies),
        seniorityLevels: cleanList(body.seniorityLevels),
        employmentTypes: cleanList(body.employmentTypes),
        agencyMode: oneOf(body.agencyMode, Object.values(AGENCY_MODE), DEFAULT_AGENCY_MODE),

        webhookUrl: String(body.webhookUrl || '').trim(),
        deliveryMode: oneOf(body.deliveryMode, Object.values(DELIVERY_MODE), DEFAULT_DELIVERY_MODE),
        findMissingDomains: body.findMissingDomains !== false,
        extractSalaries: body.extractSalaries !== false,
        cleanTitles: body.cleanTitles !== false,
        salaryMin: body.salaryMin === '' || body.salaryMin === null || body.salaryMin === undefined ? null : Math.max(0, Number(body.salaryMin) || 0),
        salaryMax: body.salaryMax === '' || body.salaryMax === null || body.salaryMax === undefined ? null : Math.max(0, Number(body.salaryMax) || 0),
        includeNoSalary: body.includeNoSalary !== false,
        launchSpacingMinutes: Math.min(Math.max(Number(body.launchSpacingMinutes) || 0, 0), 24 * 60),
        maxConcurrentRuns: Math.min(Math.max(Math.round(Number(body.maxConcurrentRuns)) || DEFAULT_MAX_CONCURRENT_RUNS, 1), MAX_ACTOR_RUNS_GLOBAL),
        cooldownDays: Math.min(
            Math.max(body.cooldownDays === undefined || body.cooldownDays === null || body.cooldownDays === '' ? DEFAULT_COOLDOWN_DAYS : Number(body.cooldownDays) || 0, 0),
            MAX_COOLDOWN_DAYS
        ),
    };

    if (!inputs.keywords.length) throw new Error('Add at least one job title to search.');
    if (!inputs.platforms.length) throw new Error('Pick at least one job board.');
    if (!isValidWebhookUrl(inputs.webhookUrl)) throw new Error('Enter a valid webhook URL (must start with https://).');
    if (inputs.salaryMin !== null && inputs.salaryMax !== null && inputs.salaryMin > inputs.salaryMax) {
        throw new Error('Minimum salary is larger than maximum.');
    }

    return inputs;
};

const MINUTE_MS = 60 * 1000;

/**
 * Creates the Job with every keyword × platform search queued, then starts
 * as many as the concurrency caps allow right away. The rest start from the
 * scheduler tick as slots free up (and, for schedules, as their spaced
 * launch time arrives).
 */
export const launchSearch = async (inputs, { scheduleId = null, skipAlreadySent = false } = {}) => {
    const jobId = randomUUID();
    const spacing = Number(inputs.launchSpacingMinutes) || 0;
    const now = Date.now();

    const pendingLaunches = inputs.keywords.flatMap((keyword, i) =>
        inputs.platforms.map((platform) => ({
            keyword,
            platform,
            launchAt: new Date(now + i * spacing * MINUTE_MS),
        }))
    );

    const job = await Job.create({
        jobId,
        status: JOB_STATUS.SCRAPING,
        inputs,
        scheduleId,
        skipAlreadySent,
        pendingLaunches,
        apifyRuns: [],
    });

    await launchDueSearches({ onlyJobId: jobId });

    const fresh = await Job.findOne({ jobId });
    const running = fresh.apifyRuns.some((run) => run.status === 'RUNNING');
    const queued = fresh.pendingLaunches.length > 0;

    if (!running && !queued) {
        // every launch we tried failed and nothing is left to try
        const message = fresh.apifyRuns.find((run) => run.error)?.error || 'No search could be started';
        fresh.status = JOB_STATUS.FAILED;
        fresh.error = `Could not start the scrape: ${message}`;
        await fresh.save();
        throw new Error(message);
    }

    return fresh;
};
