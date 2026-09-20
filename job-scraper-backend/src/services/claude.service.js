import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { z } from 'zod';
import { CLAUDE_MODEL, CLAUDE_COERCE_SYSTEM_PROMPT } from '../constants/aiConstants.js';

export const hasClaude = () => Boolean(process.env.CLAUDE_KEY);

const CompanyCheckSchema = z.object({
    website: z.string(),
    is_recruitment_firm: z.enum(['Yes', 'No', 'Unknown']),
    industry: z.string(),
    description: z.string(),
});

let client = null;
const getClient = () => {
    if (!client) client = new Anthropic({ apiKey: process.env.CLAUDE_KEY });
    return client;
};

/**
 * Turns a loose AI answer into the strict company-check record using
 * structured outputs, so the result always matches the schema.
 * Returns null when Claude is not configured or declines.
 */
export const coerceCompanyCheck = async (text, website, { anthropic = null } = {}) => {
    if (!hasClaude() && !anthropic) return null;
    const api = anthropic || getClient();

    const response = await api.messages.parse({
        model: CLAUDE_MODEL,
        max_tokens: 1024,
        system: CLAUDE_COERCE_SYSTEM_PROMPT,
        output_config: {
            effort: 'low',
            format: zodOutputFormat(CompanyCheckSchema),
        },
        messages: [
            {
                role: 'user',
                content: `Website: ${website}\n\nAI answer text:\n"""\n${text}\n"""`,
            },
        ],
    });

    if (response.stop_reason === 'refusal' || !response.parsed_output) return null;

    const parsed = response.parsed_output;
    return {
        website: parsed.website || website,
        is_recruitment_firm: parsed.is_recruitment_firm,
        industry: parsed.industry || null,
        description: parsed.description || null,
    };
};
