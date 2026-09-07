import { MAX_CONTACTS_PER_COMPANY } from '../constants/aiArkConstants.js';

// flatten an AI-Ark person into the fields we care about
export const mapPersonToContact = (person) => {
    const latestPosition = person.position_groups?.[0];
    const latestRole = latestPosition?.profile_positions?.[0];
    const emailData = person.email?.output?.find((e) => e.found) || person.email?.output?.[0] || null;

    return {
        aiArkId: person.id,
        firstName: person.profile?.first_name || null,
        lastName: person.profile?.last_name || null,
        fullName: person.profile?.full_name || null,
        title: person.profile?.title || latestRole?.title || null,
        headline: person.profile?.headline || null,
        seniority: person.department?.seniority || null,
        department: person.department?.departments?.join(', ') || null,
        linkedinUrl: person.link?.linkedin || null,
        location: person.location?.short || person.location?.default || null,
        companyId: person.company?.id || latestPosition?.company?.id || null,
        companyName: person.company?.summary?.name || latestPosition?.company?.name || null,
        companyDomain: person.company?.link?.domain || person.company?.link?.domain_ltd || null,
        email: emailData?.address || null,
        emailStatus: emailData?.status || null,
        emailIsGeneric: emailData?.generic ?? null,
        emailDomainType: emailData?.domainType || null,
        mobilePhone: null,
    };
};

// cap at N per company, keeping the most senior first
const SENIORITY_RANK = {
    founder: 1, owner: 2, c_suite: 3, partner: 4, vp: 5,
    director: 6, head: 7, manager: 8, senior: 9,
    'mid-level': 10, entry: 11, intern: 12,
};

/**
 * Keep the most senior `limit` people per company.
 *
 * Returns { kept, droppedNoCompany } rather than a bare array. People with no
 * company identifier at all used to be discarded here with no trace, which
 * made it impossible to tell paid-for-then-binned contacts apart from
 * contacts that were never returned.
 */
export const capContactsPerCompany = (contacts, limit = MAX_CONTACTS_PER_COMPANY) => {
    const byCompany = new Map();
    let droppedNoCompany = 0;

    contacts.forEach((contact) => {
        const key = contact.companyId || contact.companyDomain || contact.companyName;
        if (!key) {
            droppedNoCompany += 1;
            return;
        }
        if (!byCompany.has(key)) byCompany.set(key, []);
        byCompany.get(key).push(contact);
    });

    if (droppedNoCompany) {
        console.warn(
            `${droppedNoCompany} contact(s) had no company id, domain or name and were dropped`
        );
    }

    const kept = [];
    byCompany.forEach((group) => {
        const sorted = [...group].sort(
            (a, b) => (SENIORITY_RANK[a.seniority] || 99) - (SENIORITY_RANK[b.seniority] || 99)
        );
        kept.push(...sorted.slice(0, limit));
    });

    return { kept, droppedNoCompany };
};