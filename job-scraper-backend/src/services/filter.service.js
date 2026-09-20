import {
    DEFAULT_STAFFING_WORDS,
    STAFFING_MATCH_FIELDS,
    DEFAULT_MATCH_IN,
    REMOVAL_REASON,
    AGENCY_MODE,
} from '../constants/filterConstants.js';
import {
    matchesCompanySize,
    findStaffingWord,
    matchesFilterKeywords,
    findExcludedWord,
    findIndustry,
    findExcludedCompany,
    companyKey,
    isBankVpTitle,
} from '../helpers/jobHelpers.js';

const removal = (job, reason, detail) => ({
    companyName: job.companyName || null,
    title: job.title || null,
    reason,
    detail: detail ?? null,
});

// Cheap, deterministic screens. Runs before any paid AI call.
export const applyRuleFilters = (jobs, options = {}) => {
    const {
        companySizes = [],
        includeUnknownSize = false,
        filterKeywords = [],
        filterMatchIn = DEFAULT_MATCH_IN,
        excludeWords = [],
        excludeMatchIn = DEFAULT_MATCH_IN,
        wholeWordMatch = true,
        dropBankVps = false,
        includeIndustries = [],
        excludeIndustries = [],
        excludeCompanies = [],
        seniorityLevels = [],
        employmentTypes = [],
        agencyMode = AGENCY_MODE.REMOVE,
        staffingWords = DEFAULT_STAFFING_WORDS,
    } = options;

    const kept = [];
    const removed = [];

    jobs.forEach((job) => {
        const excludedCompany = findExcludedCompany(job, excludeCompanies);
        if (excludedCompany) {
            removed.push(removal(job, REMOVAL_REASON.EXCLUDED_COMPANY, excludedCompany));
            return;
        }

        if (!job.companyName) {
            removed.push(removal(job, REMOVAL_REASON.NO_COMPANY_DATA));
            return;
        }

        if (companySizes.length) {
            const inRange = matchesCompanySize(job.companyEmployeesCount, companySizes);
            const keep = inRange === null ? includeUnknownSize : inRange;
            if (!keep) {
                removed.push(removal(job, REMOVAL_REASON.COMPANY_SIZE, job.companyEmployeesCount || 'unknown'));
                return;
            }
        }

        if (includeIndustries.length && !findIndustry(job, includeIndustries)) {
            removed.push(removal(job, REMOVAL_REASON.INDUSTRY, job.companyIndustry || 'unknown'));
            return;
        }

        const excludedIndustry = findIndustry(job, excludeIndustries);
        if (excludedIndustry) {
            removed.push(removal(job, REMOVAL_REASON.INDUSTRY, excludedIndustry));
            return;
        }

        if (!matchesFilterKeywords(job, filterKeywords, filterMatchIn, wholeWordMatch)) {
            removed.push(removal(job, REMOVAL_REASON.KEYWORD_MISMATCH, `no match in ${filterMatchIn.join(' or ')}`));
            return;
        }

        const excludedWord = findExcludedWord(job, excludeWords, excludeMatchIn, wholeWordMatch);
        if (excludedWord) {
            removed.push(removal(job, REMOVAL_REASON.EXCLUDED_WORD, excludedWord));
            return;
        }

        if (dropBankVps && isBankVpTitle(job)) {
            removed.push(removal(job, REMOVAL_REASON.BANK_VP, job.companyName));
            return;
        }

        // LinkedIn-only fields. A job with no value is kept, not punished.
        if (seniorityLevels.length && job.seniorityLevel && !seniorityLevels.includes(job.seniorityLevel)) {
            removed.push(removal(job, REMOVAL_REASON.SENIORITY, job.seniorityLevel));
            return;
        }

        if (employmentTypes.length && job.employmentType && !employmentTypes.includes(job.employmentType)) {
            removed.push(removal(job, REMOVAL_REASON.EMPLOYMENT_TYPE, job.employmentType));
            return;
        }

        if (agencyMode !== AGENCY_MODE.OFF) {
            const matchedField = STAFFING_MATCH_FIELDS.find((field) =>
                findStaffingWord(job[field], staffingWords)
            );

            if (matchedField) {
                removed.push(removal(
                    job,
                    REMOVAL_REASON.STAFFING_WORD,
                    `${matchedField}: ${findStaffingWord(job[matchedField], staffingWords)}`
                ));
                return;
            }
        }

        kept.push(job);
    });

    return { kept, removed };
};

// Keeps at most `cap` jobs per company. 0 = no cap.
export const applyPerCompanyCap = (jobs, cap) => {
    if (!cap || cap < 1) return { kept: jobs, removed: [] };

    const seen = new Map();
    const kept = [];
    const removed = [];

    jobs.forEach((job) => {
        const key = companyKey(job) || `__${kept.length}`;
        const count = seen.get(key) || 0;
        if (count >= cap) {
            removed.push(removal(job, REMOVAL_REASON.PER_COMPANY_CAP, `cap ${cap}`));
            return;
        }
        seen.set(key, count + 1);
        kept.push(job);
    });

    return { kept, removed };
};
