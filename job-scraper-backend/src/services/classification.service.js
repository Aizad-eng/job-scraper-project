import { classifyWithGpt, classifyWithPerplexity } from './ai.service.js';
import { askScrapingDog, hasScrapingDog } from './scrapingdog.service.js';
import { coerceCompanyCheck, hasClaude } from './claude.service.js';
import { CLASSIFICATION_SOURCE, AI_BATCH_SIZE, AI_BATCH_DELAY_MS } from '../constants/aiConstants.js';

// Yes -> agency, No -> direct employer, Unknown -> undecided (kept, not dropped)
const fromCompanyCheck = (check, source) => ({
    isStaffingAgency: check.is_recruitment_firm === 'Yes' ? true : check.is_recruitment_firm === 'No' ? false : null,
    reason: check.description || `Answer: ${check.is_recruitment_firm}`,
    industry: check.industry,
    summary: check.description,
    source,
});

// Primary check: Google AI Mode via ScrapingDog, with Claude tidying any
// answer that is not clean JSON. Returns null when it cannot decide, so the
// caller can fall back to the older classifiers.
const checkWithScrapingDog = async (company, deps) => {
    const { text, parsed } = await askScrapingDog(company.companyWebsite, deps);

    if (parsed) return fromCompanyCheck(parsed, CLASSIFICATION_SOURCE.SCRAPINGDOG);

    if (text && (hasClaude() || deps.anthropic)) {
        const fixed = await coerceCompanyCheck(text, company.companyWebsite, deps);
        if (fixed) return fromCompanyCheck(fixed, CLASSIFICATION_SOURCE.SCRAPINGDOG_CLAUDE);
    }

    return null;
};

export const classifyOne = async (company, deps = {}) => {
    if (company.companyWebsite && (hasScrapingDog() || deps.request)) {
        try {
            const result = await checkWithScrapingDog(company, deps);
            if (result) return result;
            console.warn(`ScrapingDog gave no usable answer for ${company.companyName}, falling back`);
        } catch (error) {
            console.error(`ScrapingDog failed for ${company.companyName}:`, error.response?.status || error.message);
        }
    }

    try {
        if (company.companyDescription && process.env.OPENAI_API_KEY) {
            const result = await classifyWithGpt(company);
            return { ...result, source: CLASSIFICATION_SOURCE.GPT };
        }

        if (company.companyWebsite && process.env.PERPLEXITY_API_KEY) {
            const result = await classifyWithPerplexity(company);
            return { ...result, source: CLASSIFICATION_SOURCE.PERPLEXITY };
        }

        // nothing to go on — keep it rather than silently dropping
        return {
            isStaffingAgency: null,
            reason: 'No classifier available for this company',
            source: CLASSIFICATION_SOURCE.SKIPPED,
        };
    } catch (error) {
        console.error(`Classification failed for ${company.companyName}:`, error.message);
        return {
            isStaffingAgency: null,
            reason: `Classification error: ${error.message}`,
            source: CLASSIFICATION_SOURCE.SKIPPED,
        };
    }
};

// Returns a Map of company key -> classification.
export const classifyCompanies = async (companies, deps = {}, onProgress = null) => {
    const results = new Map();

    // batched parallel — fast, without firing 100 requests at once
    for (let i = 0; i < companies.length; i += AI_BATCH_SIZE) {
        const batch = companies.slice(i, i + AI_BATCH_SIZE);
        const classified = await Promise.all(
            batch.map(async (company) => [company.key, await classifyOne(company, deps)])
        );
        classified.forEach(([key, result]) => results.set(key, result));
        if (onProgress) await onProgress(results.size, companies.length, results);

        if (AI_BATCH_DELAY_MS > 0 && i + AI_BATCH_SIZE < companies.length) {
            await new Promise((resolve) => setTimeout(resolve, AI_BATCH_DELAY_MS));
        }
    }

    return results;
};
