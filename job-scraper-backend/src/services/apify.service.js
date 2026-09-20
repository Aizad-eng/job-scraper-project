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

// Fetches the results of a finished run, page by page
export const fetchRunResults = async (runId) => {
    const items = [];
    const limit = 1000;
    let offset = 0;

    for (;;) {
        const response = await axios.get(
            `${APIFY_BASE_URL}/actor-runs/${runId}/dataset/items`,
            { headers: apifyHeaders(), params: { limit, offset, clean: true } }
        );
        const page = response.data || [];
        items.push(...page);
        if (page.length < limit) break;
        offset += limit;
    }

    return items;
};
