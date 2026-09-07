import mongoose from 'mongoose';
import { JOB_STATUS } from '../constants/apifyConstants.js';

const jobSchema = new mongoose.Schema(
    {
        jobId: { type: String, required: true, unique: true, index: true },
        status: {
            type: String,
            enum: Object.values(JOB_STATUS),
            default: JOB_STATUS.PENDING,
        },
        inputs: {
            keywords: [String],
            location: String,
            employeeCountMin: Number,
            employeeCountMax: Number,
            personaTitles: [String],
            platforms: [String],
            jobsPerKeyword: Number,
            needEmail: { type: Boolean, default: true },
            needPhone: { type: Boolean, default: false },
            postedWithin: { type: String, default: 'any' },
            filterKeywords: [String],
            filterMatchIn: [String],
        },
        apifyRuns: [
            {
                runId: String,
                platform: String,
                keyword: String,
                status: String,
            },
        ],
        scrapedJobs: { type: Array, default: [] },
        resultFilePath: { type: String, default: null },
        filteredJobs: { type: Array, default: [] },
        removedJobs: { type: Array, default: [] },
        cleanedCompanies: { type: Array, default: [] },
        contacts: { type: Array, default: [] },
        aiArkExport: {
            trackId: { type: String, default: null },
            state: { type: String, default: null },
            // How many records we asked and paid for, and what came back.
            requestedSize: { type: Number, default: null },
            reportedTotal: { type: Number, default: null },
            deliveredCount: { type: Number, default: null },
        },
        // Where people went between the free search and the final list.
        contactStats: {
            found: { type: Number, default: null },
            droppedNoCompany: { type: Number, default: null },
            droppedOverCap: { type: Number, default: null },
            selected: { type: Number, default: null },
        },
        error: { type: String, default: null },
        emptyReason: { type: String, default: null },
    },
    { timestamps: true }
);

export default mongoose.model('Job', jobSchema);