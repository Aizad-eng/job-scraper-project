import { randomUUID } from 'crypto';
import Job from '../models/job.model.js';
import { triggerActorRun } from './apify.service.js';
import { JOB_STATUS, PLATFORMS } from '../constants/apifyConstants.js';
import { AGENCY_MODE, DEFAULT_AGENCY_MODE, DEFAULT_MATCH_IN, COMPANY_SIZE_BANDS } from '../constants/filterConstants.js';
import { DELIVERY_MODE, DEFAULT_DELIVERY_MODE } from '../constants/deliveryConstants.js';

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
        jobsPerKeyword: Math.min(Math.max(Number(body.jobsPerKeyword) || 25, 1), 1000),
        postedWithin: body.postedWithin || 'any',
        maxJobsPerCompany: Math.min(Math.max(Number(body.maxJobsPerCompany) || 0, 0), 50),

        companySizes: cleanList(body.companySizes).filter((v) => COMPANY_SIZE_BANDS.some((b) => b.value === v)),
        includeUnknownSize: Boolean(body.includeUnknownSize),
        filterKeywords: cleanList(body.filterKeywords),
        filterMatchIn: cleanList(body.filterMatchIn).length ? cleanList(body.filterMatchIn) : DEFAULT_MATCH_IN,
        excludeWords: cleanList(body.excludeWords),
        excludeMatchIn: cleanList(body.excludeMatchIn).length ? cleanList(body.excludeMatchIn) : DEFAULT_MATCH_IN,
        includeIndustries: cleanList(body.includeIndustries),
        excludeIndustries: cleanList(body.excludeIndustries),
        excludeCompanies: cleanList(body.excludeCompanies),
        seniorityLevels: cleanList(body.seniorityLevels),
        employmentTypes: cleanList(body.employmentTypes),
        agencyMode: oneOf(body.agencyMode, Object.values(AGENCY_MODE), DEFAULT_AGENCY_MODE),

        webhookUrl: String(body.webhookUrl || '').trim(),
        deliveryMode: oneOf(body.deliveryMode, Object.values(DELIVERY_MODE), DEFAULT_DELIVERY_MODE),
    };

    if (!inputs.keywords.length) throw new Error('Add at least one job title to search.');
    if (!inputs.platforms.length) throw new Error('Pick at least one job board.');
    if (!isValidWebhookUrl(inputs.webhookUrl)) throw new Error('Enter a valid webhook URL (must start with https://).');

    return inputs;
};

// Creates the Job and starts one Apify run per keyword × platform.
export const launchSearch = async (inputs, { scheduleId = null, skipAlreadySent = false } = {}) => {
    const jobId = randomUUID();
    const job = await Job.create({
        jobId,
        status: JOB_STATUS.SCRAPING,
        inputs,
        scheduleId,
        skipAlreadySent,
    });

    const callbackUrl = `${process.env.PUBLIC_BASE_URL}/api/apify-webhook?s=${process.env.WEBHOOK_SECRET}`;
    const apifyRuns = [];

    try {
        for (const keyword of inputs.keywords) {
            for (const platform of inputs.platforms) {
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
                apifyRuns.push({ runId, platform, keyword, status: 'RUNNING' });
            }
        }
    } catch (error) {
        // Don't leave a half-started job hanging in "scraping" forever.
        const message = error.response?.data?.error?.message || error.message;
        job.apifyRuns = apifyRuns;
        job.status = JOB_STATUS.FAILED;
        job.error = `Could not start the scrape: ${message}`;
        await job.save();
        throw new Error(message);
    }

    job.apifyRuns = apifyRuns;
    await job.save();

    return job;
};
