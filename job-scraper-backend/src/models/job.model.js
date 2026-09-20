import mongoose from 'mongoose';
import { JOB_STATUS } from '../constants/apifyConstants.js';

const jobSchema = new mongoose.Schema(
    {
        jobId: { type: String, required: true, unique: true, index: true },
        // set when a schedule started this run
        scheduleId: { type: String, default: null, index: true },
        skipAlreadySent: { type: Boolean, default: false },
        status: {
            type: String,
            enum: Object.values(JOB_STATUS),
            default: JOB_STATUS.PENDING,
        },
        inputs: {
            // what to search
            keywords: [String],
            location: String,
            platforms: [String],
            jobsPerKeyword: Number,
            postedWithin: { type: String, default: 'any' },
            maxJobsPerCompany: { type: Number, default: 0 },

            // filters
            companySizes: [String],
            includeUnknownSize: { type: Boolean, default: false },
            filterKeywords: [String],
            filterMatchIn: [String],
            excludeWords: [String],
            excludeMatchIn: [String],
            wholeWordMatch: { type: Boolean, default: true },
            includeIndustries: [String],
            excludeIndustries: [String],
            excludeCompanies: [String],
            seniorityLevels: [String],
            employmentTypes: [String],
            agencyMode: { type: String, default: 'remove' },

            // where results go
            webhookUrl: String,
            deliveryMode: { type: String, default: 'job' },
            cooldownDays: { type: Number, default: 21 },
            findMissingDomains: { type: Boolean, default: true },
            extractSalaries: { type: Boolean, default: true },
            salaryMin: { type: Number, default: null },
            salaryMax: { type: Number, default: null },
            includeNoSalary: { type: Boolean, default: true },
            // minutes between keyword searches (0 = launch everything at once)
            launchSpacingMinutes: { type: Number, default: 0 },
        },
        apifyRuns: [
            {
                runId: String,
                platform: String,
                keyword: String,
                status: String,
            },
        ],
        // keyword × platform searches not launched yet (spaced launches)
        pendingLaunches: [
            {
                keyword: String,
                platform: String,
                launchAt: Date,
            },
        ],
        scrapedJobs: { type: Array, default: [] },
        filteredJobs: { type: Array, default: [] },
        removedJobs: { type: Array, default: [] },
        // reason -> count, so the UI can say why rows went away
        removedByReason: { type: Object, default: {} },
        companiesCount: { type: Number, default: 0 },
        domainStats: { type: Object, default: null },
        salaryStats: { type: Object, default: null },
        delivery: {
            state: { type: String, default: null },
            total: { type: Number, default: 0 },
            sent: { type: Number, default: 0 },
            failed: { type: Number, default: 0 },
            lastError: { type: String, default: null },
            finishedAt: { type: Date, default: null },
        },
        error: { type: String, default: null },
        emptyReason: { type: String, default: null },
    },
    { timestamps: true, minimize: false }
);

export default mongoose.model('Job', jobSchema);
