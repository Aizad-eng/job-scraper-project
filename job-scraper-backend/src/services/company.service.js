import Company from '../models/company.model.js';
import { normalizeDomain } from '../helpers/jobHelpers.js';
import { VERDICT_TTL_DAYS, UNKNOWN_RETRY_DAYS, VERDICT_SOURCE } from '../constants/companyConstants.js';

const DAY_MS = 24 * 60 * 60 * 1000;

const ageDays = (date) => (date ? (Date.now() - new Date(date).getTime()) / DAY_MS : Infinity);

/**
 * Records that these companies (from groupByCompany) showed up in a run.
 * Fills in descriptive fields we did not have before; never touches verdicts.
 */
export const recordCompaniesSeen = async (companies, { jobId, scheduleId = null } = {}) => {
    if (!companies.length) return;
    const now = new Date();

    const ops = companies.map((company) => {
        const set = {
            lastSeenAt: now,
            lastJobId: jobId || null,
        };
        // keep the freshest non-empty value for descriptive fields
        const fresh = {
            domain: normalizeDomain(company.companyDomain) || null,
            name: company.companyName || null,
            website: company.companyWebsite || null,
            linkedinUrl: company.companyLinkedinUrl || null,
            industry: company.companyIndustry || null,
            size: company.companyEmployeesCount || null,
            headquarters: company.companyHeadquarters || null,
            type: company.companyType || null,
            founded: company.companyFounded || null,
            description: company.companyDescription || null,
        };
        Object.entries(fresh).forEach(([field, value]) => {
            if (value) set[field] = value;
        });

        const update = {
            $set: set,
            $setOnInsert: { key: company.key, firstSeenAt: now },
            $inc: { timesSeen: 1, listingsSeen: company.jobs?.length || 0 },
        };
        if (scheduleId) update.$addToSet = { scheduleIds: scheduleId };

        return { updateOne: { filter: { key: company.key }, update, upsert: true } };
    });

    await Company.bulkWrite(ops, { ordered: false });
};

// Is this stored verdict still good enough to reuse?
const verdictIsFresh = (verdict) => {
    if (!verdict?.checkedAt) return false;
    if (verdict.isStaffingAgency === true) return true;                       // agencies never expire
    if (verdict.isStaffingAgency === false) return ageDays(verdict.checkedAt) < VERDICT_TTL_DAYS;
    return ageDays(verdict.checkedAt) < UNKNOWN_RETRY_DAYS;                    // unknown: retry later
};

/**
 * Looks up what we already know. Returns a Map key -> classification for
 * every company with an override or a fresh verdict. Companies missing from
 * the map still need checking.
 */
export const getKnownVerdicts = async (keys) => {
    if (!keys.length) return new Map();
    const rows = await Company.find({ key: { $in: keys } })
        .select('key verdict override')
        .lean();

    const known = new Map();
    rows.forEach((row) => {
        if (row.override?.isStaffingAgency !== null && row.override?.isStaffingAgency !== undefined) {
            known.set(row.key, {
                isStaffingAgency: row.override.isStaffingAgency,
                reason: row.override.note || 'Set by hand',
                industry: row.verdict?.industry ?? null,
                summary: row.verdict?.summary ?? null,
                source: VERDICT_SOURCE.OVERRIDE,
                cached: true,
            });
            return;
        }
        if (verdictIsFresh(row.verdict)) {
            known.set(row.key, {
                isStaffingAgency: row.verdict.isStaffingAgency,
                reason: row.verdict.reason || row.verdict.summary || null,
                industry: row.verdict.industry ?? null,
                summary: row.verdict.summary ?? null,
                source: `${VERDICT_SOURCE.MEMORY}:${row.verdict.source || 'unknown'}`,
                cached: true,
            });
        }
    });
    return known;
};

// Stores fresh classifications (key -> classification) on the company records.
export const saveVerdicts = async (verdicts) => {
    const ops = [];
    verdicts.forEach((verdict, key) => {
        if (verdict.source === 'skipped') return;   // nothing learned
        ops.push({
            updateOne: {
                filter: { key },
                update: {
                    $set: {
                        'verdict.isStaffingAgency': verdict.isStaffingAgency ?? null,
                        'verdict.industry': verdict.industry ?? null,
                        'verdict.summary': verdict.summary ?? null,
                        'verdict.source': verdict.source ?? null,
                        'verdict.reason': verdict.reason ?? null,
                        'verdict.checkedAt': new Date(),
                    },
                    $setOnInsert: { key, firstSeenAt: new Date() },
                },
                upsert: true,
            },
        });
    });
    if (ops.length) await Company.bulkWrite(ops, { ordered: false });
};

// The decision that applies right now: override wins, then verdict.
export const effectiveVerdict = (company) => {
    if (company.override?.isStaffingAgency === true || company.override?.isStaffingAgency === false) {
        return { isStaffingAgency: company.override.isStaffingAgency, source: VERDICT_SOURCE.OVERRIDE };
    }
    if (company.verdict?.checkedAt) {
        return { isStaffingAgency: company.verdict.isStaffingAgency, source: company.verdict.source };
    }
    return { isStaffingAgency: null, source: null };
};
