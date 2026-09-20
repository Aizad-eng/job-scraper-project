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

// Lower-case, punctuation -> spaces, padded, so phrases can be matched as
// whole words: "v.p. sales" -> " v p sales ", "Director, Finance" -> " director finance ".
// + and # survive so "c++" and "c#" still work.
const normalizeForMatch = (text) =>
    ` ${String(text || '').toLowerCase().replace(/[^a-z0-9+#]+/g, ' ').trim()} `;

const buildHaystack = (job, matchIn) =>
    normalizeForMatch(
        (matchIn || []).map((field) => job[MATCH_IN_FIELD_MAP[field]] || '').join(' ')
    );

// Whole-word: "cto" matches "CTO" but not "director"; "vp" not "vpn".
// Substring: the old behaviour, "react" matches "reactjs".
export const phraseMatches = (haystack, phrase, wholeWord = true) => {
    const needle = normalizeForMatch(phrase).trim();
    if (!needle) return false;
    return wholeWord ? haystack.includes(` ${needle} `) : haystack.includes(needle);
};

// true if ANY keyword appears in ANY of the selected fields
export const matchesFilterKeywords = (job, keywords, matchIn, wholeWord = true) => {
    if (!keywords?.length) return true;      // no keywords = filter off
    if (!matchIn?.length) return true;       // no fields selected = filter off

    const haystack = buildHaystack(job, matchIn);
    if (!haystack.trim()) return false;

    return keywords.some((keyword) => phraseMatches(haystack, keyword, wholeWord));
};

// the excluded word that appears in the selected fields, or null
export const findExcludedWord = (job, words, matchIn, wholeWord = true) => {
    if (!words?.length || !matchIn?.length) return null;
    const haystack = buildHaystack(job, matchIn);
    return words.find((word) => phraseMatches(haystack, word, wholeWord)) || null;
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

// First non-empty value among several candidate keys. Actors rename fields
// now and then (company / companyName / company_name), so every important
// field lists its alternates instead of trusting one name.
const pick = (obj, ...keys) => {
    for (const key of keys) {
        const value = obj?.[key];
        if (value !== undefined && value !== null && value !== '') return value;
    }
    return null;
};

// Indeed actor -> the shared row shape (same keys the LinkedIn actor uses)
const normalizeIndeedJob = (job) => ({
    id: pick(job, 'jobKey', 'jobkey', 'id'),
    title: pick(job, 'title', 'jobTitle', 'job_title'),
    link: pick(job, 'url', 'jobUrl', 'job_url', 'link'),
    applyUrl: pick(job, 'originalApplyUrl', 'applyUrl', 'apply_url'),
    location: pick(job, 'jobLocationShort', 'jobLocationFull', 'location', 'jobLocation'),
    postedAt: pick(job, 'datePublishedClean', 'datePublished', 'postedAt', 'date_published'),
    descriptionText: pick(job, 'description', 'descriptionText', 'jobDescription', 'job_description'),
    employmentType: pick(job, 'jobType', 'employmentType', 'job_type'),
    seniorityLevel: pick(job, 'seniorityLevel', 'seniority_level'),
    jobFunction: null,
    salaryInfo: pick(job, 'salaryFormatted', 'salary', 'salaryInfo'),
    salaryMinPerYear: pick(job, 'salaryMinPerYear'),
    salaryMaxPerYear: pick(job, 'salaryMaxPerYear'),
    companyName: pick(job, 'company', 'companyName', 'company_name'),
    companyWebsite: pick(job, 'companyWebsite', 'company_website', 'website'),
    companyDomain: pick(job, 'companyDomain', 'company_domain'),
    companyIndustry: pick(job, 'companyIndustry', 'companyIndustryRaw', 'company_industry', 'industry'),
    companyEmployeesCount: pick(job, 'companyEmployeeRange', 'companyEmployeesCount', 'companySize', 'company_size'),
    companyDescription: pick(job, 'companyDescription', 'companyBriefDescription', 'company_description'),
    companyHeadquarters: pick(job, 'companyAddressFull', 'companyHeadquarters', 'company_headquarters'),
    companyCeoName: pick(job, 'companyCeoName'),
    companyRating: pick(job, 'companyRating'),
    companyRevenue: pick(job, 'companyRevenue'),
    companyLinkedinUrl: null,
    companyProfileUrl: pick(job, 'companyIndeedUrl', 'companyUrl', 'company_url'),
    platform: PLATFORMS.INDEED,
});

// LinkedIn actor already uses the shared names; fill the few that can vary.
const normalizeLinkedinJob = (job) => ({
    ...job,
    title: pick(job, 'title', 'jobTitle'),
    link: pick(job, 'link', 'url', 'jobUrl'),
    companyName: pick(job, 'companyName', 'company', 'company_name'),
    companyEmployeesCount: pick(job, 'companyEmployeesCount', 'companySize', 'companyEmployeeRange'),
    postedAt: pick(job, 'postedAt', 'datePublished', 'postedDate'),
    salaryMinPerYear: pick(job, 'salaryMinPerYear'),
    salaryMaxPerYear: pick(job, 'salaryMaxPerYear'),
    companyProfileUrl: pick(job, 'companyLinkedinUrl', 'companyUrl'),
    platform: PLATFORMS.LINKEDIN,
});

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
                companyProfileUrl: job.companyProfileUrl,
                companyDomainSource: job.companyDomainSource,
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

const normalizeTitle = (title) =>
    String(title || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/**
 * Drops repeated listings inside one run: the same posting returned by two
 * keyword searches (same board + id/url), and the same title at the same
 * company seen on two boards. First occurrence wins.
 */
export const dedupeListings = (jobs) => {
    const seenIds = new Set();
    const seenTitles = new Set();
    const kept = [];
    const removed = [];

    jobs.forEach((job) => {
        const idKey = `${job.platform}|${(job.link || job.id || '').toLowerCase().trim()}`;
        if ((job.link || job.id) && seenIds.has(idKey)) {
            removed.push({ companyName: job.companyName || null, title: job.title || null, reason: 'duplicate_listing', detail: 'same listing from another search' });
            return;
        }
        if (job.link || job.id) seenIds.add(idKey);

        const company = companyKey(job);
        const title = normalizeTitle(job.title);
        if (company && title) {
            const titleKey = `${company}|${title}`;
            if (seenTitles.has(titleKey)) {
                removed.push({ companyName: job.companyName || null, title: job.title || null, reason: 'duplicate_listing', detail: 'same title at this company already kept' });
                return;
            }
            seenTitles.add(titleKey);
        }
        kept.push(job);
    });

    return { kept, removed };
};
