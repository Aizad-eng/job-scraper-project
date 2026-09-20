import Company from '../models/company.model.js';
import { effectiveVerdict, clearCooldown } from '../services/company.service.js';
import { COMPANIES_PAGE_SIZE, COMPANY_FILTER } from '../constants/companyConstants.js';

const present = (company) => ({
    key: company.key,
    domain: company.domain,
    name: company.name,
    website: company.website,
    linkedinUrl: company.linkedinUrl,
    industry: company.industry,
    size: company.size,
    headquarters: company.headquarters,
    verdict: company.verdict,
    override: company.override,
    effective: effectiveVerdict(company),
    lastSentAt: company.lastSentAt,
    timesSent: company.timesSent || 0,
    firstSeenAt: company.firstSeenAt,
    lastSeenAt: company.lastSeenAt,
    timesSeen: company.timesSeen,
    listingsSeen: company.listingsSeen,
});

const filterQuery = (filter) => {
    switch (filter) {
        case COMPANY_FILTER.AGENCY:
            return {
                $or: [
                    { 'override.isStaffingAgency': true },
                    { 'override.isStaffingAgency': null, 'verdict.isStaffingAgency': true },
                ],
            };
        case COMPANY_FILTER.EMPLOYER:
            return {
                $or: [
                    { 'override.isStaffingAgency': false },
                    { 'override.isStaffingAgency': null, 'verdict.isStaffingAgency': false },
                ],
            };
        case COMPANY_FILTER.UNKNOWN:
            return { 'override.isStaffingAgency': null, 'verdict.isStaffingAgency': null };
        case COMPANY_FILTER.OVERRIDDEN:
            return { 'override.isStaffingAgency': { $in: [true, false] } };
        case COMPANY_FILTER.COOLDOWN:
            return { lastSentAt: { $ne: null } };
        default:
            return {};
    }
};

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export const listCompanies = async (req, res) => {
    try {
        const q = String(req.query.q || '').trim();
        const filter = Object.values(COMPANY_FILTER).includes(req.query.filter) ? req.query.filter : COMPANY_FILTER.ALL;
        const page = Math.max(1, Number(req.query.page) || 1);

        const query = { ...filterQuery(filter) };
        if (q) {
            const rx = new RegExp(escapeRegex(q), 'i');
            query.$and = [{ $or: [{ name: rx }, { domain: rx }, { industry: rx }, { 'verdict.industry': rx }] }];
        }

        const [total, rows] = await Promise.all([
            Company.countDocuments(query),
            Company.find(query)
                .sort({ lastSeenAt: -1 })
                .skip((page - 1) * COMPANIES_PAGE_SIZE)
                .limit(COMPANIES_PAGE_SIZE)
                .lean(),
        ]);

        res.json({
            success: true,
            total,
            page,
            pageSize: COMPANIES_PAGE_SIZE,
            companies: rows.map(present),
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

export const companyStats = async (req, res) => {
    try {
        const [total, agencies, employers, unknown, overridden] = await Promise.all([
            Company.countDocuments({}),
            Company.countDocuments(filterQuery(COMPANY_FILTER.AGENCY)),
            Company.countDocuments(filterQuery(COMPANY_FILTER.EMPLOYER)),
            Company.countDocuments(filterQuery(COMPANY_FILTER.UNKNOWN)),
            Company.countDocuments(filterQuery(COMPANY_FILTER.OVERRIDDEN)),
        ]);
        res.json({ success: true, stats: { total, agencies, employers, unknown, overridden } });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

// Body: { isStaffingAgency: true | false | null, note?: string }
export const setOverride = async (req, res) => {
    try {
        const { isStaffingAgency, note } = req.body || {};
        if (![true, false, null].includes(isStaffingAgency)) {
            return res.status(400).json({ success: false, error: 'isStaffingAgency must be true, false or null.' });
        }

        const company = await Company.findOneAndUpdate(
            { key: req.params.key },
            {
                $set: {
                    'override.isStaffingAgency': isStaffingAgency,
                    'override.note': isStaffingAgency === null ? null : String(note || '').trim().slice(0, 300) || null,
                    'override.setAt': isStaffingAgency === null ? null : new Date(),
                },
            },
            { returnDocument: 'after' }
        ).lean();

        if (!company) return res.status(404).json({ success: false, error: 'Company not found' });
        res.json({ success: true, company: present(company) });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

// Forget the last delivery date, so the company can be sent again now.
export const allowAgain = async (req, res) => {
    try {
        const company = await clearCooldown(req.params.key);
        if (!company) return res.status(404).json({ success: false, error: 'Company not found' });
        res.json({ success: true, company: present(company) });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};
