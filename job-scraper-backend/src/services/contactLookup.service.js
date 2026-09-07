import {
    resolveCompanyIds,
    searchPeople,
    exportPeopleWithEmail,
    fetchExportResults,
    fetchExportStatistics,
    findMobilePhone,
} from './aiark.service.js';
import { mapPersonToContact, capContactsPerCompany } from '../helpers/contactHelpers.js';
import {
    MAX_CONTACTS_PER_COMPANY,
    AIARK_BATCH_SIZE,
    AIARK_BATCH_DELAY_MS,
    AIARK_SEARCH_PAGE_SIZE,
    AIARK_MAX_SEARCH_PAGES,
} from '../constants/aiArkConstants.js';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Step 1: resolve domains -> AI-Ark company UUIDs
export const resolveCompanies = async (cleanedCompanies) => {
    const domains = cleanedCompanies.map((c) => c.companyDomain).filter(Boolean);
    const skipped = cleanedCompanies.length - domains.length;
    if (skipped > 0) {
        console.log(`${skipped} companies have no domain and cannot be resolved in AI-Ark`);
    }
    if (!domains.length) return { companyIds: [], domainToId: new Map() };

    const domainToId = await resolveCompanyIds(domains);
    return { companyIds: [...domainToId.values()], domainToId };
};

/**
 * Step 2: FREE people search across every matching company, paged.
 *
 * AI-Ark bills per record delivered by an export, not per search. So we search
 * first to see who exists, decide who we actually want, and only then pay.
 * The client throttles calls, so paging here stays inside the rate limit.
 */
export const searchCandidates = async ({ companyIds, personaTitles }) => {
    const candidates = [];
    let page = 0;

    while (page < AIARK_MAX_SEARCH_PAGES) {
        const data = await searchPeople({
            companyIds,
            personaTitles,
            size: AIARK_SEARCH_PAGE_SIZE,
            page,
        });

        const items = data.content || [];
        candidates.push(...items.map(mapPersonToContact));

        const totalPages = data.totalPages ?? null;
        const done = totalPages !== null
            ? page + 1 >= totalPages
            : items.length < AIARK_SEARCH_PAGE_SIZE;

        if (done) break;
        page += 1;
    }

    return candidates;
};

/**
 * Pick who we will pay for: the most senior N per company.
 * Returns both the selection and the counts, so the caller can log where
 * people went instead of them vanishing silently.
 */
export const selectContacts = (candidates) => {
    const { kept, droppedNoCompany } = capContactsPerCompany(candidates);
    return {
        selected: kept,
        stats: {
            found: candidates.length,
            droppedNoCompany,
            droppedOverCap: candidates.length - droppedNoCompany - kept.length,
            selected: kept.length,
        },
    };
};

// Step 2a: no email wanted — the free search result is the answer, no export.
export const lookupContactsWithoutEmail = async ({ companyIds, personaTitles }) => {
    const candidates = await searchCandidates({ companyIds, personaTitles });
    const { selected, stats } = selectContacts(candidates);
    console.log(
        `People search: ${stats.found} found, ${stats.droppedNoCompany} without company, ` +
        `${stats.droppedOverCap} over the ${MAX_CONTACTS_PER_COMPANY}/company cap, ${stats.selected} kept`
    );
    return selected;
};

/**
 * Step 2b: email wanted. `size` is now exactly the number of people we intend
 * to keep, instead of three times that. Previously this asked for
 * companies x cap x 3 and paid for all of them, then threw most away.
 */
export const startContactExport = async ({ companyIds, personaTitles, size, webhookUrl }) => {
    return exportPeopleWithEmail({
        companyIds,
        personaTitles,
        size: Math.min(size, 10000),
        webhookUrl,
    });
};

// Step 3: called from the AI-Ark webhook once the export finishes
export const collectExportResults = async (trackId) => {
    const contacts = [];
    let page = 0;

    while (true) {
        const data = await fetchExportResults(trackId, page, 100);
        const items = data.content || [];
        contacts.push(...items.map(mapPersonToContact));

        // Trust the API's own page count when it gives one. The old code
        // assumed a full page was always exactly 100 items, so any smaller
        // page size made it stop early and abandon records already paid for.
        const totalPages = data.totalPages ?? null;
        const done = totalPages !== null ? page + 1 >= totalPages : items.length === 0;

        if (done) break;
        page += 1;
    }

    return contacts;
};

// What the export actually produced, for reconciling against credits spent.
export const getExportStatistics = async (trackId) => {
    try {
        return await fetchExportStatistics(trackId);
    } catch (error) {
        console.warn(`Could not read export statistics for ${trackId}: ${error.message}`);
        return null;
    }
};

// Step 4 (optional): phone numbers, batched to respect rate limits
export const enrichWithPhones = async (contacts) => {
    const enriched = [];

    for (let i = 0; i < contacts.length; i += AIARK_BATCH_SIZE) {
        const batch = contacts.slice(i, i + AIARK_BATCH_SIZE);

        const results = await Promise.all(
            batch.map(async (contact) => {
                if (!contact.linkedinUrl) return contact;
                try {
                    const data = await findMobilePhone(contact.linkedinUrl);
                    const phone = data?.data?.[0]?.[0] || null;
                    return { ...contact, mobilePhone: phone };
                } catch (error) {
                    console.error(`Phone lookup failed for ${contact.fullName}:`, error.message);
                    return contact;
                }
            })
        );

        enriched.push(...results);

        if (i + AIARK_BATCH_SIZE < contacts.length) {
            await sleep(AIARK_BATCH_DELAY_MS);
        }
    }

    return enriched;
};
