import {
    COMPANY_SIZE_BANDS,
    STRIPPED_JOB_FIELDS,
    MATCH_IN_FIELD_MAP,
} from '../constants/filterConstants.js';
import { PLATFORMS } from '../constants/apifyConstants.js';

// '51-200 employees' -> { min: 51, max: 200 }
// '51 to 200'        -> { min: 51, max: 200 }
// '10,001+ employees' -> { min: 10001, max: Infinity }
export const parseEmployeeCount = (raw) => {
    if (!raw) return null;
    const cleaned = String(raw).replace(/,/g, '');

    const range = cleaned.match(/(\d+)\s*(?:-|–|to)\s*(\d+)/i);
    if (range) return { min: Number(range[1]), max: Number(range[2]) };

    const plus = cleaned.match(/(\d+)\s*\+/);
    if (plus) return { min: Number(plus[1]), max: Infinity };

    const single = cleaned.match(/(\d+)/);
    if (single) return { min: Number(single[1]), max: Number(single[1]) };

    return null;
};

// true when the company's reported size overlaps any selected band.
// Returns null when the size is unknown so the caller can decide.
export const matchesCompanySize = (raw, selectedBands) => {
    const parsed = parseEmployeeCount(raw);
    if (!parsed) return null;

    return selectedBands.some((value) => {
        const band = COMPANY_SIZE_BANDS.find((b) => b.value === value);
        if (!band) return false;
        return parsed.min <= band.max && parsed.max >= band.min;
    });
};

// whole-word match; dots and hyphens count as breaks
export const findStaffingWord = (text, words) => {
    if (!text) return null;
    const normalized = ` ${String(text).toLowerCase().replace(/[^a-z0-9+#]+/g, ' ').trim()} `;
    return words.find((word) => normalized.includes(` ${word.toLowerCase()} `)) || null;
};

export const stripJobFields = (job) => {
    const cleaned = { ...job };
    STRIPPED_JOB_FIELDS.forEach((field) => delete cleaned[field]);
    return cleaned;
};

const buildHaystack = (job, matchIn) =>
    (matchIn || [])
        .map((field) => job[MATCH_IN_FIELD_MAP[field]] || '')
        .join(' ')
        .toLowerCase();

// true if ANY keyword appears in ANY of the selected fields
export const matchesFilterKeywords = (job, keywords, matchIn) => {
    if (!keywords?.length) return true;      // no keywords = filter off
    if (!matchIn?.length) return true;       // no fields selected = filter off

    const haystack = buildHaystack(job, matchIn);
    if (!haystack.trim()) return false;

    return keywords.some((keyword) => haystack.includes(keyword.toLowerCase().trim()));
};

// the excluded word that appears in the selected fields, or null
export const findExcludedWord = (job, words, matchIn) => {
    if (!words?.length || !matchIn?.length) return null;
    const haystack = buildHaystack(job, matchIn);
    return words.find((word) => haystack.includes(word.toLowerCase().trim())) || null;
};

const industryText = (job) =>
    [job.companyIndustry, job.industries].filter(Boolean).join(' ').toLowerCase();

// substring match on the company's industry labels
export const findIndustry = (job, industries) => {
    if (!industries?.length) return null;
    const text = industryText(job);
    if (!text) return null;
    return industries.find((name) => text.includes(name.toLowerCase().trim())) || null;
};

export const normalizeDomain = (domain) => {
    if (!domain) return '';
    return String(domain)
        .toLowerCase()
        .replace(/^https?:\/\//, '')
        .replace(/^www\./, '')
        .replace(/\/.*$/, '')
        .trim();
};

// matches a company by exact name (case-insensitive) or by domain
export const findExcludedCompany = (job, excluded) => {
    if (!excluded?.length) return null;
    const name = (job.companyName || '').toLowerCase().trim();
    const domain = normalizeDomain(job.companyDomain || job.companyWebsite);

    return excluded.find((entry) => {
        const needle = entry.toLowerCase().trim();
        if (!needle) return false;
        if (needle.includes('.')) return domain === normalizeDomain(needle);
        return name === needle;
    }) || null;
};

const normalizeIndeedJob = (job) => ({
    id: job.jobKey,
    title: job.title,
    link: job.url,
    applyUrl: job.originalApplyUrl,
    location: job.jobLocationShort || job.jobLocationFull,
    postedAt: job.datePublishedClean,
    descriptionText: job.description,
    employmentType: job.jobType || null,
    seniorityLevel: null,
    jobFunction: null,
    salaryInfo: job.salaryFormatted,
    companyName: job.company,
    companyWebsite: job.companyWebsite,
    companyDomain: job.companyDomain,
    companyIndustry: job.companyIndustry || job.companyIndustryRaw,
    companyEmployeesCount: job.companyEmployeeRange,
    companyDescription: job.companyDescription || job.companyBriefDescription,
    companyHeadquarters: job.companyAddressFull,
    companyCeoName: job.companyCeoName,
    companyRating: job.companyRating,
    companyRevenue: job.companyRevenue,
    companyLinkedinUrl: null,
    platform: PLATFORMS.INDEED,
});

const normalizeLinkedinJob = (job) => ({ ...job, platform: PLATFORMS.LINKEDIN });

export const normalizeJob = (job, platform, keyword) => ({
    ...(platform === PLATFORMS.INDEED ? normalizeIndeedJob(job) : normalizeLinkedinJob(job)),
    searchKeyword: keyword,
});

export const companyKey = (job) =>
    normalizeDomain(job.companyDomain) || (job.companyName || '').toLowerCase().trim();

// unique companies, so we classify once per company
export const groupByCompany = (jobs) => {
    const companies = new Map();

    jobs.forEach((job) => {
        const key = companyKey(job);
        if (!key) return;

        if (!companies.has(key)) {
            companies.set(key, {
                key,
                companyName: job.companyName,
                companyDomain: job.companyDomain,
                companyWebsite: job.companyWebsite,
                companyIndustry: job.companyIndustry,
                companyDescription: job.companyDescription,
                companyEmployeesCount: job.companyEmployeesCount,
                companyHeadquarters: job.companyHeadquarters,
                companyType: job.companyType,
                companyFounded: job.companyFounded,
                companyLinkedinUrl: job.companyLinkedinUrl,
                jobs: [],
            });
        }

        companies.get(key).jobs.push(job);
    });

    return [...companies.values()];
};

export const countByReason = (removed) =>
    removed.reduce((acc, item) => {
        acc[item.reason] = (acc[item.reason] || 0) + 1;
        return acc;
    }, {});
