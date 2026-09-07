import Job from '../models/job.model.js';
import {
    collectExportResults,
    getExportStatistics,
    enrichWithPhones,
} from '../services/contactLookup.service.js';
import { capContactsPerCompany } from '../helpers/contactHelpers.js';
import { JOB_STATUS } from '../constants/apifyConstants.js';

export const handleAiArkWebhook = async (req, res) => {
    res.status(200).send('OK');

    try {
        const trackId = req.body?.trackId || req.body?.data?.trackId;
        if (!trackId) return;

        const job = await Job.findOne({ 'aiArkExport.trackId': trackId });
        if (!job) {
            console.warn(`No job found for AI-Ark trackId ${trackId}`);
            return;
        }

        const delivered = await collectExportResults(trackId);

        // Reconcile: what AI-Ark says it produced vs what we actually received
        // vs what survives our own filtering. Every one of these was paid for,
        // so any gap between them is money spent on discarded records.
        const statistics = await getExportStatistics(trackId);
        const reported = statistics?.statistics?.total ?? null;

        const { kept, droppedNoCompany } = capContactsPerCompany(delivered);

        console.log(
            `Job ${job.jobId} export ${trackId}: ` +
            `${reported ?? 'unknown'} reported by AI-Ark, ${delivered.length} received, ` +
            `${droppedNoCompany} without a company, ${kept.length} kept`
        );

        if (reported !== null && reported !== delivered.length) {
            console.warn(
                `Job ${job.jobId}: paid for ${reported} records but only collected ${delivered.length}`
            );
        }

        job.aiArkExport.reportedTotal = reported;
        job.aiArkExport.deliveredCount = delivered.length;

        let contacts = kept;

        if (job.inputs.needPhone) {
            contacts = await enrichWithPhones(contacts);
        }

        if (!contacts.length) {
            job.status = JOB_STATUS.EMPTY;
            job.emptyReason = 'Companies were found, but nobody at them matched your persona titles. Try broadening the titles.';
            job.aiArkExport.state = 'DONE';
            job.markModified('aiArkExport');
            await job.save();
            return;
        }

        job.contacts = contacts;
        job.aiArkExport.state = 'DONE';
        job.status = JOB_STATUS.READY;
        job.markModified('contacts');
        job.markModified('aiArkExport');
        await job.save();

        console.log(`Job ${job.jobId}: ${contacts.length} contacts collected`);
    } catch (error) {
        console.error('AI-Ark webhook error:', error.message);
    }
};