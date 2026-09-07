import { randomUUID } from 'crypto';
import Job from '../models/job.model.js';
import { triggerActorRun } from '../services/apify.service.js';
import { JOB_STATUS, JOB_STATUS_LABELS, DEFAULT_STAFFING_WORDS } from '../constants/apifyConstants.js';

export const startScrape = async (req, res) => {
    try {
        const {
            keywords,
            location,
            employeeCountMin,
            employeeCountMax,
            personaTitles,
            platforms,
            jobsPerKeyword,
            postedWithin = 'any',
            filterKeywords = [],
            filterMatchIn = ['title'],
            needEmail = true,
            needPhone = false
        } = req.body;

        if (!keywords?.length || !platforms?.length) {
            return res.status(400).json({
                success: false,
                error: "Keywords and platforms are required"
            });
        }

        const jobId = randomUUID();
        const job = await Job.create({
            jobId,
            status: JOB_STATUS.SCRAPING,
            inputs: {
                keywords,
                location,
                employeeCountMin,
                employeeCountMax,
                personaTitles,
                platforms,
                jobsPerKeyword,
                postedWithin,
                filterKeywords,
                filterMatchIn,
                needEmail,
                needPhone,
            },
        });

        const webhookUrl = `${process.env.PUBLIC_BASE_URL}/api/apify-webhook?s=${process.env.WEBHOOK_SECRET}`;
        const apifyRuns = [];

        // multiple keywords => multiple queries, one per platform
        for (const keyword of keywords) {
            for (const platform of platforms) {
                const runId = await triggerActorRun(
                    platform,
                    {
                        keyword,
                        location,
                        jobsPerKeyword,
                        postedWithin,
                    },
                    webhookUrl
                );

                apifyRuns.push({ runId, platform, keyword, status: 'Running' });
            }
        }

        job.apifyRuns = apifyRuns;
        await job.save();

        res.json({
            success: true,
            jobId,
            status: job.status,
            totalRuns: apifyRuns.length
        });

    }
    catch (error) {
        console.error('Apify error:', error.response?.data || error.message);
        res.status(500).json({ error: error.response?.data?.error?.message || error.message });
    }
};

export const getJobStatus = async (req, res) => {
    try {
        const job = await Job.findOne({ jobId: req.params.jobId });
        if (!job) return res.status(404).json({ error: 'Job not found' });

        res.json({
            jobId: job.jobId,
            status: job.status,
            statusLabel: JOB_STATUS_LABELS[job.status] || job.status,
            isReady: job.status === JOB_STATUS.READY,
            isFailed: job.status === JOB_STATUS.FAILED,
            totalRuns: job.apifyRuns.length,
            completedRuns: job.apifyRuns.filter((r) => r.status !== 'RUNNING').length,
            scrapedCount: job.scrapedJobs.length,
            companiesCount: job.cleanedCompanies?.length || 0,
            contactsCount: job.contacts?.length || 0,
            emailsFound: job.contacts?.filter((c) => c.email).length || 0,
            phonesFound: job.contacts?.filter((c) => c.mobilePhone).length || 0,
            isEmpty: job.status === JOB_STATUS.EMPTY,
            emptyReason: job.emptyReason,
            error: job.error,
            createdAt: job.createdAt,
            updatedAt: job.updatedAt,
            inputs: job.inputs,
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

