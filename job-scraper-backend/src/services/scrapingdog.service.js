import axios from 'axios';
import {
    SCRAPINGDOG_AI_MODE_URL,
    SCRAPINGDOG_TIMEOUT_MS,
    SCRAPINGDOG_MAX_CONCURRENT,
    SCRAPINGDOG_MAX_ATTEMPTS,
    SCRAPINGDOG_RETRY_BASE_MS,
    COMPANY_CHECK_ANSWERS,
    buildCompanyCheckQuery,
} from '../constants/aiConstants.js';
import { createLimiter, withRetry, isTransientHttpError } from '../helpers/limiter.js';

export const hasScrapingDog = () => Boolean(process.env.SCRAPPINGDOG_KEY);

// One limiter for every ScrapingDog endpoint, so the account-wide cap of
// 5 concurrent requests holds even with several jobs running.
const limiter = createLimiter(SCRAPINGDOG_MAX_CONCURRENT);

export const scrapingDogGet = (url, config, request = axios.get, label = 'ScrapingDog') =>
    limiter.run(() =>
        withRetry(() => request(url, config), {
            attempts: SCRAPINGDOG_MAX_ATTEMPTS,
            baseMs: SCRAPINGDOG_RETRY_BASE_MS,
            shouldRetry: isTransientHttpError,
            label,
        })
    );

export const scrapingDogLoad = () => ({ active: limiter.active, waiting: limiter.waiting });

// Google AI Mode returns the answer as text_blocks (paragraphs, headings,
// lists, nested lists). Collect every snippet, in order.
export const extractAnswerText = (data) => {
    const parts = [];
    const walk = (node) => {
        if (!node) return;
        if (Array.isArray(node)) {
            node.forEach(walk);
            return;
        }
        if (typeof node === 'object') {
            if (typeof node.snippet === 'string') parts.push(node.snippet);
            Object.entries(node).forEach(([key, value]) => {
                if (key !== 'snippet' && (Array.isArray(value) || (value && typeof value === 'object'))) walk(value);
            });
        }
    };
    walk(data?.text_blocks || []);
    return parts.join('\n').trim();
};

// Pulls the first {...} object out of the text and validates its shape.
// Returns null when there is no usable JSON — the caller then asks Claude.
export const tryParseCompanyCheck = (text) => {
    if (!text) return null;
    const cleaned = String(text).replace(/```(?:json)?/gi, '');
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start === -1 || end <= start) return null;

    try {
        const parsed = JSON.parse(cleaned.slice(start, end + 1));
        return normaliseCompanyCheck(parsed);
    } catch {
        return null;
    }
};

const capitalise = (value) => {
    const s = String(value ?? '').trim().toLowerCase();
    return s ? s[0].toUpperCase() + s.slice(1) : '';
};

// Accepts loose variants (true/false, yes/no in any case) and returns the
// strict record, or null if the answer field is unusable.
export const normaliseCompanyCheck = (obj) => {
    if (!obj || typeof obj !== 'object') return null;
    let answer = obj.is_recruitment_firm ?? obj.isRecruitmentFirm ?? obj.is_staffing_agency;
    if (answer === true) answer = 'Yes';
    if (answer === false) answer = 'No';
    answer = capitalise(answer);
    if (!COMPANY_CHECK_ANSWERS.includes(answer)) return null;

    return {
        website: String(obj.website || '').trim() || null,
        is_recruitment_firm: answer,
        industry: String(obj.industry || '').trim() || null,
        description: String(obj.description || '').trim() || null,
    };
};

/**
 * Asks Google AI Mode (via ScrapingDog) about one website.
 * Returns { text, parsed, references }. `parsed` is null when the answer
 * was not clean JSON. Throws on HTTP / network errors (no credits, 4xx…).
 */
export const askScrapingDog = async (website, { request = axios.get } = {}) => {
    const response = await scrapingDogGet(SCRAPINGDOG_AI_MODE_URL, {
        params: {
            api_key: process.env.SCRAPPINGDOG_KEY,
            query: buildCompanyCheckQuery(website),
            country: 'us',
            language: 'en',
            safe: 'off',
        },
        timeout: SCRAPINGDOG_TIMEOUT_MS,
    }, request, `AI Mode ${website}`);

    const data = response.data;
    if (!data || typeof data !== 'object') throw new Error('ScrapingDog returned an empty response');

    const text = extractAnswerText(data);
    return {
        text,
        parsed: tryParseCompanyCheck(text),
        references: Array.isArray(data.references) ? data.references : [],
    };
};
