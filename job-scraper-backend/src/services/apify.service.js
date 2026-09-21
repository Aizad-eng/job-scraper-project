import axios from 'axios';
import { APIFY_BASE_URL, ACTOR_IDS, PLATFORMS, POSTED_WITHIN, POSTED_WITHIN_MAP } from '../constants/apifyConstants.js';

const apifyHeaders = () => ({
    Authorization: `Bearer ${process.env.APIFY_TOKEN}`,
});

// Builds the input object each actor expects
const buildActorInput = (platform, { keyword, location, jobsPerKeyword, postedWithin, maxJobsPerCompany }) => {
    const dateWindow = POSTED_WITHIN_MAP[postedWithin] || POSTED_WITHIN_MAP[POSTED_WITHIN.ANY];
    const perCompany = Math.min(Math.max(Number(maxJobsPerCompany) || 0, 0), 10);

    if (platform === PLATFORMS.LINKEDIN) {
        return {
            keyword,
            location,
            maxItems: jobsPerKeyword,
            maxJobsPerCompany: perCompany,
            postedWithin: dateWindow.linkedin,
            fetchDetails: true,
            fetchCompanyDetails: true,
            proxyConfig: {
                useApifyProxy: true,
                apifyProxyGroups: ['RESIDENTIAL'],
            },
        };
    }

    if (platform === PLATFORMS.INDEED) {
        return {
            keywords: [keyword],
            locations: location ? [location] : [],
            country: 'us',
            maxItems: jobsPerKeyword,
            maxJobsPerCompany: perCompany,
            postedWithinDays: dateWindow.indeed,
            proxyConfig: {
                useApifyProxy: true,
                apifyProxyGroups: ['RESIDENTIAL'],
            },
        };
    }

    throw new Error(`Unknown platform: ${platform}`);
};

// Triggers one actor run, returns the Apify runId
export const triggerActorRun = async (platform, inputParams, webhookUrl) => {
    const actorId = ACTOR_IDS[platform.toUpperCase()];
    const input = buildActorInput(platform, inputParams);

    const webhooksParam = Buffer.from(
        JSON.stringify([
            {
                eventTypes: ['ACTOR.RUN.SUCCEEDED', 'ACTOR.RUN.FAILED', 'ACTOR.RUN.ABORTED', 'ACTOR.RUN.TIMED_OUT'],
                requestUrl: webhookUrl,
            },
        ])
    ).toString('base64');

    const response = await axios.post(
        `${APIFY_BASE_URL}/acts/${actorId}/runs`,
        input,
        {
            headers: apifyHeaders(),
            params: { webhooks: webhooksParam },
        }
    );

    return response.data.data.id;
};

// Streams the results of a finished run to `onPage`, 500 at a time, so a
// large dataset is never held in memory whole. Returns the item count.
export const fetchRunResultsPaged = async (runId, onPage, { limit = 500 } = {}) => {
    let offset = 0;
    let total = 0;

    for (;;) {
        const response = await axios.get(
            `${APIFY_BASE_URL}/actor-runs/${runId}/dataset/items`,
            { headers: apifyHeaders(), params: { limit, offset, clean: true } }
        );
        const page = response.data || [];
        if (page.length) await onPage(page);
        total += page.length;
        if (page.length < limit) break;
        offset += limit;
    }

    return total;
};

// Convenience for small runs / tests: everything at once.
export const fetchRunResults = async (runId) => {
    const items = [];
    await fetchRunResultsPaged(runId, async (page) => { items.push(...page); });
    return items;
};

// Current status of a run, straight from Apify (for the watchdog).
export const fetchRunStatus = async (runId) => {
    const response = await axios.get(`${APIFY_BASE_URL}/actor-runs/${runId}`, { headers: apifyHeaders() });
    return response.data?.data?.status || null;
};

// Which platform an Apify run belongs to and which keyword it searched,
// for runs given by id. Reads the run, its actor name and its INPUT record.
export const fetchRunMeta = async (runId) => {
    const run = (await axios.get(`${APIFY_BASE_URL}/actor-runs/${runId}`, { headers: apifyHeaders() })).data?.data;
    if (!run) throw new Error(`Run ${runId} not found`);
    const actor = (await axios.get(`${APIFY_BASE_URL}/acts/${run.actId}`, { headers: apifyHeaders() })).data?.data;
    const name = String(actor?.name || '').toLowerCase();
    const platform = name.includes('indeed') ? PLATFORMS.INDEED : name.includes('linkedin') ? PLATFORMS.LINKEDIN : null;
    let keyword = null;
    try {
        const input = (await axios.get(
            `${APIFY_BASE_URL}/key-value-stores/${run.defaultKeyValueStoreId}/records/INPUT`,
            { headers: apifyHeaders() }
        )).data;
        keyword = input?.keyword || (Array.isArray(input?.keywords) ? input.keywords[0] : null) || null;
    } catch { /* input record missing: keyword stays null */ }
    return { runId, platform, keyword, status: run.status, startedAt: run.startedAt, itemCount: run.stats?.itemCount ?? null };
};
