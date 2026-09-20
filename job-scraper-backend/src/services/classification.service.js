import { classifyWithGpt, classifyWithPerplexity } from './ai.service.js';
import { CLASSIFICATION_SOURCE, AI_BATCH_SIZE, AI_BATCH_DELAY_MS } from '../constants/aiConstants.js';

const classifyOne = async (company) => {
    try {
        if (company.companyDescription) {
            const result = await classifyWithGpt(company);
            return { ...result, source: CLASSIFICATION_SOURCE.GPT };
        }

        if (company.companyWebsite) {
            const result = await classifyWithPerplexity(company);
            return { ...result, source: CLASSIFICATION_SOURCE.PERPLEXITY };
        }

        // nothing to go on — keep it rather than silently dropping
        return {
            isStaffingAgency: false,
            reason: 'No description or website available to classify',
            source: CLASSIFICATION_SOURCE.SKIPPED,
        };
    } catch (error) {
        console.error(`Classification failed for ${company.companyName}:`, error.message);
        return {
            isStaffingAgency: false,
            reason: `Classification error: ${error.message}`,
            source: CLASSIFICATION_SOURCE.SKIPPED,
        };
    }
};

// Returns a Map of company key -> classification.
export const classifyCompanies = async (companies) => {
    const results = new Map();

    // batched parallel — fast, without firing 100 requests at once
    for (let i = 0; i < companies.length; i += AI_BATCH_SIZE) {
        const batch = companies.slice(i, i + AI_BATCH_SIZE);
        const classified = await Promise.all(
            batch.map(async (company) => [company.key, await classifyOne(company)])
        );
        classified.forEach(([key, result]) => results.set(key, result));

        // pause between batches to respect rate limits
        if (i + AI_BATCH_SIZE < companies.length) {
            await new Promise((resolve) => setTimeout(resolve, AI_BATCH_DELAY_MS));
        }
    }

    return results;
};
