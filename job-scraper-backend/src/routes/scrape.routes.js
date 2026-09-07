import express from 'express';
import { getJobStatus, startScrape } from '../controllers/scrape.controller.js';
import { downloadResults } from '../controllers/export.controller.js';
import { requireAccessKey } from '../middleware/auth.js';

const router = express.Router();

// The gate is attached per-route, NOT via router.use(). A router.use() here
// would run for every /api/* request, including the Apify and AI-Ark
// webhooks mounted on the same prefix, and would reject them.
//
// Each of these costs money (Apify runs, OpenAI/Perplexity calls, AI-Ark
// contact credits) or exposes scraped data, so all three are gated.
router.post('/scrape', requireAccessKey, startScrape);
router.get('/job-status/:jobId', requireAccessKey, getJobStatus);
router.get('/download/:jobId', requireAccessKey, downloadResults);

export default router;
