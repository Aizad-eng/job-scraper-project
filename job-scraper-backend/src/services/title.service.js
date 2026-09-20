import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { z } from 'zod';
import TitleClean from '../models/titleClean.model.js';
import { cleanTitleWithRules, titleKey } from '../helpers/titleHelpers.js';
import { createLimiter } from '../helpers/limiter.js';
import { hasClaude } from './claude.service.js';
import { SALARY_MODEL as TITLE_MODEL } from '../constants/salaryConstants.js';

const TITLE_SYSTEM_PROMPT =
    'You rewrite a job title the way a person would say it in an email, e.g. ' +
    '"I saw you are hiring a Senior Director of Product". Keep only the role: drop location, company name, ' +
    'requisition numbers, "remote/hybrid/on-site", salary, urgency words, and marketing fluff. ' +
    'Turn "Role, Function" into "Role of Function": "Senior Director, Product" -> "Senior Director of Product", ' +
    '"Vice President, Engineering" -> "Vice President of Engineering", "VP, Sales" -> "VP of Sales". ' +
    'Expand abbreviations (Sr -> Senior, Mgr -> Manager, Dir -> Director) but keep VP, SVP, EVP and C-level ' +
    'acronyms as they are. Use Title Case. Keep the function and level exactly as stated; never guess a ' +
    'level that is not there. Return only the title.';

const TitleSchema = z.object({ title: z.string() });

let client = null;
const getClient = () => {
    if (!client) client = new Anthropic({ apiKey: process.env.CLAUDE_KEY });
    return client;
};

const limiter = createLimiter(5);

export const cleanTitleWithClaude = async (raw, { anthropic = null } = {}) => {
    const api = anthropic || getClient();
    const response = await limiter.run(() =>
        api.messages.parse({
            model: TITLE_MODEL,
            max_tokens: 64,
            system: TITLE_SYSTEM_PROMPT,
            output_config: { format: zodOutputFormat(TitleSchema) },
            messages: [{ role: 'user', content: `Job title: ${raw}` }],
        })
    );
    if (response.stop_reason === 'refusal' || !response.parsed_output?.title) return null;
    return response.parsed_output.title.trim();
};

/**
 * Sets jobTitleClean on every job. Rules first; Claude only where the rules
 * were not confident, and only once per distinct raw title (remembered).
 * Returns stats { rules, memory, claude, failed }.
 */
export const resolveTitles = async (jobs, { useClaude = true, deps = {} } = {}) => {
    const stats = { rules: 0, memory: 0, claude: 0, failed: 0 };
    const byKey = new Map();

    jobs.forEach((job) => {
        const key = titleKey(job.title);
        if (!key) { job.jobTitleClean = null; return; }
        if (!byKey.has(key)) byKey.set(key, []);
        byKey.get(key).push(job);
    });
    if (!byKey.size) return stats;

    const known = new Map(
        (await TitleClean.find({ rawKey: { $in: [...byKey.keys()] } }).lean()).map((r) => [r.rawKey, r])
    );
    const canUseClaude = useClaude && (hasClaude() || deps.anthropic);
    const toSave = [];

    await Promise.all([...byKey.entries()].map(async ([key, group]) => {
        const raw = group[0].title;
        const remembered = known.get(key);
        if (remembered?.clean) {
            group.forEach((job) => { job.jobTitleClean = remembered.clean; });
            stats.memory += 1;
            return;
        }

        const ruled = cleanTitleWithRules(raw);
        let clean = ruled.clean;
        let source = 'rules';

        if (canUseClaude && (!ruled.confident || clean.length > 60)) {
            try {
                const polished = await cleanTitleWithClaude(raw, deps);
                if (polished) { clean = polished; source = 'claude'; }
            } catch (error) {
                stats.failed += 1;
                console.error(`Title clean failed for "${raw}":`, error.message);
            }
        }

        group.forEach((job) => { job.jobTitleClean = clean || null; });
        stats[source] += 1;
        if (clean) toSave.push({ updateOne: { filter: { rawKey: key }, update: { $set: { raw, clean, source } }, upsert: true } });
    }));

    if (toSave.length) await TitleClean.bulkWrite(toSave, { ordered: false }).catch(() => {});
    return stats;
};
