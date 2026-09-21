import { randomUUID } from 'crypto';
import Job from '../models/job.model.js';
import { triggerActorRun } from './apify.service.js';
import { JOB_STATUS, PLATFORMS } from '../constants/apifyConstants.js';
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

// Starts the Apify runs for one keyword on every platform. Returns the run
// entries; a failed trigger becomes a FAILED entry instead of throwing, so
// one bad launch never strands the job.
export const launchKeyword = async (inputs, keyword, callbackUrl) => {
    const entries = [];
    for (const platform of inputs.platforms) {
        try {
            const runId = await triggerActorRun(
                platform,
                {
                    keyword,
                    location: inputs.location,
                    jobsPerKeyword: inputs.jobsPerKeyword,
                    postedWithin: inputs.postedWithin,
                    maxJobsPerCompany: inputs.maxJobsPerCompany,
                },
                callbackUrl
            );
            entries.push({ runId, platform, keyword, status: 'RUNNING' });
        } catch (error) {
            const message = error.response?.data?.error?.message || error.message;
            console.error(`Could not start ${platform} search for "${keyword}":`, message);
            entries.push({ runId: null, platform, keyword, status: 'FAILED', error: message });
        }
    }
    return entries;
};

export const callbackUrl = () =>
    `${process.env.PUBLIC_BASE_URL}/api/apify-webhook?s=${process.env.WEBHOOK_SECRET}`;

/**
 * Creates the Job and starts the searches. With launchSpacingMinutes > 0 the
 * first keyword starts now and the rest are queued on the job; the
 * scheduler tick launches them when their time comes.
 */
export const launchSearch = async (inputs, { scheduleId = null, skipAlreadySent = false } = {}) => {
    const jobId = randomUUID();
    const spacing = Number(inputs.launchSpacingMinutes) || 0;
    const [first, ...rest] = inputs.keywords;
    const now = Date.now();

    const pendingLaunches = spacing > 0
        ? rest.flatMap((keyword, i) =>
            inputs.platforms.map((platform) => ({
                keyword,
                platform,
                launchAt: new Date(now + (i + 1) * spacing * MINUTE_MS),
            }))
        )
        : [];

    const job = await Job.create({
        jobId,
        status: JOB_STATUS.SCRAPING,
        inputs,
        scheduleId,
        skipAlreadySent,
        pendingLaunches,
    });

    const url = callbackUrl();
    const apifyRuns = [];
    const toLaunchNow = spacing > 0 ? [first] : inputs.keywords;

    for (const keyword of toLaunchNow) {
        apifyRuns.push(...(await launchKeyword(inputs, keyword, url)));
    }

    job.apifyRuns = apifyRuns;

    const nothingStarted = apifyRuns.every((run) => run.status === 'FAILED') && !pendingLaunches.length;
    if (nothingStarted) {
        const message = apifyRuns[0]?.error || 'No search could be started';
        job.status = JOB_STATUS.FAILED;
        job.error = `Could not start the scrape: ${message}`;
        await job.save();
        throw new Error(message);
    }

    await job.save();
    return job;
};
