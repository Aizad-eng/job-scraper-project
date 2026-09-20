import axios from 'axios';
import {
    DELIVERY_MODE,
    DELIVERY_CONCURRENCY,
    DELIVERY_MAX_PER_SECOND,
    DELIVERY_TIMEOUT_MS,
    DELIVERY_MAX_ATTEMPTS,
    DELIVERY_RETRY_BASE_MS,
    DELIVERY_PROGRESS_EVERY,
} from '../constants/deliveryConstants.js';
import { groupByCompany } from '../helpers/jobHelpers.js';

// ---------------------------------------------------------------------------
// Payload shapes. Flat keys so Clay / Sheets / Zapier map them to columns.
// ---------------------------------------------------------------------------

const jobFields = (job) => ({
    jobTitle: job.title ?? null,
    jobUrl: job.link ?? null,
    applyUrl: job.applyUrl ?? null,
    jobLocation: job.location ?? null,
    postedAt: job.postedAt ?? null,
    employmentType: job.employmentType ?? null,
    seniorityLevel: job.seniorityLevel ?? null,
    jobFunction: job.jobFunction ?? null,
    salary: job.salaryInfo ?? null,
    salaryMinPerYear: job.salaryMinPerYear ?? null,
    salaryMaxPerYear: job.salaryMaxPerYear ?? null,
    applicants: job.applicantsCount ?? null,
    jobPosterName: job.jobPosterName ?? null,
    jobPosterTitle: job.jobPosterTitle ?? null,
    jobPosterProfileUrl: job.jobPosterProfileUrl ?? null,
    jobDescription: job.descriptionText ?? null,
    platform: job.platform ?? null,
    searchKeyword: job.searchKeyword ?? null,
});

const companyFields = (source) => ({
    companyName: source.companyName ?? null,
    companyDomain: source.companyDomain ?? null,
    companyWebsite: source.companyWebsite ?? null,
    companyLinkedinUrl: source.companyLinkedinUrl ?? null,
    // LinkedIn company page or Indeed company page, whichever board it came from
    companyProfileUrl: source.companyProfileUrl ?? source.companyLinkedinUrl ?? null,
    companyIndustry: source.companyIndustry ?? null,
    companySize: source.companyEmployeesCount ?? null,
    companyHeadquarters: source.companyHeadquarters ?? null,
    companyType: source.companyType ?? null,
    companyFounded: source.companyFounded ?? null,
    companySpecialties: source.companySpecialties ?? null,
    companyDescription: source.companyDescription ?? null,
    isStaffingAgency: source.isStaffingAgency ?? null,
    staffingAgencyReason: source.agencyReason ?? null,
    // from the website check (ScrapingDog / Claude), when it ran
    aiIndustry: source.aiIndustry ?? null,
    aiSummary: source.aiSummary ?? null,
    aiSource: source.aiSource ?? null,
});

const buildJobPayload = (job, meta) => ({
    ...jobFields(job),
    ...companyFields(job),
    ...meta,
});

const buildCompanyPayload = (company, meta) => {
    const first = company.jobs[0] || {};
    return {
        ...companyFields({ ...company, ...first }),
        openRolesFound: company.jobs.length,
        firstJobTitle: first.title ?? null,
        firstJobUrl: first.link ?? null,
        firstJobLocation: first.location ?? null,
        firstJobPostedAt: first.postedAt ?? null,
        allJobTitles: company.jobs.map((job) => job.title).filter(Boolean).join(' | '),
        jobs: company.jobs.map((job) => ({
            title: job.title ?? null,
            url: job.link ?? null,
            location: job.location ?? null,
            postedAt: job.postedAt ?? null,
            seniorityLevel: job.seniorityLevel ?? null,
            employmentType: job.employmentType ?? null,
            platform: job.platform ?? null,
        })),
        platform: first.platform ?? null,
        searchKeyword: first.searchKeyword ?? null,
        ...meta,
    };
};

export const buildPayloads = (jobs, mode, meta = {}) => {
    if (mode === DELIVERY_MODE.COMPANY) {
        return groupByCompany(jobs).map((company) => buildCompanyPayload(company, meta));
    }
    return jobs.map((job) => buildJobPayload(job, meta));
};

// The identity of a payload for "already sent" checks: the listing URL, or
// the company domain / name in company mode.
export const payloadKey = (payload, mode) =>
    mode === DELIVERY_MODE.COMPANY
        ? (payload.companyDomain || payload.companyName || '').toLowerCase().trim()
        : (payload.jobUrl || `${payload.companyName}|${payload.jobTitle}`).toLowerCase().trim();

