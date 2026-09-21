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
            dropBankVps: { type: Boolean, default: false },
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
            cleanTitles: { type: Boolean, default: true },
            salaryMin: { type: Number, default: null },
            salaryMax: { type: Number, default: null },
            includeNoSalary: { type: Boolean, default: true },
            // minutes between keyword searches (0 = launch everything at once)
            launchSpacingMinutes: { type: Number, default: 0 },
            // actor runs this search may have in flight at once (global cap still applies)
            maxConcurrentRuns: { type: Number, default: 5 },
        },
        apifyRuns: [
            {
                runId: String,
                platform: String,
                keyword: String,
                status: String,
                error: String,
                startedAt: Date,
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
        // Runs from before the Listing collection stored listings here.
        scrapedJobs: { type: Array, default: undefined },
        // Listings live in the Listing collection. The job keeps counts.
        scrapedCount: { type: Number, default: 0 },     // everything the actors returned
        keptCount: { type: Number, default: 0 },        // passed dedupe + rule filters
        finalCount: { type: Number, default: 0 },       // still kept after every later stage
        // reason -> count, so the UI can say why rows went away
        removedByReason: { type: Object, default: {} },
        // a short sample of removed listings, for debugging
        removedSamples: { type: Array, default: [] },
        companiesCount: { type: Number, default: 0 },
        domainStats: { type: Object, default: null },
        salaryStats: { type: Object, default: null },
        agencyCheck: { type: Object, default: null },
        // what the pipeline is doing right now: { label, done, total, updatedAt }
        progress: { type: Object, default: null },
        // when each stage started / ended, for per-stage durations
        stageTimes: { type: Object, default: {} },
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
