import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { z } from 'zod';
import {
    SALARY_MODEL,
    SALARY_MAX_DESCRIPTION_CHARS,
    SALARY_CONCURRENCY,
    SALARY_SOURCE,
    SALARY_SYSTEM_PROMPT,
} from '../constants/salaryConstants.js';
import { parseSalaryText, applySalary, hasSalary } from '../helpers/salaryHelpers.js';
import { createLimiter } from '../helpers/limiter.js';
import { hasClaude } from './claude.service.js';

const SalarySchema = z.object({
    found: z.boolean(),
    min: z.number().nullable(),
    max: z.number().nullable(),
    currency: z.string().nullable(),
    period: z.enum(['hour', 'day', 'week', 'month', 'year']).nullable(),
});

let client = null;
const getClient = () => {
    if (!client) client = new Anthropic({ apiKey: process.env.CLAUDE_KEY });
    return client;
};

const limiter = createLimiter(SALARY_CONCURRENCY);

/**
 * Asks Claude Haiku for the pay stated in `text`. Returns
 * { min, max, currency, period } or null when nothing is stated.
 */
export const extractSalaryWithClaude = async (text, { anthropic = null } = {}) => {
    const api = anthropic || getClient();
    const response = await limiter.run(() =>
        api.messages.parse({
            model: SALARY_MODEL,
            max_tokens: 256,
            system: SALARY_SYSTEM_PROMPT,
            output_config: { format: zodOutputFormat(SalarySchema) },
            messages: [{ role: 'user', content: text.slice(0, SALARY_MAX_DESCRIPTION_CHARS) }],
        })
    );

    if (response.stop_reason === 'refusal' || !response.parsed_output) return null;
    const out = response.parsed_output;
    if (!out.found || (out.min === null && out.max === null) || !out.period) return null;
    return { min: out.min ?? out.max, max: out.max ?? out.min, currency: out.currency, period: out.period };
};

/**
 * Fills salaryMinPerYear / salaryMaxPerYear / salaryCurrency / salarySource
 * on every job, cheapest source first. Mutates the jobs.
 * Returns stats { board, parsed, claudeText, claudeDescription, none, failed }.
 */
export const resolveSalaries = async (jobs, { useClaude = true, deps = {} } = {}) => {
    const stats = { board: 0, parsed: 0, claudeText: 0, claudeDescription: 0, none: 0, failed: 0 };
    const needClaude = [];

    jobs.forEach((job) => {
        // 1. numeric annual figures straight from the board (Indeed)
        if (Number.isFinite(Number(job.salaryMinPerYear)) || Number.isFinite(Number(job.salaryMaxPerYear))) {
            const min = Number(job.salaryMinPerYear) || Number(job.salaryMaxPerYear);
            const max = Number(job.salaryMaxPerYear) || min;
            job.salaryMinPerYear = Math.round(min);
            job.salaryMaxPerYear = Math.round(max);
            job.salaryCurrency = job.salaryCurrency || null;
            job.salarySource = SALARY_SOURCE.BOARD;
            stats.board += 1;
            return;
        }

        // 2. deterministic parse of the board's salary text
        const parsed = parseSalaryText(job.salaryInfo);
        if (parsed && applySalary(job, parsed, SALARY_SOURCE.PARSED)) {
            stats.parsed += 1;
            return;
        }

        job.salaryMinPerYear = null;
        job.salaryMaxPerYear = null;
        job.salaryCurrency = null;
        job.salarySource = SALARY_SOURCE.NONE;
        needClaude.push(job);
    });

    const canUseClaude = useClaude && (hasClaude() || deps.anthropic);
    if (!canUseClaude || !needClaude.length) {
        stats.none += needClaude.length;
        return stats;
    }

    // 3. Claude: the board's text first (odd formats), else the description
    await Promise.all(needClaude.map(async (job) => {
        try {
            if (job.salaryInfo) {
                const fromText = await extractSalaryWithClaude(`Salary text: ${job.salaryInfo}`, deps);
                if (fromText && applySalary(job, fromText, SALARY_SOURCE.CLAUDE_TEXT)) {
                    stats.claudeText += 1;
                    return;
                }
            }
            if (job.descriptionText) {
                const fromDescription = await extractSalaryWithClaude(
                    `Job title: ${job.title || ''}\n\nJob description:\n${job.descriptionText}`,
                    deps
                );
                if (fromDescription && applySalary(job, fromDescription, SALARY_SOURCE.CLAUDE_DESCRIPTION)) {
                    stats.claudeDescription += 1;
                    return;
                }
            }
            stats.none += 1;
        } catch (error) {
            stats.failed += 1;
            console.error(`Salary extraction failed for "${job.title}":`, error.message);
        }
    }));

    return stats;
};

/**
 * Keeps jobs whose yearly range overlaps [salaryMin, salaryMax].
 * Jobs with no salary are kept only when includeNoSalary is true.
 */
export const applySalaryFilter = (jobs, { salaryMin = null, salaryMax = null, includeNoSalary = true } = {}) => {
    const active = Number.isFinite(salaryMin) || Number.isFinite(salaryMax);
    if (!active) return { kept: jobs, removed: [] };

    const lower = Number.isFinite(salaryMin) ? salaryMin : 0;
    const upper = Number.isFinite(salaryMax) ? salaryMax : Infinity;
    const kept = [];
    const removed = [];

    jobs.forEach((job) => {
        if (!hasSalary(job)) {
            if (includeNoSalary) kept.push(job);
            else removed.push({ companyName: job.companyName || null, title: job.title || null, reason: 'salary', detail: 'no salary stated' });
            return;
        }
        const min = job.salaryMinPerYear ?? job.salaryMaxPerYear;
        const max = job.salaryMaxPerYear ?? job.salaryMinPerYear;
        if (max >= lower && min <= upper) kept.push(job);
        else removed.push({ companyName: job.companyName || null, title: job.title || null, reason: 'salary', detail: `${min}–${max} ${job.salaryCurrency || ''}`.trim() });
    });

    return { kept, removed };
};
