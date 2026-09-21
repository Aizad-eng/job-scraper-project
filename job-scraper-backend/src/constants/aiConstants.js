export const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';
export const PERPLEXITY_API_URL = 'https://api.perplexity.ai/chat/completions';
export const SCRAPINGDOG_AI_MODE_URL = 'https://api.scrapingdog.com/google/ai_mode';

export const OPENAI_MODEL = 'gpt-4o-mini';
export const PERPLEXITY_MODEL = 'sonar';
export const CLAUDE_MODEL = 'claude-opus-5';

export const CLASSIFICATION_SOURCE = {
    SCRAPINGDOG: 'scrapingdog',
    SCRAPINGDOG_CLAUDE: 'scrapingdog+claude',
    GPT: 'gpt',
    PERPLEXITY: 'perplexity',
    SKIPPED: 'skipped',
};

export const CLASSIFIER_SYSTEM_PROMPT =
    'You classify companies as staffing agencies or direct employers. ' +
    'A staffing agency, recruitment firm, headhunter, or talent marketplace places ' +
    'candidates at OTHER companies. A direct employer hires for its own team. ' +
    'Respond with JSON only, no markdown: {"isStaffingAgency": true|false, "reason": "<one short sentence>"}';

// Sent to Google AI Mode through ScrapingDog. Asks for JSON, but the answer
// often comes back as prose or fenced text, which is why Claude cleans it up.
export const buildCompanyCheckQuery = (website) =>
    `Visit : ${website} and determine whether the company is a recruitment/staffing firm. ` +
    "Base your answer only on the website's content, not the company name. " +
    'Return ONLY valid JSON, no extra text or markdown, in this format: ' +
    `{ "website": "${website}", "is_recruitment_firm": "Yes", "industry": "Staffing & Recruiting", ` +
    '"description": "2-3 sentence summary of what the company does." } ' +
    'Rules: - "is_recruitment_firm" must be "Yes" or "No". - If "No", still fill in industry and description. ' +
    '- If the site is unreachable or unclear, set "is_recruitment_firm" to "Unknown" and explain in "description".';

// Google AI Mode usually ignores the JSON instruction and answers in prose
// (often a plain description of the business), so Claude has to infer.
export const CLAUDE_COERCE_SYSTEM_PROMPT =
    'You receive the raw text of an AI answer about a company, written after visiting its website. ' +
    'Turn it into the structured record. Use only what the text says; do not add outside knowledge. ' +
    'is_recruitment_firm is "Yes" if the text says the company recruits, staffs, or places candidates or workers ' +
    'at OTHER companies (staffing agency, recruitment firm, headhunter, talent marketplace, PEO). ' +
    'It is "No" if the text describes the company doing its own business, such as making products, ' +
    'running facilities, or providing non-staffing services, even if recruitment is never mentioned. ' +
    'It is "Unknown" only if the text says the site could not be read, or gives no idea what the company does. ' +
    'industry is a short label such as "Food Manufacturing" or "Staffing & Recruiting". ' +
    'description is a 2-3 sentence summary of what the company does, taken from the text.';

export const COMPANY_CHECK_ANSWERS = ['Yes', 'No', 'Unknown'];

// how many companies to classify at once
export const AI_BATCH_SIZE = SCRAPINGDOG_MAX_CONCURRENT;   // the limiter enforces the real cap

// no pause between batches: the limiter already paces ScrapingDog
export const AI_BATCH_DELAY_MS = 0;

export const SCRAPINGDOG_TIMEOUT_MS = 90_000;

// ScrapingDog allows 5 concurrent requests per account. Shared by the
// AI Mode company check and the Google domain lookup, across every job.
export const SCRAPINGDOG_MAX_CONCURRENT = Math.min(Math.max(Math.round(Number(process.env.SCRAPINGDOG_CONCURRENCY)) || 5, 1), 50);
export const SCRAPINGDOG_MAX_ATTEMPTS = 3;
export const SCRAPINGDOG_RETRY_BASE_MS = 2_000;
