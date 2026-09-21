import express from 'express';
import { getJobStatus, startScrape } from '../controllers/scrape.controller.js';
import { testWebhook } from '../controllers/testWebhook.controller.js';
import { reprocessJob } from '../controllers/reprocess.controller.js';
import { requireAccessKey } from '../middleware/auth.js';

const router = express.Router();

// The gate is attached per-route, NOT via router.use(). A router.use() here
// would run for every /api/* request, including the Apify webhook mounted on
// the same prefix, and would reject it.
router.post('/scrape', requireAccessKey, startScrape);
router.get('/job-status/:jobId', requireAccessKey, getJobStatus);
router.post('/test-webhook', requireAccessKey, testWebhook);
router.post('/jobs/:jobId/reprocess', requireAccessKey, reprocessJob);

export default router;
