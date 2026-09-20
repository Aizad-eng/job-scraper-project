import axios from 'axios';
import DomainLookup from '../models/domainLookup.model.js';
import { hasScrapingDog, scrapingDogGet } from './scrapingdog.service.js';
import {
    SCRAPINGDOG_GOOGLE_URL,
    DOMAIN_LOOKUP_TIMEOUT_MS,
    DOMAIN_LOOKUP_RESULTS,
    DOMAIN_LOOKUP_RETRY_DAYS,
    DOMAIN_SOURCE,
} from '../constants/domainConstants.js';
import {
    cleanBoardDomain,
    isBadDomain,
    domainMatchesName,
    titleStartsWithName,
    registrableDomain,
    nameKey,
} from '../helpers/domainHelpers.js';
import { normalizeDomain } from '../helpers/jobHelpers.js';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Google search for the company's website via ScrapingDog (5 credits).
 * Returns { domain, website, candidates } with domain null when nothing
 * passes the bad-domain and name checks.
 */
export const findDomainViaGoogle = async (companyName, { location = '', request = axios.get } = {}) => {
    const query = `${companyName}${location ? ` ${location}` : ''} official website`;
    const response = await scrapingDogGet(SCRAPINGDOG_GOOGLE_URL, {
        params: {
            api_key: process.env.SCRAPPINGDOG_KEY,
            query,
            results: DOMAIN_LOOKUP_RESULTS,
            country: 'us',
        },
        timeout: DOMAIN_LOOKUP_TIMEOUT_MS,
    }, request, `Google ${companyName}`);

    const organic = Array.isArray(response.data?.organic_results) ? response.data.organic_results : [];
    const candidates = organic.map((r) => normalizeDomain(r.link)).filter(Boolean);

    const usable = organic
        .map((r, rank) => ({ rank, title: r.title || '', domain: normalizeDomain(r.link) }))
        .filter((r) => r.domain && !isBadDomain(r.domain));

    // 1. a domain that resembles the name, at any rank
    const byDomain = usable.find((r) => domainMatchesName(r.domain, companyName));
    if (byDomain) {
        const root = registrableDomain(byDomain.domain);
        return { domain: root, website: `https://${root}`, candidates, matchedBy: 'domain' };
    }

    // 2. brand domains (youradv.com for "Advantage Solutions"): a top-3 result
    //    whose title starts with the company name, as a homepage is titled
    const byTitle = usable.find((r) => r.rank < 3 && titleStartsWithName(r.title, companyName));
    if (byTitle) {
        const root = registrableDomain(byTitle.domain);
        return { domain: root, website: `https://${root}`, candidates, matchedBy: 'title' };
    }

    return { domain: null, website: null, candidates };
};

const lookupIsFresh = (row) => {
    if (!row?.searchedAt) return false;
    if (row.domain) return true;                                              // a found domain is kept
    return (Date.now() - new Date(row.searchedAt).getTime()) / DAY_MS < DOMAIN_LOOKUP_RETRY_DAYS;
};

/**
 * Cleans every job's company domain and fills in missing ones.
 * Mutates the jobs (companyDomain, companyWebsite, companyDomainSource).
 * Returns stats: { fromBoard, cleaned, fromMemory, found, notFound, searched }.
 */
export const resolveCompanyDomains = async (jobs, { lookup = true, deps = {} } = {}) => {
    const stats = { fromBoard: 0, cleaned: 0, fromMemory: 0, found: 0, notFound: 0, searched: 0 };
    const needLookup = new Map();   // nameKey -> { name, jobs: [] }

    jobs.forEach((job) => {
        const { domain, website, reason } = cleanBoardDomain(job);
        if (domain) {
            job.companyDomain = domain;
            job.companyWebsite = website;
            job.companyDomainSource = DOMAIN_SOURCE.BOARD;
            stats.fromBoard += 1;
            return;
        }
        const rejected = normalizeDomain(job.companyDomain || job.companyWebsite) || null;
        if (reason && reason !== 'missing') {
            job.companyDomainRejected = rejected;
            stats.cleaned += 1;
        }
        job.companyDomain = null;
        job.companyWebsite = null;
        job.companyDomainSource = DOMAIN_SOURCE.NONE;

        const key = nameKey(job.companyName);
        if (!key) return;
        if (!needLookup.has(key)) needLookup.set(key, { name: job.companyName, jobs: [], fallback: null });
        const entry = needLookup.get(key);
        entry.jobs.push(job);
        // a board domain that merely failed the name check is better than nothing
        if (reason === 'name_mismatch' && rejected && !isBadDomain(rejected) && !entry.fallback) {
            entry.fallback = registrableDomain(rejected);
        }
    });

    if (!needLookup.size) return stats;

    // what we already looked up
    const rows = await DomainLookup.find({ nameKey: { $in: [...needLookup.keys()] } }).lean();
    const known = new Map(rows.map((row) => [row.nameKey, row]));

    const apply = (entry, domain, website, source) => {
        entry.jobs.forEach((job) => {
            job.companyDomain = domain;
            job.companyWebsite = website;
            job.companyDomainSource = source;
        });
    };

    const useFallback = (entry) => {
        if (!entry.fallback) return false;
        apply(entry, entry.fallback, `https://${entry.fallback}`, DOMAIN_SOURCE.BOARD_UNVERIFIED);
        stats.boardUnverified = (stats.boardUnverified || 0) + 1;
        return true;
    };

    const canSearch = lookup && (hasScrapingDog() || deps.request);
    const toSearch = [];

    for (const [key, entry] of needLookup) {
        const row = known.get(key);
        if (row && lookupIsFresh(row)) {
            if (row.domain) {
                apply(entry, row.domain, row.website, DOMAIN_SOURCE.MEMORY);
                stats.fromMemory += 1;
            } else if (!useFallback(entry)) {
                stats.notFound += 1;
            }
            continue;
        }
        if (canSearch) toSearch.push([key, entry]);
        else useFallback(entry);
    }

    // parallel, but the shared ScrapingDog limiter keeps it at 5 in flight
    await Promise.all(toSearch.map(async ([key, entry]) => {
        try {
            stats.searched += 1;
            const result = await findDomainViaGoogle(entry.name, { request: deps.request });
            await DomainLookup.updateOne(
                { nameKey: key },
                {
                    $set: {
                        name: entry.name,
                        domain: result.domain,
                        website: result.website,
                        source: 'scrapingdog',
                        candidates: result.candidates.slice(0, 10),
                        searchedAt: new Date(),
                    },
                },
                { upsert: true }
            );
            if (result.domain) {
                apply(entry, result.domain, result.website, DOMAIN_SOURCE.FOUND);
                stats.found += 1;
            } else if (!useFallback(entry)) {
                stats.notFound += 1;
            }
        } catch (error) {
            console.error(`Domain lookup failed for ${entry.name}:`, error.response?.status || error.message);
            useFallback(entry);
        }
    }));

    return stats;
};
