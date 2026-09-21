import { randomUUID } from 'crypto';
import Job from '../models/job.model.js';
import { fetchRunMeta } from '../services/apify.service.js';
import { applyRunOutcome, finishJobIfComplete } from './webhook.controller.js';
import { JOB_STATUS } from '../constants/apifyConstants.js';

/**
 * POST /jobs/:jobId/reprocess  { runIds?: [] }
 * Creates a new run with the same settings and feeds it the datasets of
 * Apify runs that already exist — the source job's own runs by default, or
 * any run ids given. No actors are started. Responds with the new jobId at
 * once; ingestion and the pipeline continue in the background.
 */
export const reprocessJob = async (req, res) => {
    try {
        const source = await Job.findOne({ jobId: req.params.jobId }).lean();
        if (!source) return res.status(404).json({ success: false, error: 'Job not found' });

        const given = Array.isArray(req.body?.runIds) ? req.body.runIds.map(String).map((s) => s.trim()).filter(Boolean) : [];
        let runs;

        if (given.length) {
            runs = [];
            for (const runId of given) {
                const meta = await fetchRunMeta(runId);
                if (meta.status !== 'SUCCEEDED') throw new Error(`Run ${runId} is ${meta.status}, not SUCCEEDED.`);
                if (!meta.platform) throw new Error(`Run ${runId} is not from a LinkedIn or Indeed actor this app knows.`);
                runs.push({ runId, platform: meta.platform, keyword: meta.keyword || source.inputs.keywords?.[0] || null });
            }
        } else {
            runs = (source.apifyRuns || [])
                .filter((r) => r.runId && String(r.status).toUpperCase() === 'SUCCEEDED')
                .map((r) => ({ runId: r.runId, platform: r.platform, keyword: r.keyword }));
        }

        if (!runs.length) {
            return res.status(400).json({ success: false, error: 'No finished Apify runs to reprocess. Paste run ids, or pick a job whose scrapes finished.' });
        }

        const jobId = randomUUID();
        await Job.create({
            jobId,
            status: JOB_STATUS.SCRAPING,
            inputs: source.inputs,
            scheduleId: source.scheduleId || null,
            skipAlreadySent: source.skipAlreadySent || false,
            reprocessedFrom: source.jobId,
            apifyRuns: runs.map((r) => ({ ...r, status: 'IMPORTING', startedAt: new Date() })),
            pendingLaunches: [],
            stageTimes: { scraping: { startedAt: new Date() } },
            progress: { label: 'Importing Apify datasets', done: 0, total: runs.length, updatedAt: new Date() },
        });

        res.json({ success: true, jobId, runs: runs.length });

        // background: pull each dataset through the normal ingestion path
        (async () => {
            let done = 0;
            for (const run of runs) {
                try {
                    await applyRunOutcome(run.runId, 'SUCCEEDED', { jobId });
                } catch (error) {
                    console.error(`Job ${jobId}: import of run ${run.runId} failed:`, error.message);
                    await Job.updateOne({ jobId, 'apifyRuns.runId': run.runId }, { $set: { 'apifyRuns.$.status': 'FAILED', 'apifyRuns.$.error': error.message } });
                }
                done += 1;
                await Job.updateOne({ jobId }, { $set: { progress: { label: 'Importing Apify datasets', done, total: runs.length, updatedAt: new Date() } } });
            }
            await finishJobIfComplete(jobId);
        })().catch((error) => console.error(`Job ${jobId}: reprocess failed:`, error.message));
    } catch (error) {
        res.status(400).json({ success: false, error: error.response?.data?.error?.message || error.message });
    }
};
