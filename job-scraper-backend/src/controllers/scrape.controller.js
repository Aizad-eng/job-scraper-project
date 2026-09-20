import { randomUUID } from 'crypto';
import Job from '../models/job.model.js';
import { triggerActorRun } from '../services/apify.service.js';
import { JOB_STATUS, JOB_STATUS_LABELS, PLATFORMS } from '../constants/apifyConstants.js';
import { AGENCY_MODE, DEFAULT_AGENCY_MODE, DEFAULT_MATCH_IN, COMPANY_SIZE_BANDS } from '../constants/filterConstants.js';
import { DELIVERY_MODE, DEFAULT_DELIVERY_MODE } from '../constants/deliveryConstants.js';

const cleanList = (value) => {
    if (!Array.isArray(value)) return [];
    const seen = new Set();
    return value
        .map((item) => String(item ?? '').trim())
        .filter((item) => item && !seen.has(item.toLowerCase()) && seen.add(item.toLowerCase()));
};

const oneOf = (value, allowed, fallback) => (allowed.includes(value) ? value : fallback);

export const isValidWebhookUrl = (value) => {
    try {
        const url = new URL(String(value || ''));
        return url.protocol === 'https:' || url.protocol === 'http:';
    } catch {
        return false;
    }
};

export const startScrape = async (req, res) => {
    try {
        const body = req.body || {};

        const inputs = {
            keywords: cleanList(body.keywords),
            location: String(body.location || '').trim(),
            platforms: cleanList(body.platforms).filter((p) => Object.values(PLATFORMS).includes(p)),
            jobsPerKeyword: Math.min(Math.max(Number(body.jobsPerKeyword) || 25, 1), 1000),
            postedWithin: body.postedWithin || 'any',
            maxJobsPerCompany: Math.min(Math.max(Number(body.maxJobsPerCompany) || 0, 0), 50),

            companySizes: cleanList(body.companySizes).filter((v) => COMPANY_SIZE_BANDS.some((b) => b.value === v)),
            includeUnknownSize: Boolean(body.includeUnknownSize),
            filterKeywords: cleanList(body.filterKeywords),
            filterMatchIn: cleanList(body.filterMatchIn).length ? cleanList(body.filterMatchIn) : DEFAULT_MATCH_IN,
            excludeWords: cleanList(body.excludeWords),
            excludeMatchIn: cleanList(body.excludeMatchIn).length ? cleanList(body.excludeMatchIn) : DEFAULT_MATCH_IN,
            includeIndustries: cleanList(body.includeIndustries),
            excludeIndustries: cleanList(body.excludeIndustries),
            excludeCompanies: cleanList(body.excludeCompanies),
            seniorityLevels: cleanList(body.seniorityLevels),
            employmentTypes: cleanList(body.employmentTypes),
            agencyMode: oneOf(body.agencyMode, Object.values(AGENCY_MODE), DEFAULT_AGENCY_MODE),

            webhookUrl: String(body.webhookUrl || '').trim(),
            deliveryMode: oneOf(body.deliveryMode, Object.values(DELIVERY_MODE), DEFAULT_DELIVERY_MODE),
        };

        if (!inputs.keywords.length) {
            return res.status(400).json({ success: false, error: 'Add at least one job title to search.' });
        }
        if (!inputs.platforms.length) {
            return res.status(400).json({ success: false, error: 'Pick at least one job board.' });
        }
        if (!isValidWebhookUrl(inputs.webhookUrl)) {
            return res.status(400).json({ success: false, error: 'Enter a valid webhook URL (must start with https://).' });
        }

        const jobId = randomUUID();
        const job = await Job.create({
            jobId,
            status: JOB_STATUS.SCRAPING,
            inputs,
        });

        const callbackUrl = `${process.env.PUBLIC_BASE_URL}/api/apify-webhook?s=${process.env.WEBHOOK_SECRET}`;
        const apifyRuns = [];

        // multiple keywords => multiple queries, one per platform
        for (const keyword of inputs.keywords) {
            for (const platform of inputs.platforms) {
                const runId = await triggerActorRun(
                    platform,
                    {
                        keyword,
                        location: inputs.location,
                        jobsPerKeyword: inputs.jobsPerKeyword,
                        postedWithin: inputs.postedWithin,
                        maxJobsPerCompany: inputs.maxJobsPerCompany,
                    },
                    callbackUrl
                );

                apifyRuns.push({ runId, platform, keyword, status: 'RUNNING' });
            }
        }

        job.apifyRuns = apifyRuns;
        await job.save();

        res.json({
            success: true,
            jobId,
            status: job.status,
            totalRuns: apifyRuns.length,
        });
    } catch (error) {
        console.error('Apify error:', error.response?.data || error.message);
        res.status(500).json({ success: false, error: error.response?.data?.error?.message || error.message });
    }
};

export const getJobStatus = async (req, res) => {
    try {
        const job = await Job.findOne({ jobId: req.params.jobId }).lean();
        if (!job) return res.status(404).json({ success: false, error: 'Job not found' });

        res.json({
            jobId: job.jobId,
            status: job.status,
            statusLabel: JOB_STATUS_LABELS[job.status] || job.status,
            isDone: job.status === JOB_STATUS.DONE,
            isFailed: job.status === JOB_STATUS.FAILED,
            isEmpty: job.status === JOB_STATUS.EMPTY,
            totalRuns: job.apifyRuns?.length || 0,
            completedRuns: (job.apifyRuns || []).filter((r) => r.status !== 'RUNNING').length,
            scrapedCount: job.scrapedJobs?.length || 0,
            keptCount: job.filteredJobs?.length || 0,
            removedCount: job.removedJobs?.length || 0,
            removedByReason: job.removedByReason || {},
            companiesCount: job.companiesCount || 0,
            delivery: job.delivery || null,
            emptyReason: job.emptyReason,
            error: job.error,
            createdAt: job.createdAt,
            updatedAt: job.updatedAt,
            inputs: job.inputs,
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};
