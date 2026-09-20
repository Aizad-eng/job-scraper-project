import Job from '../models/job.model.js';
import { parseInputs, launchSearch } from '../services/search.service.js';
import { JOB_STATUS, JOB_STATUS_LABELS } from '../constants/apifyConstants.js';

export const startScrape = async (req, res) => {
    let inputs;
    try {
        inputs = parseInputs(req.body);
    } catch (error) {
        return res.status(400).json({ success: false, error: error.message });
    }

    try {
        const job = await launchSearch(inputs);
        res.json({
            success: true,
            jobId: job.jobId,
            status: job.status,
            totalRuns: job.apifyRuns.length,
        });
    } catch (error) {
        console.error('Apify error:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
};

export const getJobStatus = async (req, res) => {
    try {
        const job = await Job.findOne({ jobId: req.params.jobId }).lean();
        if (!job) return res.status(404).json({ success: false, error: 'Job not found' });

        res.json({
            jobId: job.jobId,
            scheduleId: job.scheduleId || null,
            status: job.status,
            statusLabel: JOB_STATUS_LABELS[job.status] || job.status,
            isDone: job.status === JOB_STATUS.DONE,
            isFailed: job.status === JOB_STATUS.FAILED,
            isEmpty: job.status === JOB_STATUS.EMPTY,
            totalRuns: job.apifyRuns?.length || 0,
            completedRuns: (job.apifyRuns || []).filter((r) => r.status !== 'RUNNING').length,
            pendingRuns: job.pendingLaunches?.length || 0,
            nextLaunchAt: job.pendingLaunches?.length
                ? job.pendingLaunches.reduce((min, p) => (p.launchAt < min ? p.launchAt : min), job.pendingLaunches[0].launchAt)
                : null,
            scrapedCount: job.scrapedJobs?.length || 0,
            keptCount: job.filteredJobs?.length || 0,
            removedCount: job.removedJobs?.length || 0,
            removedByReason: job.removedByReason || {},
            companiesCount: job.companiesCount || 0,
            domainStats: job.domainStats || null,
            salaryStats: job.salaryStats || null,
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
