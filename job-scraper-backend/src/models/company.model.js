import mongoose from 'mongoose';

// One document per company ever seen in a scrape. `key` is the normalised
// domain, or the lower-cased name when there is no domain.
const companySchema = new mongoose.Schema(
    {
        key: { type: String, required: true, unique: true, index: true },
        domain: { type: String, default: null, index: true },
        name: { type: String, default: null },
        website: { type: String, default: null },
        linkedinUrl: { type: String, default: null },
        industry: { type: String, default: null },
        size: { type: String, default: null },
        headquarters: { type: String, default: null },
        type: { type: String, default: null },
        founded: { type: String, default: null },
        description: { type: String, default: null },

        // what the automated check decided
        verdict: {
            isStaffingAgency: { type: Boolean, default: null },   // true / false / null (unknown)
            industry: { type: String, default: null },
            summary: { type: String, default: null },
            source: { type: String, default: null },
            reason: { type: String, default: null },
            checkedAt: { type: Date, default: null },
        },

        // a human decision that always wins
        override: {
            isStaffingAgency: { type: Boolean, default: null },
            note: { type: String, default: null },
            setAt: { type: Date, default: null },
        },

        firstSeenAt: { type: Date, default: null },
        lastSeenAt: { type: Date, default: null, index: true },
        timesSeen: { type: Number, default: 0 },      // runs this company appeared in
        listingsSeen: { type: Number, default: 0 },   // job listings across those runs
        lastJobId: { type: String, default: null },
        scheduleIds: { type: [String], default: [] },
    },
    { timestamps: true, minimize: false }
);

companySchema.index({ name: 'text', domain: 'text', industry: 'text' });
companySchema.index({ 'verdict.isStaffingAgency': 1 });
companySchema.index({ 'override.isStaffingAgency': 1 });

export default mongoose.model('Company', companySchema);
