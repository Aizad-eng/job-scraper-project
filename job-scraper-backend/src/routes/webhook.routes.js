import express from 'express';
import { handleApifyWebhook } from '../controllers/webhook.controller.js';
import { handleAiArkWebhook } from '../controllers/aiarkWebhook.controller.js';
import { requireWebhookSecret } from '../middleware/auth.js';

const router = express.Router();

// Called by Apify / AI-Ark, not by a browser. Guarded by WEBHOOK_SECRET,
// which is appended to the callback URL when the run is registered.
router.post('/apify-webhook', requireWebhookSecret, handleApifyWebhook);
router.post('/aiark-webhook', requireWebhookSecret, handleAiArkWebhook);

export default router;
