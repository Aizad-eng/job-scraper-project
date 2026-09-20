import mongoose from 'mongoose';

// What Google said when we looked for a company's website, by company name.
const domainLookupSchema = new mongoose.Schema(
    {
        nameKey: { type: String, required: true, unique: true, index: true },
        name: { type: String, default: null },
        domain: { type: String, default: null },       // null = nothing usable found
        website: { type: String, default: null },
        source: { type: String, default: null },
        candidates: { type: [String], default: [] },   // what we saw, for debugging
        searchedAt: { type: Date, default: null },
    },
    { timestamps: true }
);

export default mongoose.model('DomainLookup', domainLookupSchema);