// A realistic record so the receiver can set up its columns.
export const buildSamplePayload = (mode, meta = {}) => {
    const sampleJob = {
        title: 'Senior Software Engineer',
        link: 'https://www.linkedin.com/jobs/view/0000000000',
        applyUrl: 'https://example.com/careers/123',
        location: 'Austin, Texas, United States',
        postedAt: new Date().toISOString().slice(0, 10),
        employmentType: 'Full-time',
        seniorityLevel: 'Mid-Senior level',
        jobFunction: 'Engineering',
        salaryInfo: '$140,000/yr - $180,000/yr',
        applicantsCount: '25 applicants',
        jobPosterName: 'Jane Doe',
        jobPosterTitle: 'Head of Engineering at Example Co',
        jobPosterProfileUrl: 'https://www.linkedin.com/in/janedoe',
        descriptionText: 'This is a sample job description sent by the test button.',
        platform: 'linkedin',
        searchKeyword: 'software engineer',
        companyName: 'Example Co',
        companyDomain: 'example.com',
        companyWebsite: 'https://www.example.com/',
        companyLinkedinUrl: 'https://www.linkedin.com/company/example-co',
        companyProfileUrl: 'https://www.linkedin.com/company/example-co',
        companyIndustry: 'Software Development',
        companyEmployeesCount: '51-200 employees',
        companyHeadquarters: 'Austin, TX',
        companyType: 'Privately Held',
        companyFounded: '2015',
        companySpecialties: 'SaaS, Analytics',
        companyDescription: 'Example Co builds analytics software for retailers.',
        isStaffingAgency: false,
        agencyReason: 'scrapingdog: Example Co builds analytics software for retailers and hires for its own team.',
        aiIndustry: 'Software Development',
        aiSummary: 'Example Co builds analytics software for retailers and hires for its own team.',
        aiSource: 'scrapingdog',
    };

    return buildPayloads([sampleJob], mode, { ...meta, isTest: true })[0];
};

// ---------------------------------------------------------------------------
// Sending
// ---------------------------------------------------------------------------

const isRetryable = (error) => {
    const status = error.response?.status;
    if (!status) return true;                 // network / timeout
    return status === 408 || status === 429 || status >= 500;
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Global spacing between requests: at most DELIVERY_MAX_PER_SECOND per second
// across all workers, retries included.
const MIN_GAP_MS = Math.ceil(1000 / DELIVERY_MAX_PER_SECOND);
let nextSlotAt = 0;

const waitForSlot = async () => {
    const now = Date.now();
    const slot = Math.max(now, nextSlotAt);
    nextSlotAt = slot + MIN_GAP_MS;
    if (slot > now) await sleep(slot - now);
};

export const postOnce = async (url, payload) => {
    await waitForSlot();
    return axios.post(url, payload, {
        timeout: DELIVERY_TIMEOUT_MS,
        headers: { 'Content-Type': 'application/json' },
        maxRedirects: 0,
    });
};

export const postWithRetry = async (url, payload) => {
    let lastError;

    for (let attempt = 1; attempt <= DELIVERY_MAX_ATTEMPTS; attempt += 1) {
        try {
            const response = await postOnce(url, payload);
            return { ok: true, status: response.status };
        } catch (error) {
            lastError = error;
            if (!isRetryable(error) || attempt === DELIVERY_MAX_ATTEMPTS) break;

            const retryAfter = Number(error.response?.headers?.['retry-after']);
            const wait = retryAfter ? retryAfter * 1000 : DELIVERY_RETRY_BASE_MS * 2 ** (attempt - 1);
            await sleep(wait);
        }
    }

    const status = lastError?.response?.status;
    const message = status
        ? `HTTP ${status}${lastError.response?.statusText ? ` ${lastError.response.statusText}` : ''}`
        : lastError?.message || 'Unknown error';

    return { ok: false, status: status ?? null, error: message };
};

/**
 * Posts every payload with a small worker pool. `onProgress` is called every
 * few records and once at the end with { sent, failed, lastError }.
 */
export const deliverAll = async (url, payloads, onProgress = async () => {}) => {
    let index = 0;
    let sent = 0;
    let failed = 0;
    let lastError = null;
    let sinceReport = 0;
    const failedIndexes = [];

    const report = async () => {
        sinceReport = 0;
        await onProgress({ sent, failed, lastError });
    };

    const worker = async () => {
        while (index < payloads.length) {
            const current = index;
            const payload = payloads[current];
            index += 1;

            const result = await postWithRetry(url, payload);
            if (result.ok) sent += 1;
            else {
                failed += 1;
                lastError = result.error;
                failedIndexes.push(current);
            }

            sinceReport += 1;
            if (sinceReport >= DELIVERY_PROGRESS_EVERY) await report();
        }
    };

    const workers = Array.from(
        { length: Math.min(DELIVERY_CONCURRENCY, payloads.length) },
        () => worker()
    );
    await Promise.all(workers);
    await report();

    return { sent, failed, lastError, failedIndexes };
};
