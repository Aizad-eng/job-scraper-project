import mongoose from 'mongoose';

// One document per scraped listing that passed the rule filters. Kept out of
// the Job document so a run of any size stays under Mongo's 16 MB limit and
// never has to be loaded into memory at once.
const listingSchema = new mongoose.Schema(
    {
        jobId: { type: String, required: true, index: true },
        scheduleId: { type: String, default: null },
        platform: { type: String, default: null },
        keyword: { type: String, default: null },
        // identity for dedupe within a job: platform|url-or-id
        listingKey: { type: String, required: true },
        // company|normalised title, for cross-board dedupe (null when unknown)
        titleKey: { type: String, default: null },
        companyKey: { type: String, default: null, index: true },
        // false once a later stage (salary, agency, cap, cooldown) drops it
        kept: { type: Boolean, default: true, index: true },
        droppedReason: { type: String, default: null },
        // the normalised listing itself (fields added by later stages too)
        data: { type: Object, default: {} },
        createdAt: { type: Date, default: Date.now, expires: 14 * 24 * 60 * 60 },
    },
    { minimize: false }
);

listingSchema.index({ jobId: 1, listingKey: 1 }, { unique: true });
listingSchema.index({ jobId: 1, titleKey: 1 }, { unique: true, partialFilterExpression: { titleKey: { $type: 'string' } } });
listingSchema.index({ jobId: 1, kept: 1, _id: 1 });

export default mongoose.model('Listing', listingSchema);
