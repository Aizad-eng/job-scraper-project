import { BAD_DOMAINS, NAME_STOPWORDS } from '../constants/domainConstants.js';
import { normalizeDomain } from './jobHelpers.js';

const BAD_SET = new Set(BAD_DOMAINS);

// "careers.acme.co.uk" -> "acme.co.uk" (good enough without a public-suffix list)
export const registrableDomain = (domain) => {
    const parts = normalizeDomain(domain).split('.').filter(Boolean);
    if (parts.length <= 2) return parts.join('.');
    const secondLevel = ['co', 'com', 'org', 'net', 'gov', 'edu', 'ac'];
    if (parts.length >= 3 && parts[parts.length - 1].length === 2 && secondLevel.includes(parts[parts.length - 2])) {
        return parts.slice(-3).join('.');
    }
    return parts.slice(-2).join('.');
};

export const isBadDomain = (domain) => {
    const clean = normalizeDomain(domain);
    if (!clean || !clean.includes('.')) return true;
    if (/^\d+\.\d+\.\d+\.\d+$/.test(clean)) return true;          // IP address
    if (clean.length > 80) return true;
    const root = registrableDomain(clean);
    if (BAD_SET.has(root) || BAD_SET.has(clean)) return true;
    // any listed domain that this one sits under (e.g. foo.myworkdayjobs.com)
    return BAD_DOMAINS.some((bad) => clean.endsWith(`.${bad}`));
};

// "Deli Brands of America, Inc." -> ["deli", "brands"]
export const nameTokens = (name) =>
    String(name || '')
        .toLowerCase()
        .replace(/&/g, ' and ')
        .replace(/[^a-z0-9]+/g, ' ')
        .split(' ')
        .filter((t) => t.length >= 3 && !NAME_STOPWORDS.includes(t));

// Does the domain look like it belongs to this company name?
// Matches when a name token appears in the domain label, the label appears
// in the squashed name, or the initials of the name form the label.
export const domainMatchesName = (domain, name) => {
    const root = registrableDomain(domain);
    const label = root.split('.')[0] || '';
    if (label.length < 2) return false;

    const tokens = nameTokens(name);
    const squashed = String(name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    if (!tokens.length && !squashed) return false;

    if (tokens.some((t) => label.includes(t))) return true;
    if (label.length >= 4 && squashed.includes(label)) return true;

    // initials from every real word ("International Business Machines" -> ibm)
    const LEGAL = new Set(['inc', 'llc', 'ltd', 'corp', 'co', 'plc', 'gmbh', 'the', 'of', 'and', 'a', 'an']);
    const words = String(name || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').split(' ').filter((w) => w && !LEGAL.has(w));
    const initials = words.map((w) => w[0]).join('');
    if (initials.length >= 3 && label === initials) return true;

    // partial-token match for long tokens ("delibrands" vs "delicatessen")
    return tokens.some((t) => t.length >= 6 && label.includes(t.slice(0, 5)));
};

// key used to remember domain lookups for a company name
export const nameKey = (name) => String(name || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/**
 * Cleans the domain a job board gave us. Returns { domain, website, reason }.
 * domain is null when the board's value is missing or unusable.
 */
export const cleanBoardDomain = (job) => {
    const candidates = [job.companyDomain, job.companyWebsite].map(normalizeDomain).filter(Boolean);

    for (const candidate of candidates) {
        if (isBadDomain(candidate)) continue;
        if (job.companyName && !domainMatchesName(candidate, job.companyName)) continue;
        return { domain: registrableDomain(candidate), website: job.companyWebsite || `https://${candidate}`, reason: null };
    }

    if (!candidates.length) return { domain: null, website: null, reason: 'missing' };
    return { domain: null, website: null, reason: isBadDomain(candidates[0]) ? 'bad_domain' : 'name_mismatch' };
};
